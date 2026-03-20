# MedNexus — AI Hospital Management System

> Multi-agent AI platform connecting patients, doctors, and hospital administrators through dedicated LLM-powered workflows.

---

## Overview

MedNexus is a full-stack hospital management system built with a vanilla HTML/CSS/JS frontend and a Python Flask backend. Three role-specific AI agents — powered by **LLaMA 3.3 70B via Groq** — handle patient intake, clinical decision support, and hospital operations in real time. All state is persisted in a lightweight `data.json` flat-file database.

---

## Features

### Patient portal
- Conversational symptom intake via AI chat agent
- Automatic appointment booking triggered by natural language confirmation
- Queue token generation with estimated wait times
- Prescription retrieval and plain-language explanation
- Feedback submission with star ratings

### Doctor portal
- AI clinical assistant — top 3 differential diagnoses, recommended tests, red flags
- Live patient queue view with token management
- Prescription authoring and saving per patient token
- Mark patients as done, automatically recalculating queue positions

### Admin portal
- Real-time hospital stats dashboard (beds, ICU, emergency cases, doctors on duty)
- Doctor roster management — add, remove, toggle on/off duty
- Full patient queue overview
- Feedback review panel

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend | Python · Flask · flask-cors |
| AI | Groq API · LLaMA 3.3 70B Versatile |
| Database | `data.json` (flat-file, server-local) |
| Hosting | Render.com (backend) |

---

## Project Structure

```
MedNexus/
├── index.html          # Landing page + login/register
├── script.js           # Landing page logic
├── style.css           # Landing page styles
├── shared.css          # Shared styles across portals
├── app.py              # Flask backend (all API routes)
├── data.json           # Flat-file database (auto-created on first run)
├── requirements.txt    # Python dependencies
│
├── patient/
│   ├── index.html      # Patient portal UI
│   ├── script.js       # Patient portal logic
│   └── style.css
│
├── doctor/
│   ├── index.html      # Doctor portal UI
│   ├── script.js       # Doctor portal logic
│   └── style.css
│
└── admin/
    ├── index.html      # Admin portal UI
    ├── script.js       # Admin portal logic
    └── style.css
```

---

## How It Works

```
Patient / Doctor / Admin
        │
        │  fetch() JSON over HTTPS
        ▼
  Flask REST API  (app.py)
   ├── Auth routes        → read/write data.json
   ├── AI agent routes    → Groq API → LLaMA 3.3 70B
   └── Data routes        → read/write data.json
        │
        ├── Groq Cloud API (AI agents)
        └── data.json (persistence)
```

**Booking trigger flow:** Patient chats with AI → AI detects `BOOKING_CONFIRMED:DoctorName|Specialty` in its own reply → Flask parses trigger, generates a random token (100–999), calculates wait time as `position × 15 minutes`, writes to the queue → Doctor views queue, marks patient done → Queue positions recalculate automatically.

---

## API Reference

### Auth

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/register` | Register a new patient |
| `POST` | `/api/login` | Patient login |
| `POST` | `/api/doctor/login` | Doctor login (password only) |
| `POST` | `/api/admin/login` | Admin login (password only) |

### AI Agents

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/patient` | Patient AI chat (symptom intake + booking) |
| `POST` | `/api/doctor` | Doctor AI chat (clinical assistant) |
| `POST` | `/api/admin` | Admin AI chat (hospital analytics) |
| `POST` | `/api/prescription` | Explain a prescription in plain language |
| `POST` | `/api/reset/:agent` | Clear chat history for an agent |

### Queue & Data

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/queue` | Get full patient queue |
| `POST` | `/api/queue/done/:token` | Mark patient as done, recalculate queue |
| `GET` | `/api/stats` | Get hospital stats |
| `GET` | `/api/doctors` | List all doctors |
| `POST` | `/api/doctors/add` | Add a doctor |
| `DELETE` | `/api/doctors/remove/:id` | Remove a doctor |
| `POST` | `/api/doctors/toggle/:id` | Toggle doctor on/off duty |
| `GET/POST` | `/api/prescription/save` | Save or retrieve a prescription by token |
| `POST` | `/api/feedback` | Submit patient feedback |
| `GET` | `/api/feedback/all` | Get all feedback |

---

## Getting Started

### Prerequisites

- Python 3.9+
- A [Groq API key](https://console.groq.com/)

### Installation

```bash
# Clone the repo
git clone https://github.com/shaunxox/MedNexus.git
cd MedNexus

# Install Python dependencies
pip install -r requirements.txt

# Create a .env file with your Groq API key
echo "GROQ_API_KEY=your_key_here" > .env

# Run the backend
python app.py
```

The server starts on `http://localhost:5000` by default.

### Frontend

Open `index.html` directly in a browser, or serve the root folder with any static file server:

```bash
npx serve .
```

> **Note:** The frontend is hardcoded to point at `https://mednexus-f0i6.onrender.com`. To use a local backend, update the `API` constant at the top of each `script.js` file to `http://localhost:5000`.

---

## Default Credentials

| Role | Login |
|---|---|
| Patient | Register via the landing page |
| Doctor | Password: `doctor@mednexus` |
| Admin | Password: `admin@mednexus` |

> Passwords are hardcoded in `app.py`. Patient passwords are stored in plaintext in `data.json`. This is a prototype — do not use in production.

---

## Data Schema (`data.json`)

```json
{
  "users":    [ { "id", "name", "age", "email", "password", "role" } ],
  "doctors":  [ { "id", "name", "specialty", "contact", "status" } ],
  "queue":    [ { "token", "doctor", "specialty", "symptoms", "status",
                  "position", "wait_time", "timestamp", "prescription?" } ],
  "feedback": [ { "id", "rating", "comment", "timestamp" } ],
  "stats": {
    "total_beds", "occupied_beds",
    "icu_total", "icu_occupied",
    "emergency_cases"
  }
}
```

---

## AI Agent Design

Each agent uses a **rolling 10-message chat history** (per session, in-memory) plus a dynamically generated system prompt:

- **Patient agent** — fetches the current list of on-duty doctors from `data.json` and injects it into the prompt. Monitors its own output for a `BOOKING_CONFIRMED:Name|Specialty` trigger to auto-create queue tokens.
- **Doctor agent** — static clinical prompt. Returns top 3 differential diagnoses, suggested tests, treatment approach, and red flags.
- **Admin agent** — fetches live bed counts, ICU occupancy, queue length, and doctor availability from `data.json` and provides operational insights.

Chat histories are reset per-session and can be explicitly cleared via `POST /api/reset/:agent`.

---

## Known Limitations

- `data.json` is not thread-safe under concurrent load — not suitable for production use.
- Patient passwords stored in plaintext.
- Doctor and admin credentials are hardcoded in `app.py`.
- Auth is localStorage-only — no server-side session validation.
- Chat histories are in-memory and lost on server restart.

---

## License

MIT
