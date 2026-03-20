import os
import json
import random
import requests
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app, origins="*")

# ════════════════════════════════════════
#  OPENROUTER CONFIG
# ════════════════════════════════════════

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_NAME = "z-ai/glm-4.5-air:free"
FALLBACK_MODEL = "arcee-ai/arcee-trinity-mini:fre"

# ════════════════════════════════════════
#  HARDCODED PASSWORDS FOR DOCTOR & ADMIN
#  (Share these in your README privately)
# ════════════════════════════════════════

DOCTOR_PASSWORD = "doctor@mednexus"
ADMIN_PASSWORD  = "admin@mednexus"

# ════════════════════════════════════════
#  DATA.JSON AUTO-CREATE
# ════════════════════════════════════════

DATA_FILE = "data.json"

if not os.path.exists(DATA_FILE):
    default_data = {
        "users": [],
        "doctors": [],
        "queue": [],
        "feedback": [],
        "stats": {
            "total_beds": 100,
            "occupied_beds": 60,
            "icu_total": 20,
            "icu_occupied": 8,
            "emergency_cases": 3
        }
    }
    with open(DATA_FILE, "w") as f:
        json.dump(default_data, f, indent=2)
    print("✅ data.json created with default values")

# ════════════════════════════════════════
#  DATA.JSON HELPERS
# ════════════════════════════════════════

def read_data():
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def write_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

# ════════════════════════════════════════
#  SYSTEM PROMPTS
# ════════════════════════════════════════

def get_patient_prompt():
    data = read_data()
    on_duty = [d for d in data["doctors"] if d["status"] == "on_duty"]
    doctor_list = "\n".join([f"- {d['name']} ({d['specialty']})" for d in on_duty])

    return f"""
You are MedNexus Patient Assistant — a caring AI.

Available doctors:
{doctor_list}

Rules:
- Be warm and short
- No diagnosis
- Ask 1 question at a time
- If serious → advise emergency immediately
- When patient confirms booking, end with exactly:
  BOOKING_CONFIRMED:[doctor name]|[specialty]
"""

DOCTOR_PROMPT = """
You are a clinical AI assistant.

- Summarize symptoms clearly
- Give top 3 diagnoses with reasoning
- Suggest relevant tests
- Suggest treatment approach
- Mention red flags or urgent concerns
"""

def get_admin_prompt():
    data = read_data()
    stats = data["stats"]
    queue = data["queue"]
    doctors = data["doctors"]

    on_duty = len([d for d in doctors if d["status"] == "on_duty"])
    pending = len([q for q in queue if q["status"] == "waiting"])

    return f"""
Hospital Data:
Beds: {stats['occupied_beds']}/{stats['total_beds']}
ICU: {stats['icu_occupied']}/{stats['icu_total']}
Doctors on duty: {on_duty}
Patients in queue: {pending}
Emergency cases today: {stats['emergency_cases']}

Give insights and actionable suggestions based on this data.
"""

# ════════════════════════════════════════
#  CHAT MEMORY
# ════════════════════════════════════════

chat_histories = {
    "patient": [],
    "doctor": [],
    "admin": []
}

# ════════════════════════════════════════
#  OPENROUTER CHAT FUNCTION
# ════════════════════════════════════════

def openrouter_chat(messages, model):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mednexus-f0i6.onrender.com",
        "X-Title": "MedNexus"
    }

    response = requests.post(
        OPENROUTER_URL,
        headers=headers,
        json={
            "model": model,
            "messages": messages
        },
        timeout=30
    )

    return response.json()


def chat_with_agent(agent, user_message, system_prompt):
    try:
        history = chat_histories[agent]

        messages = [{"role": "system", "content": system_prompt}]

        for msg in history[-10:]:
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })

        messages.append({"role": "user", "content": user_message})

        data = openrouter_chat(messages, MODEL_NAME)

        if "error" in data:
            print(f"Primary model failed: {data['error']} — trying fallback")
            data = openrouter_chat(messages, FALLBACK_MODEL)

        reply = data["choices"][0]["message"]["content"]

        chat_histories[agent].append({"role": "user", "content": user_message})
        chat_histories[agent].append({"role": "assistant", "content": reply})

        return reply.strip()

    except Exception as e:
        return f"Error: {str(e)}"

# ════════════════════════════════════════
#  AUTH — PATIENT (register + login)
# ════════════════════════════════════════

@app.route("/api/register", methods=["POST"])
def register():
    body = request.get_json()

    name     = body.get("name", "").strip()
    age      = body.get("age", "").strip()
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()

    if not name or not age or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    data = read_data()

    if any(u["email"] == email for u in data["users"]):
        return jsonify({"error": "Email already registered"}), 409

    user = {
        "id":       len(data["users"]) + 1,
        "name":     name,
        "age":      age,
        "email":    email,
        "password": password,
        "role":     "patient"
    }

    data["users"].append(user)
    write_data(data)

    return jsonify({"status": "registered", "user": user})


