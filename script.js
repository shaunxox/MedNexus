// ════════════════════════════════════════
//  MEDNEXUS — script.js (Landing Page)
// ════════════════════════════════════════

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

// ── MODAL ──
function openLogin() {
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

// ── ROLE SELECTION → go straight to dashboard ──
function selectRole(role) {
  localStorage.setItem('mednexus-role', role);
  window.location.href = role + '/index.html';
}

// ── ESC KEY ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLogin();
});