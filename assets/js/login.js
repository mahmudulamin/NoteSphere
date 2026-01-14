/*
  login.js
  - Handles login form submission
  - Shows a helpful hint if backend isn't running
*/

(async function () {
  const loginForm = document.getElementById('loginForm');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const loginError = document.getElementById('loginError');
  const serverHint = document.getElementById('serverHint');

  const themeToggle = document.getElementById('themeToggle');
  initTheme(themeToggle);

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('return') || '/index.html';

  const showError = (msg) => {
    if (!loginError) return;
    loginError.hidden = false;
    loginError.textContent = msg;
  };

  const hideError = () => {
    if (!loginError) return;
    loginError.hidden = true;
    loginError.textContent = '';
  };

  // If backend is down, show guidance.
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error('not ok');
    if (serverHint) serverHint.hidden = true;
  } catch {
    if (serverHint) {
      serverHint.hidden = false;
      serverHint.textContent = 'Login works only when running the backend. Start it with: npm start (or node server.js)';
    }
  }

  // If already logged in, go back.
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const me = await res.json();
      if (me?.authenticated) {
        window.location.href = returnTo;
        return;
      }
    }
  } catch {
    // ignore
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = (usernameEl?.value || '').trim();
    const password = passwordEl?.value || '';

    if (!username || !password) {
      showError('Please enter username and password.');
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const msg = payload?.error || `Login failed (HTTP ${res.status})`;
        showError(msg);
        return;
      }

      window.location.href = returnTo;
    } catch (err) {
      showError('Could not reach the server. Make sure the backend is running.');
      console.error(err);
    }
  });
})();

// ----------------------------
// Theme helpers (same as other pages)
// ----------------------------

function initTheme(themeToggleButton) {
  const saved = localStorage.getItem('notes.theme');

  if (!saved) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  } else {
    setTheme(saved);
  }

  themeToggleButton?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('notes.theme', theme);
}