@app.route("/api/login", methods=["POST"])
def login():
    body = request.get_json()
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    data = read_data()
    user = next((u for u in data["users"] if u["email"] == email), None)

    if not user or user["password"] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({"status": "success", "user": user})

# ════════════════════════════════════════
#  AUTH — DOCTOR (password only)
# ════════════════════════════════════════

@app.route("/api/doctor/login", methods=["POST"])
def doctor_login():
    body     = request.get_json()
    password = body.get("password", "").strip()

    if not password:
        return jsonify({"error": "Password required"}), 400

    if password != DOCTOR_PASSWORD:
        return jsonify({"error": "Invalid password"}), 401

    return jsonify({"status": "success", "role": "doctor", "name": "Doctor"})

# ════════════════════════════════════════
#  AUTH — ADMIN (password only)
# ════════════════════════════════════════

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    body     = request.get_json()
    password = body.get("password", "").strip()

    if not password:
        return jsonify({"error": "Password required"}), 400

    if password != ADMIN_PASSWORD:
        return jsonify({"error": "Invalid password"}), 401

    return jsonify({"status": "success", "role": "admin", "name": "Admin"})

# ════════════════════════════════════════
#  PATIENT AGENT
# ════════════════════════════════════════

@app.route("/api/patient", methods=["POST"])
def patient():
    body = request.get_json()
    msg = body.get("message", "").strip()

    if not msg:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("patient", msg, get_patient_prompt())

    booking = None

    if "BOOKING_CONFIRMED:" in reply:
        try:
            info = reply.split("BOOKING_CONFIRMED:")[1].strip()
            doctor, specialty = info.split("|")

            data = read_data()
            waiting_count = len([q for q in data["queue"] if q["status"] == "waiting"])

            token = {
                "token":     random.randint(100, 999),
                "doctor":    doctor.strip(),
                "specialty": specialty.strip(),
                "symptoms":  msg,
                "status":    "waiting",
                "position":  waiting_count + 1,
                "wait_time": waiting_count * 15,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
            }

            data["queue"].append(token)
            write_data(data)

            booking = token
            reply = reply.split("BOOKING_CONFIRMED:")[0].strip()

        except Exception as e:
            print(f"Booking parse error: {e}")

    return jsonify({"reply": reply, "booking": booking})

# ════════════════════════════════════════
#  DOCTOR AGENT
# ════════════════════════════════════════

@app.route("/api/doctor", methods=["POST"])
def doctor():
    body = request.get_json()
    msg = body.get("message", "").strip()

    if not msg:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("doctor", msg, DOCTOR_PROMPT)
    return jsonify({"reply": reply})

# ════════════════════════════════════════
#  ADMIN AGENT
# ════════════════════════════════════════

@app.route("/api/admin", methods=["POST"])
def admin():
    body = request.get_json()
    msg = body.get("message", "").strip()

    if not msg:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("admin", msg, get_admin_prompt())
    return jsonify({"reply": reply})

# ════════════════════════════════════════
#  QUEUE
# ════════════════════════════════════════

@app.route("/api/queue", methods=["GET"])
def queue():
    data = read_data()
    return jsonify({"queue": data["queue"]})


@app.route("/api/queue/done/<int:token>", methods=["POST"])
def queue_done(token):
    data = read_data()
    for item in data["queue"]:
        if item["token"] == token:
            item["status"] = "done"
            break
    position = 1
    for item in data["queue"]:
        if item["status"] == "waiting":
            item["position"] = position
            item["wait_time"] = position * 15
            position += 1
    write_data(data)
    return jsonify({"status": "updated"})

# ════════════════════════════════════════
#  PRESCRIPTION
# ════════════════════════════════════════

@app.route("/api/prescription", methods=["GET"])
def get_prescription():
    token = request.args.get("token", type=int)
    data = read_data()
    for item in data["queue"]:
        if item["token"] == token:
            return jsonify({"prescription": item.get("prescription", None)})
    return jsonify({"prescription": None})


