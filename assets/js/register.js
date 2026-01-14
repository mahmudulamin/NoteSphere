/*
  register.js
  - Handles user registration form
  - Google Sign-In integration
*/

(async function () {
  const registerForm = document.getElementById('registerForm');
  const usernameEl = document.getElementById('username');
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const confirmPasswordEl = document.getElementById('confirmPassword');
  const googleSignInBtn = document.getElementById('googleSignIn');

  const themeToggle = document.getElementById('themeToggle');
  initTheme(themeToggle);

  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('return') || '/index.html';

  // Check if already logged in
  try {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const me = await res.json();
      if (me?.authenticated) {
        window.location.href = returnTo;
        return;
      }
    }
  } catch (err) {
    console.log('Backend check failed:', err);
  }

  // Initialize Google Sign-In
  if (window.google) {
    initGoogleSignIn();
  } else {
    // Wait for Google script to load
    window.addEventListener('load', () => {
      if (window.google) initGoogleSignIn();
    });
  }

  function initGoogleSignIn() {
    googleSignInBtn?.addEventListener('click', async () => {
      try {
        // Initialize Google Identity Services
        const client = google.accounts.oauth2.initTokenClient({
          client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
          scope: 'email profile',
          callback: async (response) => {
            if (response.access_token) {
              await handleGoogleAuth(response.access_token);
            }
          }
        });
        client.requestAccessToken();
      } catch (err) {
        showToast('Google Sign-In not available. Configure GOOGLE_CLIENT_ID on server.', 'error');
        console.error(err);
      }
    });
  }

  async function handleGoogleAuth(accessToken) {
    try {
      // Get user info from Google
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!userInfoRes.ok) {
        throw new Error('Failed to get user info');
      }

      const userInfo = await userInfoRes.json();
      
      // Send to our backend
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userInfo.email,
          name: userInfo.name,
          idToken: accessToken // In production, send the ID token
        })
      });

      if (res.ok) {
        showToast('Successfully registered with Google!', 'success');
        setTimeout(() => {
          window.location.href = returnTo;
        }, 500);
      } else {
        const error = await res.json();
        showToast(error.error || 'Google registration failed', 'error');
      }
    } catch (err) {
      showToast('Google authentication failed', 'error');
      console.error(err);
    }
  }

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = (usernameEl?.value || '').trim();
    const email = (emailEl?.value || '').trim();
    const password = passwordEl?.value || '';
    const confirmPassword = confirmPasswordEl?.value || '';

    if (!username || !email || !password || !confirmPassword) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      if (confirmPasswordEl) confirmPasswordEl.value = '';
      if (confirmPasswordEl) confirmPasswordEl.focus();
      return;
    }

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || 'Create Account';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const msg = payload?.error || `Registration failed (HTTP ${res.status})`;
        showToast(msg, 'error');
        if (passwordEl) passwordEl.value = '';
        if (confirmPasswordEl) confirmPasswordEl.value = '';
        if (passwordEl) passwordEl.focus();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
        return;
      }

      showToast('Account created successfully!', 'success');
      setTimeout(() => {
        window.location.href = returnTo;
      }, 500);
    } catch (err) {
      showToast('Could not reach the server. Make sure the backend is running.', 'error');
      console.error(err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
