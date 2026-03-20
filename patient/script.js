// ════════════════════════════════════════
//  MEDNEXUS — patient/script.js
// ════════════════════════════════════════

// ── AUTH CHECK — kick out if not logged in as patient ──
(function () {
  const role = localStorage.getItem('mednexus-role');
  if (role !== 'patient') {
    window.location.href = '../index.html';
  }
})();

// ── LOGOUT ──
function logout() {
  localStorage.removeItem('mednexus-role');
  localStorage.removeItem('mednexus-user');
  window.location.href = '../index.html';
}

const API = 'https://mednexus-tuz3.onrender.com';
let selectedRating = 0;
let currentToken = null;

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
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  event.target.classList.add('active');
  if (tab === 'token') refreshToken();
}

// ════════════════════════════════════════
//  TAB 1 — SYMPTOM CHAT
// ════════════════════════════════════════

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
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
    const res = await fetch(`${API}/api/patient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    removeTyping();
    appendMessage('ai', data.reply);

    if (data.booking) {
      currentToken = data.booking;
      saveToken(data.booking);
      showTokenNotification(data.booking);
    }
  } catch (err) {
    removeTyping();
    appendMessage('ai', '⚠️ Could not connect to MedNexus backend.');
  }

  sendBtn.disabled = false;
  scrollChat();
}

function appendMessage(role, text) {
  const messages = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  if (role === 'ai') {
    bubble.innerHTML = `<div class="bubble-label">MedNexus Agent</div>${escapeHtml(text)}`;
  } else {
    bubble.textContent = text;
  }
  messages.appendChild(bubble);
  scrollChat();
}

function showTyping() {
  const messages = document.getElementById('chatMessages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  messages.appendChild(indicator);
  scrollChat();
}

function removeTyping() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

function scrollChat() {
  const messages = document.getElementById('chatMessages');
  messages.scrollTop = messages.scrollHeight;
}

async function resetChat() {
  await fetch(`${API}/api/reset/patient`, { method: 'POST' });
  const messages = document.getElementById('chatMessages');
  messages.innerHTML = `
    <div class="chat-bubble ai">
      <div class="bubble-label">MedNexus Agent</div>
      Hello! I'm your MedNexus Patient Assistant. Please describe your symptoms and I'll help you find the right doctor. 🏥
    </div>
  `;
}

function showTokenNotification(token) {
  showToast(`🎫 Token #${token.token} booked! Check "My Token" tab.`, 'success');
  setTimeout(() => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-token').classList.remove('hidden');
    document.querySelectorAll('.tab-btn')[2].classList.add('active');
    displayToken(token);
  }, 2000);
}

// ════════════════════════════════════════
//  TAB 2 — PRESCRIPTION SUMMARIZER
// ════════════════════════════════════════

async function summarizePrescription() {
  const prescription = document.getElementById('prescriptionInput').value.trim();
  if (!prescription) {
    showToast('Please paste your prescription first.', 'error');
    return;
  }

  const btn = document.getElementById('summarizeBtn');
  const result = document.getElementById('prescriptionResult');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  result.innerHTML = `<div style="text-align:center;padding:40px 0;"><div class="spinner"></div><p style="margin-top:12px;color:var(--muted);font-size:0.88rem;">AI is reading your prescription...</p></div>`;

  try {
    const res = await fetch(`${API}/api/prescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prescription })
    });
    const data = await res.json();
    result.innerHTML = `<div class="prescription-content">${escapeHtml(data.reply)}</div>`;
  } catch (err) {
    result.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not connect to backend.</p></div>`;
  }

  btn.disabled = false;
  btn.textContent = '💊 Explain My Prescription';
}

// ════════════════════════════════════════
//  TAB 3 — TOKEN
// ════════════════════════════════════════

function saveToken(token) {
  localStorage.setItem('mednexus-token', JSON.stringify(token));
}

function loadToken() {
  const saved = localStorage.getItem('mednexus-token');
  return saved ? JSON.parse(saved) : null;
}

async function refreshToken() {
  const token = loadToken();
  if (!token) {
    document.getElementById('noToken').classList.remove('hidden');
    document.getElementById('tokenDisplay').classList.add('hidden');
    return;
  }

  try {
    const res = await fetch(`${API}/api/queue`);
    const data = await res.json();
    const updated = data.queue.find(q => q.token === token.token);
    if (updated) {
      displayToken(updated);
      saveToken(updated);
    } else {
      displayToken(token);
    }
  } catch {
    displayToken(token);
  }
}

function displayToken(token) {
  document.getElementById('noToken').classList.add('hidden');
  document.getElementById('tokenDisplay').classList.remove('hidden');

  document.getElementById('tokenNumber').textContent = '#' + token.token;
  document.getElementById('tokenDoctor').textContent = token.doctor;
  document.getElementById('tokenSpecialty').textContent = token.specialty;
  document.getElementById('tokenPosition').textContent = token.status === 'done' ? '✅ Completed' : `${token.position} in queue`;
  document.getElementById('tokenWait').textContent = token.status === 'done' ? '—' : `~${token.wait_time} mins`;
  document.getElementById('tokenTime').textContent = token.timestamp;

  const statusEl = document.getElementById('tokenStatus');
  if (token.status === 'waiting') {
    statusEl.innerHTML = '<span class="badge badge-warning">Waiting</span>';
  } else if (token.status === 'done') {
    statusEl.innerHTML = '<span class="badge badge-success">Completed</span>';
  } else {
    statusEl.innerHTML = '<span class="badge badge-info">In Progress</span>';
  }
}

// ════════════════════════════════════════
//  TAB 4 — FEEDBACK
// ════════════════════════════════════════

const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.value);
    document.querySelectorAll('.star').forEach((s, i) => {
      s.classList.toggle('active', i < selectedRating);
    });
    document.getElementById('ratingLabel').textContent = ratingLabels[selectedRating];
  });

  star.addEventListener('mouseover', () => {
    const val = parseInt(star.dataset.value);
    document.querySelectorAll('.star').forEach((s, i) => {
      s.style.color = i < val ? '#f59e0b' : '';
    });
  });

  star.addEventListener('mouseout', () => {
    document.querySelectorAll('.star').forEach((s, i) => {
      s.style.color = i < selectedRating ? '#f59e0b' : '';
    });
  });
});

async function submitFeedback() {
  if (!selectedRating) {
    showToast('Please select a star rating first.', 'error');
    return;
  }

  const comment = document.getElementById('feedbackComment').value.trim();
  const btn = document.getElementById('feedbackBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    await fetch(`${API}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, comment })
    });
    showToast('✅ Thank you for your feedback!', 'success');

    selectedRating = 0;
    document.querySelectorAll('.star').forEach(s => {
      s.classList.remove('active');
      s.style.color = '';
    });
    document.getElementById('ratingLabel').textContent = 'Click a star to rate';
    document.getElementById('feedbackComment').value = '';
  } catch {
    showToast('Could not submit feedback. Try again.', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Submit Feedback';
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
//  AUTO-REFRESH
// ════════════════════════════════════════

setInterval(() => {
  if (!document.getElementById('tab-token').classList.contains('hidden')) {
    refreshToken();
  }
}, 15000);

refreshToken();