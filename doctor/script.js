// ════════════════════════════════════════
//  MEDNEXUS — doctor/script.js
// ════════════════════════════════════════

// ── LOGOUT ──
function logout() {
  localStorage.removeItem('mednexus-role');
  window.location.href = '../index.html';
}

const API = 'http://localhost:5000';
let medicineCount = 1;
let selectedToken = null;

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
}

// ════════════════════════════════════════
//  TAB 1 — PATIENT QUEUE
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
          <p>No patients in queue right now. Queue will update when patients book appointments.</p>
        </div>`;
      return;
    }

    list.innerHTML = queue.map(item => `
      <div class="queue-item ${item.status === 'done' ? 'done' : ''}" onclick="${item.status !== 'done' ? `selectPatient(${item.token}, '${escapeJs(item.symptoms)}', '${escapeJs(item.doctor)}')` : ''}">
        <div class="queue-token">#${item.token}</div>
        <div class="queue-info">
          <div class="queue-doctor">${item.doctor} — ${item.specialty}</div>
          <div class="queue-symptoms">${item.symptoms || 'No symptoms recorded'}</div>
        </div>
        <div class="queue-meta">
          ${item.status === 'waiting'
            ? `<span class="badge badge-warning">Waiting</span>
               <div class="queue-wait">~${item.wait_time} mins</div>`
            : `<span class="badge badge-success">Done</span>`
          }
          <div class="queue-actions">
            ${item.status === 'waiting' ? `
              <button class="btn-success" onclick="event.stopPropagation(); markDone(${item.token})" style="font-size:0.78rem;padding:5px 10px;">✓ Done</button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not connect to backend. Make sure app.py is running on localhost:5000.</p>
      </div>`;
  }
}

function selectPatient(token, symptoms, doctor) {
  selectedToken = token;
  document.getElementById('selectedPatient').value = `Token #${token} — ${doctor}`;
  document.getElementById('patientSymptoms').value = symptoms;
  document.getElementById('prescPatient').value = token;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-analysis').classList.remove('hidden');
  document.querySelectorAll('.tab-btn')[1].classList.add('active');

  showToast(`Patient Token #${token} selected for analysis`, 'success');
}

async function markDone(token) {
  try {
    await fetch(`${API}/api/queue/done/${token}`, { method: 'POST' });
    showToast(`Token #${token} marked as done ✅`, 'success');
    loadQueue();
  } catch {
    showToast('Could not update queue. Try again.', 'error');
  }
}

// ════════════════════════════════════════
//  TAB 2 — AI ANALYSIS
// ════════════════════════════════════════

async function analyzePatient() {
  const symptoms = document.getElementById('patientSymptoms').value.trim();
  const notes    = document.getElementById('doctorNotes').value.trim();
  const patient  = document.getElementById('selectedPatient').value.trim();

  if (!symptoms) {
    showToast('Please enter patient symptoms first.', 'error');
    return;
  }

  const btn    = document.getElementById('analyzeBtn');
  const result = document.getElementById('analysisResult');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  result.innerHTML = `
    <div style="text-align:center;padding:60px 0;">
      <div class="spinner"></div>
      <p style="margin-top:16px;color:var(--muted);font-size:0.88rem;">AI is analyzing patient data...</p>
    </div>`;

  const message = `Patient: ${patient}\nSymptoms: ${symptoms}${notes ? '\nAdditional notes: ' + notes : ''}`;

  try {
    const res = await fetch(`${API}/api/doctor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();

    result.innerHTML = `
      <div class="analysis-section">
        <div class="analysis-section-title">🧠 AI Clinical Analysis</div>
        <div class="analysis-content">${escapeHtml(data.reply)}</div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn-secondary" onclick="goToPrescription()" style="font-size:0.85rem;">
          📋 Write Prescription for this Patient →
        </button>
      </div>
    `;
  } catch (err) {
    result.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p>Could not connect to backend. Make sure app.py is running.</p>
      </div>`;
  }

  btn.disabled = false;
  btn.textContent = '🧠 Analyze with AI';
}

function goToPrescription() {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-prescription').classList.remove('hidden');
  document.querySelectorAll('.tab-btn')[2].classList.add('active');
}

// ════════════════════════════════════════
//  TAB 3 — WRITE PRESCRIPTION
// ════════════════════════════════════════

function addMedicine() {
  medicineCount++;
  const list = document.getElementById('medicineList');
  const div  = document.createElement('div');
  div.className = 'medicine-row';
  div.id = `medicine-${medicineCount - 1}`;
  div.innerHTML = `
    <div class="medicine-row-header">
      <span class="medicine-num">Medicine ${medicineCount}</span>
    </div>
    <div class="medicine-fields">
      <div class="form-group">
        <label class="form-label">Medicine Name</label>
        <input class="form-input" placeholder="e.g. Amoxicillin 250mg"/>
      </div>
      <div class="form-group">
        <label class="form-label">Dosage</label>
        <input class="form-input" placeholder="e.g. 1 tablet"/>
      </div>
      <div class="form-group">
        <label class="form-label">Frequency</label>
        <select class="form-select">
          <option>Once daily</option>
          <option>Twice daily</option>
          <option>Three times daily</option>
          <option>Four times daily</option>
          <option>At night</option>
          <option>As needed</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Duration</label>
        <input class="form-input" placeholder="e.g. 5 days"/>
      </div>
      <div class="form-group" style="grid-column: span 2;">
        <label class="form-label">Instructions</label>
        <input class="form-input" placeholder="e.g. Take after food"/>
      </div>
    </div>
  `;
  list.appendChild(div);
}

function removeMedicine() {
  if (medicineCount <= 1) {
    showToast('At least one medicine is required.', 'error');
    return;
  }
  const last = document.getElementById(`medicine-${medicineCount - 1}`);
  if (last) last.remove();
  medicineCount--;
}

async function savePrescription() {
  const token = parseInt(document.getElementById('prescPatient').value.trim());
  if (!token) {
    showToast('Please enter a patient token number.', 'error');
    return;
  }

  const medicines = [];
  for (let i = 0; i < medicineCount; i++) {
    const row    = document.getElementById(`medicine-${i}`);
    if (!row) continue;
    const inputs = row.querySelectorAll('.form-input');
    const select = row.querySelector('.form-select');
    const name         = inputs[0]?.value.trim();
    const dosage       = inputs[1]?.value.trim();
    const frequency    = select?.value;
    const duration     = inputs[2]?.value.trim();
    const instructions = inputs[3]?.value.trim();
    if (name) {
      medicines.push(`${name} — ${dosage}, ${frequency}, ${duration}${instructions ? ', ' + instructions : ''}`);
    }
  }

  if (medicines.length === 0) {
    showToast('Please fill in at least one medicine.', 'error');
    return;
  }

  const notes = document.getElementById('prescNotes').value.trim();
  const prescriptionText = medicines.join('\n') + (notes ? '\n\nDoctor Notes: ' + notes : '');

  const btn = document.getElementById('savePresBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await fetch(`${API}/api/prescription/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, prescription: prescriptionText })
    });
    showToast(`✅ Prescription saved for Token #${token}!`, 'success');
  } catch {
    showToast('Could not save prescription. Try again.', 'error');
  }

  btn.disabled = false;
  btn.textContent = '💾 Save Prescription';
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

function escapeJs(text) {
  return (text || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
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

// Load queue on page open
loadQueue();