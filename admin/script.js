// ════════════════════════════════════════
//  MEDNEXUS — admin/script.js
// ════════════════════════════════════════

// ── LOGOUT ──
function logout() {
  localStorage.removeItem('mednexus-role');
  window.location.href = '../index.html';
}

const API = 'https://mednexus-tuz3.onrender.com';

// ── THEME TOGGLE ──
const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('mednexus-theme') === 'light') {
  document.body.classList.add('light');
  themeToggle.textContent = '☀️';
}
themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light');
  themeToggle.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('mednexus-theme', isLight ? 'light' : 'dark');
});

// ── TAB SWITCHING ──
function switchTab(tab, event) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (event) event.target.classList.add('active');

  if (tab === 'queue') loadQueue();
  if (tab === 'doctors') loadDoctors();
  if (tab === 'feedback') loadFeedback();
}

// ════════════════════════════════════════
//  STATS
// ════════════════════════════════════════

async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();
    const s = data.stats;

    document.getElementById('statBeds').textContent = s.total_beds - s.occupied_beds;
    document.getElementById('statBedsTotal').textContent = `out of ${s.total_beds} total`;
    document.getElementById('statIcu').textContent = s.icu_total - s.icu_occupied;
    document.getElementById('statIcuTotal').textContent = `out of ${s.icu_total} total`;
    document.getElementById('statDoctors').textContent = s.doctors_on_duty;
    document.getElementById('statQueue').textContent = s.pending_tokens;
    document.getElementById('statEmergency').textContent = `${s.emergency_cases} emergency cases`;
  } catch {
    console.log('Could not load stats');
  }
}

// ════════════════════════════════════════
//  TAB 1 — LIVE QUEUE
// ════════════════════════════════════════

async function loadQueue() {
  const list = document.getElementById('queueList');
  list.innerHTML = `<div style="text-align:center;padding:40px 0;"><div class="spinner"></div><p style="margin-top:12px;color:var(--muted);font-size:0.88rem;">Loading queue...</p></div>`;

  try {
    const res = await fetch(`${API}/api/queue`);
    const data = await res.json();
    const queue = data.queue;

    if (!queue || queue.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <p>Queue is empty right now.</p>
        </div>`;
      return;
    }

    list.innerHTML = queue.map(item => `
      <div class="admin-queue-item ${item.status === 'done' ? 'done' : ''}">
        <div class="admin-queue-token">#${item.token}</div>
        <div class="admin-queue-info">
          <div class="admin-queue-doctor">${item.doctor} — ${item.specialty}</div>
          <div class="admin-queue-symptoms">${item.symptoms || 'No symptoms recorded'}</div>
        </div>
        <div class="admin-queue-meta">
          ${item.status === 'waiting'
            ? `<span class="badge badge-warning">Waiting</span>
               <div class="admin-queue-time">~${item.wait_time} mins · Position ${item.position}</div>
               <button class="btn-success" onclick="markDone(${item.token})" style="font-size:0.78rem;padding:5px 10px;">✓ Mark Done</button>`
            : `<span class="badge badge-success">Completed</span>
               <div class="admin-queue-time">${item.timestamp}</div>`
          }
        </div>
      </div>
    `).join('');

  } catch {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not connect to backend. Make sure app.py is running on localhost:5000.</p>
      </div>`;
  }
}

async function markDone(token) {
  try {
    await fetch(`${API}/api/queue/done/${token}`, { method: 'POST' });
    showToast(`Token #${token} marked as done ✅`, 'success');
    loadQueue();
    loadStats();
  } catch {
    showToast('Could not update. Try again.', 'error');
  }
}

// ════════════════════════════════════════
//  TAB 2 — MANAGE DOCTORS
// ════════════════════════════════════════

async function loadDoctors() {
  const list = document.getElementById('doctorList');
  list.innerHTML = `<div style="text-align:center;padding:30px 0;"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`${API}/api/doctors`);
    const data = await res.json();
    const doctors = data.doctors;

    if (!doctors || doctors.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👨‍⚕️</div>
          <p>No doctors added yet.</p>
        </div>`;
      return;
    }

    list.innerHTML = doctors.map(doc => `
      <div class="doctor-card">
        <div class="doctor-avatar">👨‍⚕️</div>
        <div class="doctor-info">
          <div class="doctor-name">${doc.name}</div>
          <div class="doctor-specialty">${doc.specialty}</div>
          ${doc.contact ? `<div class="doctor-contact">📞 ${doc.contact}</div>` : ''}
        </div>
        <div class="doctor-actions">
          <span class="badge ${doc.status === 'on_duty' ? 'badge-success' : 'badge-warning'}">
            ${doc.status === 'on_duty' ? 'On Duty' : 'Off Duty'}
          </span>
          <button class="btn-secondary" onclick="toggleDoctor(${doc.id})" style="font-size:0.78rem;padding:5px 10px;">
            ${doc.status === 'on_duty' ? 'Set Off' : 'Set On'}
          </button>
          <button class="btn-danger" onclick="removeDoctor(${doc.id}, '${doc.name}')" style="font-size:0.78rem;padding:5px 10px;">
            Remove
          </button>
        </div>
      </div>
    `).join('');

  } catch {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not load doctors.</p>
      </div>`;
  }
}

async function addDoctor() {
  const name      = document.getElementById('docName').value.trim();
  const specialty = document.getElementById('docSpecialty').value.trim();
  const contact   = document.getElementById('docContact').value.trim();

  if (!name || !specialty) {
    showToast('Name and specialty are required.', 'error');
    return;
  }

  const btn = document.getElementById('addDoctorBtn');
  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    await fetch(`${API}/api/doctors/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, specialty, contact })
    });
    showToast(`✅ ${name} added successfully!`, 'success');
    document.getElementById('docName').value = '';
    document.getElementById('docSpecialty').value = '';
    document.getElementById('docContact').value = '';
    loadDoctors();
    loadStats();
  } catch {
    showToast('Could not add doctor. Try again.', 'error');
  }

  btn.disabled = false;
  btn.textContent = '+ Add Doctor';
}

