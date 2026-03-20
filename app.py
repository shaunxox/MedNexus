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
CORS(app)

# ════════════════════════════════════════
#  OPENROUTER CONFIG
# ════════════════════════════════════════

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_NAME = "deepseek/deepseek-chat-v3"
FALLBACK_MODEL = "mistralai/mistral-7b-instruct"

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
You are MedNexus Patient Assistant — a caring AI.

Available doctors:
{doctor_list}

Rules:
- Be warm and short
- No diagnosis
- Ask 1 question at a time
- If serious → emergency
- If booking confirmed → 
BOOKING_CONFIRMED:[doctor]|[specialty]
"""

DOCTOR_PROMPT = """
You are a clinical AI.

- Summarize symptoms
- Give top 3 diagnoses
- Suggest tests
- Suggest treatment
- Mention risks
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
Doctors: {on_duty}
Queue: {pending}

Give insights + suggestions
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
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "MedNexus"
    }

    response = requests.post(
        OPENROUTER_URL,
        headers=headers,
        json={
            "model": model,
            "messages": messages
        }
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

        # PRIMARY MODEL
        data = openrouter_chat(messages, MODEL_NAME)

        # FALLBACK if error
        if "error" in data:
            data = openrouter_chat(messages, FALLBACK_MODEL)

        reply = data["choices"][0]["message"]["content"]

        chat_histories[agent].append({"role": "user", "content": user_message})
        chat_histories[agent].append({"role": "assistant", "content": reply})

        return reply.strip()

    except Exception as e:
        return f"Error: {str(e)}"

# ════════════════════════════════════════
#  AUTH ROUTES
# ════════════════════════════════════════

@app.route("/api/register", methods=["POST"])
def register():
    body = request.get_json()

    name = body.get("name")
    age = body.get("age")
    email = body.get("email")
    password = body.get("password")
    role = body.get("role")

    data = read_data()

    if any(u["email"] == email for u in data["users"]):
        return jsonify({"error": "Email exists"}), 409

    user = {
        "id": len(data["users"]) + 1,
        "name": name,
        "age": age,
        "email": email,
        "password": password,
        "role": role
    }

    data["users"].append(user)
    write_data(data)

    return jsonify({"status": "registered", "user": user})


@app.route("/api/login", methods=["POST"])
def login():
    body = request.get_json()
    email = body.get("email")
    password = body.get("password")

    data = read_data()

    user = next((u for u in data["users"] if u["email"] == email), None)

    if not user or user["password"] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({"status": "success", "user": user})

# ════════════════════════════════════════
#  PATIENT
# ════════════════════════════════════════

@app.route("/api/patient", methods=["POST"])
def patient():
    body = request.get_json()
    msg = body.get("message")

    reply = chat_with_agent("patient", msg, get_patient_prompt())

    booking = None

    if "BOOKING_CONFIRMED:" in reply:
        try:
            info = reply.split("BOOKING_CONFIRMED:")[1]
            doctor, specialty = info.split("|")

            data = read_data()

            token = {
                "token": random.randint(100, 999),
                "doctor": doctor.strip(),
                "specialty": specialty.strip(),
                "status": "waiting",
                "position": len(data["queue"]) + 1,
                "wait_time": len(data["queue"]) * 15
            }

            data["queue"].append(token)
            write_data(data)

            booking = token
            reply = reply.split("BOOKING_CONFIRMED:")[0]

        except:
            pass

    return jsonify({"reply": reply, "booking": booking})

# ════════════════════════════════════════
#  DOCTOR
# ════════════════════════════════════════

@app.route("/api/doctor", methods=["POST"])
def doctor():
    msg = request.get_json().get("message")
    reply = chat_with_agent("doctor", msg, DOCTOR_PROMPT)
    return jsonify({"reply": reply})

# ════════════════════════════════════════
#  ADMIN
# ════════════════════════════════════════

@app.route("/api/admin", methods=["POST"])
def admin():
    msg = request.get_json().get("message")
    reply = chat_with_agent("admin", msg, get_admin_prompt())
    return jsonify({"reply": reply})

# ════════════════════════════════════════
#  QUEUE
# ════════════════════════════════════════

@app.route("/api/queue", methods=["GET"])
def queue():
    return jsonify(read_data()["queue"])

# ════════════════════════════════════════
#  HOME
# ════════════════════════════════════════

@app.route("/")
def home():
    return jsonify({"status": "MedNexus running 🚀"})

# ════════════════════════════════════════
#  RUN
# ════════════════════════════════════════

if __name__ == "__main__":
    print("🚀 MedNexus running with OpenRouter")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)