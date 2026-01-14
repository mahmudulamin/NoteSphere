/*
  shortcuts.js - Keyboard shortcuts
  - Ctrl/Cmd + K: Focus search
  - Escape: Clear search / Close modals
  - Ctrl/Cmd + /: Show shortcuts help
*/

(function() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? 'metaKey' : 'ctrlKey';
  
  // Wire up help button
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => showShortcutsModal());
  }
  
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K: Focus search
    if (e[modKey] && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('globalSearch') || document.getElementById('subjectSearch');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
    
    // Escape: Clear search or unfocus
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('globalSearch') || document.getElementById('subjectSearch');
      if (searchInput && searchInput === document.activeElement) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.blur();
      }
    }
    
    // Ctrl/Cmd + /: Show shortcuts help
    if (e[modKey] && e.key === '/') {
      e.preventDefault();
      showShortcutsModal();
    }
  });
  
  function showShortcutsModal() {
    const cmdKey = isMac ? '⌘' : 'Ctrl';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title">Keyboard Shortcuts</h2>
          <button class="btn btn--ghost modal__close" type="button">✕</button>
        </div>
        <div class="modal__body">
          <dl class="shortcuts-list">
            <div class="shortcut-item">
              <dt><kbd>${cmdKey}</kbd> + <kbd>K</kbd></dt>
              <dd>Focus search</dd>
            </div>
            <div class="shortcut-item">
              <dt><kbd>Esc</kbd></dt>
              <dd>Clear search / Close</dd>
            </div>
            <div class="shortcut-item">
              <dt><kbd>${cmdKey}</kbd> + <kbd>/</kbd></dt>
              <dd>Show shortcuts</dd>
            </div>
          </dl>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on background click or close button
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.modal__close')) {
        modal.remove();
      }
    });
    
    // Close on Escape
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
})();
