// ════════════════════════════════════════
//  MEDNEXUS — script.js (Landing Page)
// ════════════════════════════════════════

const API = 'https://mednexus-tuz3.onrender.com';

// ── THEME TOGGLE ──
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('themeToggle').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('mednexus-theme', isLight ? 'light' : 'dark');
}
(function () {
  if (localStorage.getItem('mednexus-theme') === 'light') {
    document.body.classList.add('light');
    document.getElementById('themeToggle').textContent = '☀️';
  }
})();

// ── MODAL OPEN/CLOSE ──
function openLogin() {
  showScreen('role');
  document.getElementById('loginModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLogin() {
  document.getElementById('loginModal').classList.remove('active');
  document.body.style.overflow = '';
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('loginModal')) closeLogin();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLogin();
});

// ── SCREEN SWITCHER ──
function showScreen(name) {
  ['role', 'patient', 'doctor', 'admin'].forEach(s => {
    document.getElementById('screen-' + s).style.display = 'none';
  });
  document.getElementById('screen-' + name).style.display = 'block';
  clearErrors();
}

function selectRole(role) {
  showScreen(role);
}

function clearErrors() {
  document.querySelectorAll('.auth-error').forEach(el => el.textContent = '');
}

// ── PATIENT TAB SWITCHER ──
function switchTab(tab) {
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  clearErrors();
}

// ── PATIENT LOGIN ──
async function patientLogin() {
  const email    = document.getElementById('patient-login-email').value.trim();
  const password = document.getElementById('patient-login-password').value.trim();
  const errEl    = document.getElementById('patient-login-error');

  if (!email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    return;
  }

  try {
    const res  = await fetch(`${API}/api/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed.';
      return;
    }

    localStorage.setItem('mednexus-role', 'patient');
    localStorage.setItem('mednexus-user', JSON.stringify(data.user));
    window.location.href = 'patient/index.html';

  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
}

// ── PATIENT REGISTER ──
async function patientRegister() {
  const name     = document.getElementById('patient-reg-name').value.trim();
  const age      = document.getElementById('patient-reg-age').value.trim();
  const email    = document.getElementById('patient-reg-email').value.trim();
  const password = document.getElementById('patient-reg-password').value.trim();
  const errEl    = document.getElementById('patient-reg-error');

  if (!name || !age || !email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    return;
  }

  try {
    const res  = await fetch(`${API}/api/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, age, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Registration failed.';
      return;
    }

    localStorage.setItem('mednexus-role', 'patient');
    localStorage.setItem('mednexus-user', JSON.stringify(data.user));
    window.location.href = 'patient/index.html';

  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
}

// ── DOCTOR LOGIN ──
async function doctorLogin() {
  const password = document.getElementById('doctor-password').value.trim();
  const errEl    = document.getElementById('doctor-error');

  if (!password) {
    errEl.textContent = 'Please enter your password.';
    return;
  }

  try {
    const res  = await fetch(`${API}/api/doctor/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Invalid password.';
      return;
    }

    localStorage.setItem('mednexus-role', 'doctor');
    localStorage.setItem('mednexus-user', JSON.stringify({ name: 'Doctor', role: 'doctor' }));
    window.location.href = 'doctor/index.html';

  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
}

// ── ADMIN LOGIN ──
async function adminLogin() {
  const password = document.getElementById('admin-password').value.trim();
  const errEl    = document.getElementById('admin-error');

  if (!password) {
    errEl.textContent = 'Please enter your password.';
    return;
  }

  try {
    const res  = await fetch(`${API}/api/admin/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Invalid password.';
      return;
    }

    localStorage.setItem('mednexus-role', 'admin');
    localStorage.setItem('mednexus-user', JSON.stringify({ name: 'Admin', role: 'admin' }));
    window.location.href = 'admin/index.html';

  } catch (e) {
    errEl.textContent = 'Could not connect to server.';
  }
}