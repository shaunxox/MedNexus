import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
import json
import random
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)

# ── PUT YOUR GEMINI API KEY HERE ──
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# ════════════════════════════════════════
#  DATA.JSON HELPERS
# ════════════════════════════════════════

DATA_FILE = "data.json"

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
You are MedNexus Patient Assistant — a caring, friendly AI agent inside a hospital management system.

Your job:
- Listen to the patient's symptoms with empathy
- Ask smart follow-up questions ONE at a time
- Give a preliminary assessment (always clarify it's not a diagnosis)
- Recommend a doctor from the available list below
- When patient agrees to book, confirm it warmly

Available doctors on duty right now:
{doctor_list}

Rules:
- Always be warm, calm and reassuring
- Never give a definitive medical diagnosis
- If symptoms sound serious (chest pain, difficulty breathing, stroke signs),
  immediately advise emergency
- Keep responses short and easy to understand
- When patient confirms booking, end your response with exactly:
  BOOKING_CONFIRMED:[doctor name]|[specialty]
  Example: BOOKING_CONFIRMED:Dr. Priya Nair|General Medicine
"""

DOCTOR_PROMPT = """
You are MedNexus Doctor Assistant — a professional clinical AI inside a hospital management system.

You will receive patient symptoms. Your job:
- Summarize the symptoms clearly
- Give top 3 possible diagnoses ranked by likelihood with brief reasoning
- Recommend relevant tests or investigations
- Suggest a treatment approach
- Flag any red flags or urgent concerns

Rules:
- Be clinical, precise and professional
- Always present multiple diagnoses
- Remind that final decisions rest with the doctor
- Use medical terms but also explain them simply
"""

def get_admin_prompt():
    data = read_data()
    stats = data["stats"]
    queue = data["queue"]
    doctors = data["doctors"]
    on_duty = len([d for d in doctors if d["status"] == "on_duty"])
    pending = len([q for q in queue if q["status"] == "waiting"])

    return f"""
You are MedNexus Admin Assistant — an efficient AI managing hospital operations.

Current Live Hospital Data:
- Total Beds: {stats['total_beds']} | Occupied: {stats['occupied_beds']} | Available: {stats['total_beds'] - stats['occupied_beds']}
- ICU Beds: {stats['icu_total']} | Occupied: {stats['icu_occupied']} | Available: {stats['icu_total'] - stats['icu_occupied']}
- Doctors on duty: {on_duty}
- Patients in queue: {pending}
- Emergency cases today: {stats['emergency_cases']}

Your job:
- Answer questions about hospital operations using the data above
- Suggest optimizations and flag critical issues
- Be direct, efficient and data-focused
- Always provide numbers and actionable suggestions
"""

# ════════════════════════════════════════
#  CHAT HISTORIES
# ════════════════════════════════════════

chat_histories = {
    "patient": [],
    "doctor":  [],
    "admin":   []
}

def chat_with_agent(agent, user_message, system_prompt):
    try:
        history = chat_histories[agent]
        full_prompt = system_prompt + "\n\n"
        for msg in history[-10:]:
            role = "Patient" if msg["role"] == "user" else "Assistant"
            full_prompt += f"{role}: {msg['content']}\n"
        full_prompt += f"User: {user_message}\nAssistant:"

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=full_prompt
        )
        reply = response.text.strip()

        chat_histories[agent].append({"role": "user",      "content": user_message})
        chat_histories[agent].append({"role": "assistant", "content": reply})

        return reply
    except Exception as e:
        return f"Error contacting AI: {str(e)}"

# ════════════════════════════════════════
#  AUTH ROUTES
# ════════════════════════════════════════

@app.route("/api/register", methods=["POST"])
def register():
    data_body = request.get_json()
    name     = data_body.get("name", "").strip()
    age      = data_body.get("age", "").strip()
    email    = data_body.get("email", "").strip().lower()
    password = data_body.get("password", "").strip()
    role     = data_body.get("role", "").strip().lower()

    if not name or not age or not email or not password or not role:
        return jsonify({"error": "All fields are required"}), 400

    if role not in ["patient", "doctor", "admin"]:
        return jsonify({"error": "Invalid role"}), 400

    data = read_data()
    existing = next((u for u in data["users"] if u["email"] == email), None)
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    new_user = {
        "id":       len(data["users"]) + 1,
        "name":     name,
        "age":      age,
        "email":    email,
        "password": password,
        "role":     role
    }
    data["users"].append(new_user)
    write_data(data)

    return jsonify({
        "status": "success",
        "role":   role,
        "name":   name,
        "age":    age,
        "email":  email
    })


@app.route("/api/login", methods=["POST"])
def login():
    data_body = request.get_json()
    email    = data_body.get("email", "").strip().lower()
    password = data_body.get("password", "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    data = read_data()
    user = next((u for u in data["users"] if u["email"] == email), None)

    if not user or user["password"] != password:
        return jsonify({"error": "Invalid email or password"}), 401

    return jsonify({
        "status": "success",
        "role":   user["role"],
        "name":   user["name"],
        "age":    user["age"],
        "email":  email
    })

# ════════════════════════════════════════
#  PATIENT ROUTES
# ════════════════════════════════════════

@app.route("/api/patient", methods=["POST"])
def patient_agent():
    data_body = request.get_json()
    message = data_body.get("message", "")
    if not message:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("patient", message, get_patient_prompt())

    booking = None
    if "BOOKING_CONFIRMED:" in reply:
        try:
            booking_part = reply.split("BOOKING_CONFIRMED:")[1].strip()
            doctor_name, specialty = booking_part.split("|")

            data = read_data()
            token_number = random.randint(100, 999)
            position = len([q for q in data["queue"] if q["status"] == "waiting"]) + 1

            token = {
                "token":     token_number,
                "doctor":    doctor_name.strip(),
                "specialty": specialty.strip(),
                "symptoms":  message,
                "status":    "waiting",
                "position":  position,
                "wait_time": position * 15,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            data["queue"].append(token)
            write_data(data)

            clean_reply = reply.split("BOOKING_CONFIRMED:")[0].strip()
            booking = token
            reply = clean_reply
        except Exception as e:
            print(f"Booking parse error: {e}")

    return jsonify({"reply": reply, "agent": "patient", "booking": booking})


@app.route("/api/prescription", methods=["POST"])
def prescription_summarizer():
    data_body = request.get_json()
    prescription = data_body.get("prescription", "")
    if not prescription:
        return jsonify({"error": "No prescription provided"}), 400

    prompt = f"""
You are a helpful medical assistant explaining a prescription to a patient in simple words.

For each medicine in the prescription below:
- State the medicine name
- Explain what it is used for in simple language
- Explain the dosage clearly
- Flag any important warnings (take with food, avoid alcohol, causes drowsiness, etc.)

Use simple language a non-medical person can understand. Format clearly.

Prescription:
{prescription}
"""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt
        )
        return jsonify({"reply": response.text.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/feedback", methods=["POST"])
def submit_feedback():
    data_body = request.get_json()
    rating  = data_body.get("rating")
    comment = data_body.get("comment", "")
    if not rating:
        return jsonify({"error": "Rating required"}), 400

    data = read_data()
    feedback = {
        "id":        len(data["feedback"]) + 1,
        "rating":    rating,
        "comment":   comment,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    data["feedback"].append(feedback)
    write_data(data)
    return jsonify({"status": "Feedback submitted!", "feedback": feedback})

# ════════════════════════════════════════
#  DOCTOR ROUTES
# ════════════════════════════════════════

@app.route("/api/doctor", methods=["POST"])
def doctor_agent():
    data_body = request.get_json()
    message = data_body.get("message", "")
    if not message:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("doctor", message, DOCTOR_PROMPT)
    return jsonify({"reply": reply, "agent": "doctor"})


@app.route("/api/queue", methods=["GET"])
def get_queue():
    data = read_data()
    return jsonify({"queue": data["queue"]})


@app.route("/api/queue/done/<int:token>", methods=["POST"])
def mark_done(token):
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
    return jsonify({"status": "Token marked as done"})


@app.route("/api/prescription/save", methods=["POST"])
def save_prescription():
    data_body = request.get_json()
    token        = data_body.get("token")
    prescription = data_body.get("prescription", "")
    if not token or not prescription:
        return jsonify({"error": "Token and prescription required"}), 400

    data = read_data()
    for item in data["queue"]:
        if item["token"] == token:
            item["prescription"] = prescription
            break
    write_data(data)
    return jsonify({"status": "Prescription saved"})

# ════════════════════════════════════════
#  ADMIN ROUTES
# ════════════════════════════════════════

@app.route("/api/admin", methods=["POST"])
def admin_agent():
    data_body = request.get_json()
    message = data_body.get("message", "")
    if not message:
        return jsonify({"error": "No message provided"}), 400

    reply = chat_with_agent("admin", message, get_admin_prompt())
    return jsonify({"reply": reply, "agent": "admin"})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    data = read_data()
    stats = data["stats"]
    queue = data["queue"]
    stats["pending_tokens"]  = len([q for q in queue if q["status"] == "waiting"])
    stats["doctors_on_duty"] = len([d for d in data["doctors"] if d["status"] == "on_duty"])
    return jsonify({"stats": stats})


@app.route("/api/doctors", methods=["GET"])
def get_doctors():
    data = read_data()
    return jsonify({"doctors": data["doctors"]})


@app.route("/api/doctors/add", methods=["POST"])
def add_doctor():
    data_body = request.get_json()
    name      = data_body.get("name", "")
    specialty = data_body.get("specialty", "")
    contact   = data_body.get("contact", "")
    if not name or not specialty:
        return jsonify({"error": "Name and specialty required"}), 400

    data = read_data()
    new_id = max([d["id"] for d in data["doctors"]], default=0) + 1
    doctor = {
        "id":        new_id,
        "name":      name,
        "specialty": specialty,
        "contact":   contact,
        "status":    "on_duty"
    }
    data["doctors"].append(doctor)
    write_data(data)
    return jsonify({"status": "Doctor added!", "doctor": doctor})


@app.route("/api/doctors/remove/<int:doctor_id>", methods=["DELETE"])
def remove_doctor(doctor_id):
    data = read_data()
    data["doctors"] = [d for d in data["doctors"] if d["id"] != doctor_id]
    write_data(data)
    return jsonify({"status": "Doctor removed!"})


@app.route("/api/doctors/toggle/<int:doctor_id>", methods=["POST"])
def toggle_doctor_status(doctor_id):
    data = read_data()
    for doctor in data["doctors"]:
        if doctor["id"] == doctor_id:
            doctor["status"] = "off_duty" if doctor["status"] == "on_duty" else "on_duty"
            break
    write_data(data)
    return jsonify({"status": "Doctor status updated"})


@app.route("/api/feedback/all", methods=["GET"])
def get_feedback():
    data = read_data()
    return jsonify({"feedback": data["feedback"]})

# ════════════════════════════════════════
#  RESET & HOME
# ════════════════════════════════════════

@app.route("/")
def home():
    return jsonify({
        "status": "MedNexus backend is running!",
        "agents": ["patient", "doctor", "admin"]
    })

@app.route("/api/reset/<agent>", methods=["POST"])
def reset_chat(agent):
    if agent in chat_histories:
        chat_histories[agent] = []
        return jsonify({"status": f"{agent} chat history cleared"})
    return jsonify({"error": "Invalid agent"}), 400

# ════════════════════════════════════════
#  RUN
# ════════════════════════════════════════

if __name__ == "__main__":
    print("MedNexus backend starting...")
    print("Patient Agent ready")
    print("Doctor Agent ready")
    print("Admin Agent ready")
    print("Running on http://localhost:5000")
    app.run(debug=True, port=5000)