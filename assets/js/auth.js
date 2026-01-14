/*
  auth.js (shared)
  - Detects whether the backend is running
  - Redirects to login when backend requires auth
  - Wires up login/logout UI elements if present
*/

(async function () {
  const loginLink = document.getElementById('loginLink');
  const logoutBtn = document.getElementById('logoutBtn');
  const userChip = document.getElementById('userChip');

  const onLoginPage = /\/login\.html$/.test(window.location.pathname);

  const returnUrl = window.location.pathname + window.location.search;

  const redirectToLogin = () => {
    if (onLoginPage) return;
    window.location.href = `/login.html?return=${encodeURIComponent(returnUrl)}`;
  };

  const setAuthedUi = (username) => {
    if (loginLink) loginLink.hidden = true;
    if (logoutBtn) logoutBtn.hidden = false;
    if (userChip) {
      userChip.hidden = false;
      userChip.textContent = username ? `Signed in as ${username}` : 'Signed in';
    }
  };

  const setGuestUi = () => {
    if (loginLink) loginLink.hidden = false;
    if (logoutBtn) logoutBtn.hidden = true;
    if (userChip) userChip.hidden = true;
  };

  // Attach logout behavior early so button works even if /api/me fails later.
  logoutBtn?.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    redirectToLogin();
  });

  try {
    const res = await fetch('/api/me', { cache: 'no-store' });

    // If backend doesn't exist, do nothing (file:// or static server).
    if (!res.ok) {
      if (res.status === 401) redirectToLogin();
      return;
    }

    window.__notesBackendAvailable = true;

    const me = await res.json();

    if (me?.authenticated) {
      setAuthedUi(me.username);
      return;
    }

    setGuestUi();
    redirectToLogin();
  } catch {
    // Backend not reachable -> leave site usable without auth.
  }
})();
