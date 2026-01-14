/*
  toast.js - Beautiful toast notifications
  Usage: showToast('Message', 'success' | 'error' | 'info')
*/

function showToast(message, type = 'info') {
  // Remove any existing toasts
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'toast-container';
  
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  
  const icon = {
    success: '✓',
    error: '✕',
    info: 'ⓘ',
    warning: '⚠'
  }[type] || 'ⓘ';
  
  toast.innerHTML = `
    <span class="toast__icon">${icon}</span>
    <span class="toast__message">${escapeToastHtml(message)}</span>
  `;
  
  container.appendChild(toast);
  document.body.appendChild(container);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('toast--show');
  });
  
  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => container.remove(), 300);
  }, 3000);
}

function escapeToastHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Make it globally available
window.showToast = showToast;