@app.route("/api/prescription", methods=["POST"])
def prescription_summarizer():
    body = request.get_json()
    prescription = body.get("prescription", "").strip()

    if not prescription:
        return jsonify({"error": "No prescription provided"}), 400

    prompt = f"""
You are a helpful medical assistant explaining a prescription to a patient in simple words.

For each medicine:
- Name
- What it's used for (simple language)
- Dosage clearly explained
- Important warnings (take with food, avoid alcohol, causes drowsiness, etc.)

Prescription:
{prescription}
"""
    try:
        messages = [{"role": "user", "content": prompt}]
        data = openrouter_chat(messages, MODEL_NAME)
        if "error" in data:
            data = openrouter_chat(messages, FALLBACK_MODEL)
        reply = data["choices"][0]["message"]["content"]
        return jsonify({"reply": reply.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/prescription/save", methods=["POST"])
def save_prescription():
    body = request.get_json()
    token        = body.get("token")
    prescription = body.get("prescription", "").strip()

    if not token or not prescription:
        return jsonify({"error": "Token and prescription required"}), 400

    data = read_data()
    for item in data["queue"]:
        if item["token"] == token:
            item["prescription"] = prescription
            break
    write_data(data)
    return jsonify({"status": "saved"})

# ════════════════════════════════════════
#  STATS
# ════════════════════════════════════════

@app.route("/api/stats", methods=["GET"])
def get_stats():
    data = read_data()
    stats = data["stats"]
    stats["pending_tokens"]  = len([q for q in data["queue"] if q["status"] == "waiting"])
    stats["doctors_on_duty"] = len([d for d in data["doctors"] if d["status"] == "on_duty"])
    return jsonify({"stats": stats})

# ════════════════════════════════════════
#  DOCTORS
# ════════════════════════════════════════

@app.route("/api/doctors", methods=["GET"])
def get_doctors():
    data = read_data()
    return jsonify({"doctors": data["doctors"]})


@app.route("/api/doctors/add", methods=["POST"])
def add_doctor():
    body = request.get_json()
    name      = body.get("name", "").strip()
    specialty = body.get("specialty", "").strip()
    contact   = body.get("contact", "")

    if not name or not specialty:
        return jsonify({"error": "Name and specialty required"}), 400

    data = read_data()
    doctor = {
        "id":        max([d["id"] for d in data["doctors"]], default=0) + 1,
        "name":      name,
        "specialty": specialty,
        "contact":   contact,
        "status":    "on_duty"
    }
    data["doctors"].append(doctor)
    write_data(data)
    return jsonify({"status": "added", "doctor": doctor})


@app.route("/api/doctors/remove/<int:doctor_id>", methods=["DELETE"])
def remove_doctor(doctor_id):
    data = read_data()
    data["doctors"] = [d for d in data["doctors"] if d["id"] != doctor_id]
    write_data(data)
    return jsonify({"status": "removed"})


@app.route("/api/doctors/toggle/<int:doctor_id>", methods=["POST"])
def toggle_doctor(doctor_id):
    data = read_data()
    for d in data["doctors"]:
        if d["id"] == doctor_id:
            d["status"] = "off_duty" if d["status"] == "on_duty" else "on_duty"
            break
    write_data(data)
    return jsonify({"status": "toggled"})

# ════════════════════════════════════════
#  FEEDBACK
# ════════════════════════════════════════

@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    body = request.get_json()
    rating  = body.get("rating")
    comment = body.get("comment", "")

    if not rating:
        return jsonify({"error": "Rating required"}), 400

    data = read_data()
    if "feedback" not in data:
        data["feedback"] = []

    feedback = {
        "id":        len(data["feedback"]) + 1,
        "rating":    rating,
        "comment":   comment,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    data["feedback"].append(feedback)
    write_data(data)
    return jsonify({"status": "Feedback submitted!", "feedback": feedback})


@app.route("/api/feedback/all", methods=["GET"])
def get_feedback():
    data = read_data()
    return jsonify({"feedback": data.get("feedback", [])})

# ════════════════════════════════════════
#  RESET
# ════════════════════════════════════════

@app.route("/api/reset/<agent>", methods=["POST"])
def reset_chat(agent):
    if agent in chat_histories:
        chat_histories[agent] = []
        return jsonify({"status": f"{agent} chat history cleared"})
    return jsonify({"error": "Invalid agent"}), 400

# ════════════════════════════════════════
#  HOME
# ════════════════════════════════════════

@app.route("/")
def home():
    return jsonify({
        "status": "MedNexus running 🚀",
        "models": {
            "primary":  MODEL_NAME,
            "fallback": FALLBACK_MODEL
        }
    })

# ════════════════════════════════════════
#  RUN
# ════════════════════════════════════════

if __name__ == "__main__":
    print("🚀 MedNexus running with OpenRouter")
    print(f"   Primary model  : {MODEL_NAME}")
    print(f"   Fallback model : {FALLBACK_MODEL}")
    print(f"   Doctor password: {DOCTOR_PASSWORD}")
    print(f"   Admin password : {ADMIN_PASSWORD}")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)