async function removeDoctor(id, name) {
  if (!confirm(`Remove ${name} from the system?`)) return;
  try {
    await fetch(`${API}/api/doctors/remove/${id}`, { method: 'DELETE' });
    showToast(`${name} removed.`, 'success');
    loadDoctors();
    loadStats();
  } catch {
    showToast('Could not remove doctor.', 'error');
  }
}

async function toggleDoctor(id) {
  try {
    await fetch(`${API}/api/doctors/toggle/${id}`, { method: 'POST' });
    showToast('Doctor status updated.', 'success');
    loadDoctors();
    loadStats();
  } catch {
    showToast('Could not update status.', 'error');
  }
}

// ════════════════════════════════════════
//  TAB 3 — FEEDBACK
// ════════════════════════════════════════

async function loadFeedback() {
  const list    = document.getElementById('feedbackList');
  const statsEl = document.getElementById('feedbackStats');
  list.innerHTML = `<div style="text-align:center;padding:30px 0;"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`${API}/api/feedback/all`);
    const data = await res.json();
    const feedback = data.feedback;

    if (!feedback || feedback.length === 0) {
      statsEl.innerHTML = '';
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <p>No feedback submitted yet.</p>
        </div>`;
      return;
    }

    const avg   = (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1);
    const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

    statsEl.innerHTML = `
      <div class="feedback-stats-bar">
        <div class="feedback-avg">${avg}</div>
        <div>
          <div style="color:#f59e0b;font-size:1.2rem;">${stars}</div>
          <div class="feedback-avg-label">${feedback.length} review${feedback.length > 1 ? 's' : ''}</div>
        </div>
      </div>`;

    list.innerHTML = feedback.slice().reverse().map(f => `
      <div class="feedback-card">
        <div class="feedback-header">
          <div class="feedback-stars">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
          <div class="feedback-time">${f.timestamp}</div>
        </div>
        ${f.comment
          ? `<div class="feedback-comment">${escapeHtml(f.comment)}</div>`
          : `<div class="feedback-empty-comment">No comment provided</div>`
        }
      </div>
    `).join('');

  } catch {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not load feedback.</p>
      </div>`;
  }
}

// ════════════════════════════════════════
//  TAB 4 — AI CHAT
// ════════════════════════════════════════

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function askQuick(question) {
  document.getElementById('chatInput').value = question;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  appendMessage('user', message);
  input.value = '';

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(`${API}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    removeTyping();
    appendMessage('ai', data.reply);
  } catch {
    removeTyping();
    appendMessage('ai', '⚠️ Could not connect to backend. Make sure app.py is running.');
  }

  sendBtn.disabled = false;
  scrollChat();
}

function appendMessage(role, text) {
  const messages = document.getElementById('chatMessages');
  const bubble   = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  if (role === 'ai') {
    bubble.innerHTML = `<div class="bubble-label">Admin Agent</div>${escapeHtml(text)}`;
  } else {
    bubble.textContent = text;
  }
  messages.appendChild(bubble);
  scrollChat();
}

function showTyping() {
  const messages = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typingIndicator';
  el.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  messages.appendChild(el);
  scrollChat();
}

function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function scrollChat() {
  const messages = document.getElementById('chatMessages');
  messages.scrollTop = messages.scrollHeight;
}

async function resetChat() {
  await fetch(`${API}/api/reset/admin`, { method: 'POST' });
  document.getElementById('chatMessages').innerHTML = `
    <div class="chat-bubble ai">
      <div class="bubble-label">Admin Agent</div>
      Hello! I'm your MedNexus Admin Assistant. Ask me anything about hospital operations — bed availability, queue status, staff, or resource optimization. 🏥
    </div>`;
}

// ════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ════════════════════════════════════════
//  AUTO-REFRESH — Queue + Stats every 20s
//  Only refreshes queue if queue tab is active
// ════════════════════════════════════════

setInterval(() => {
  loadStats();
  if (!document.getElementById('tab-queue').classList.contains('hidden')) {
    loadQueue();
  }
}, 20000);

// Load everything on page open
loadStats();
loadQueue();