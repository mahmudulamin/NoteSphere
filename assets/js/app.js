/*
  app.js (Home page)
  Responsibilities:
  - Load notes from local JSON
  - Render subject cards
  - Provide global keyword search across all subjects
  - Handle light/dark theme toggle (persisted)

  Note on running locally:
  Browsers often block fetch() for local files opened as file://
  Use a local server (see README.md).
*/

(async function () {
  const subjectGrid = document.getElementById('subjectGrid');
  const globalSearch = document.getElementById('globalSearch');
  const searchResults = document.getElementById('searchResults');
  const subjectForm = document.getElementById('subjectForm');
  const subjectTitleInput = document.getElementById('subjectTitleInput');

  const exportBtn = document.getElementById('exportData');
  const importBtn = document.getElementById('importData');
  const importFile = document.getElementById('importFile');

  // ----------------------------
  // Theme handling (shared)
  // ----------------------------
  const themeToggle = document.getElementById('themeToggle');
  initTheme(themeToggle);

  // ----------------------------
  // Data loading
  // ----------------------------
  let data;
  try {
    data = await loadNotesData();

    // If the backend is running, it is the source of truth.
    // If not, fall back to localStorage-based subjects/notes.
    if (!isBackendAvailable()) {
      mergeUserSubjectsIntoData(data);
      mergeUserNotesIntoData(data);
      applyDeletedSubjects(data);
    }
  } catch (err) {
    if (String(err?.message || '').includes('AUTH_REQUIRED')) {
      const returnUrl = window.location.pathname + window.location.search;
      window.location.href = `/login.html?return=${encodeURIComponent(returnUrl)}`;
      return;
    }
    subjectGrid.innerHTML = renderErrorCard(
      'Failed to load notes data',
      'Run via a local server. See README.md for instructions.'
    );
    console.error(err);
    return;
  }

  // Render subject cards.
  renderSubjects(subjectGrid, data);

  // Add subject from the page (saved locally)
  subjectForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = (subjectTitleInput?.value || '').trim();
    if (!title) return;

    const slug = makeSubjectSlug(title);

    if (isBackendAvailable()) {
      createSubjectBackend(title, slug)
        .then(async () => {
          data = await loadNotesData();
          renderSubjects(subjectGrid, data);
        })
        .catch((err) => {
          alert('Could not create subject. See console for details.');
          console.error(err);
        });
    } else {
      saveUserSubject(slug, title);

      // Ensure it shows immediately even if it has zero notes.
      mergeUserSubjectsIntoData(data);
      applyDeletedSubjects(data);
      renderSubjects(subjectGrid, data);
    }

    subjectTitleInput.value = '';
    subjectTitleInput.focus();
  });

  // Delete/hide subject (event delegation)
  subjectGrid?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-action="delete-subject"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const slug = btn.getAttribute('data-subject');
    if (!slug) return;

    const title = data.subjects?.[slug]?.title || slug;
    const ok = window.confirm(
      isBackendAvailable()
        ? `Delete subject “${title}”?\n\nThis will delete it from data/notes.json on disk.`
        : `Delete/hide subject “${title}”?\n\nThis removes it from the list on this browser. Your saved notes for this subject will also be removed from this browser.`
    );
    if (!ok) return;

    if (isBackendAvailable()) {
      deleteSubjectBackend(slug)
        .then(async () => {
          data = await loadNotesData();
          renderSubjects(subjectGrid, data);
        })
        .catch((err) => {
          alert('Could not delete subject. See console for details.');
          console.error(err);
        });
    } else {
      deleteSubjectEverywhere(slug);

      // Rebuild from source again
      markSubjectDeleted(slug);
      if (data.subjects?.[slug]) delete data.subjects[slug];
      renderSubjects(subjectGrid, data);
    }
  });

  // Setup global search.
  globalSearch.addEventListener('input', () => {
    const query = globalSearch.value.trim();
    renderGlobalSearch(searchResults, data, query);
  });

  // Export / Import local data
  exportBtn?.addEventListener('click', () => {
    if (isBackendAvailable()) {
      downloadFromUrl('/api/export', `notes-${new Date().toISOString().slice(0, 10)}.json`);
    } else {
      const payload = buildExportPayload();
      downloadJson(payload, `my-notes-backup-${new Date().toISOString().slice(0, 10)}.json`);
    }
  });

  importBtn?.addEventListener('click', () => {
    importFile?.click();
  });

  importFile?.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const ok = window.confirm(
        isBackendAvailable()
          ? 'Import will REPLACE data/notes.json on disk. Continue?'
          : 'Import will REPLACE your current locally-saved subjects/notes on this browser. Continue?'
      );
      if (!ok) return;

      if (isBackendAvailable()) {
        await fetchJson('/api/import', {
          method: 'POST',
          body: parsed
        });

        data = await loadNotesData();
        renderSubjects(subjectGrid, data);
        renderGlobalSearch(searchResults, data, globalSearch.value.trim());
      } else {
        applyImportPayload(parsed);

        // Refresh current page state
        data = await loadNotesData();
        mergeUserSubjectsIntoData(data);
        mergeUserNotesIntoData(data);
        applyDeletedSubjects(data);
        renderSubjects(subjectGrid, data);
        renderGlobalSearch(searchResults, data, globalSearch.value.trim());
      }
    } catch (err) {
      alert('Import failed. Make sure you selected a valid backup JSON file.');
      console.error(err);
    } finally {
      importFile.value = '';
    }
  });
})();

// ----------------------------
// Theme helpers
// ----------------------------

function initTheme(themeToggleButton) {
  const saved = localStorage.getItem('notes.theme');

  // If user never chose a theme, default to system preference.
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

// ----------------------------
// Data helpers
// ----------------------------

async function loadNotesData() {
  // Prefer backend if running.
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) {
      window.__notesBackendAvailable = true;
      return await res.json();
    }

    // Backend reachable but auth required.
    if (res.status === 401) {
      window.__notesBackendAvailable = true;
      throw new Error('AUTH_REQUIRED');
    }
  } catch {
    // ignore and fall back
  }

  window.__notesBackendAvailable = false;

  try {
    const res = await fetch('./data/notes.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading notes.json`);
    return await res.json();
  } catch (err) {
    // Typical failure case: opening index.html directly (file://) blocks fetch().
    if (window.NOTES_DATA) return window.NOTES_DATA;
    throw err;
  }
}

function isBackendAvailable() {
  return window.__notesBackendAvailable === true;
}

async function fetchJson(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    const returnUrl = window.location.pathname + window.location.search;
    window.location.href = `/login.html?return=${encodeURIComponent(returnUrl)}`;
    throw new Error('AUTH_REQUIRED');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}: ${text}`);
  }
  return await res.json();
}

async function createSubjectBackend(title, slug) {
  return await fetchJson('/api/subjects', { method: 'POST', body: { title, slug } });
}

async function deleteSubjectBackend(slug) {
  const res = await fetch(`/api/subjects/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return true;
}

function downloadFromUrl(url, filename) {
  // Fetch then download so it works consistently.
  fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch((err) => {
      alert('Export failed. See console for details.');
      console.error(err);
    });
}

// ----------------------------
// Rendering
// ----------------------------

function renderSubjects(container, data) {
  const subjects = Object.values(data.subjects || {});

  // Sort by title for a consistent UI.
  subjects.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  // Keep it easy to extend: add a subject to data/notes.json and it appears here.
  container.innerHTML = subjects
    .map((s) => {
      const count = Array.isArray(s.notes) ? s.notes.length : 0;
      return `
        <article class="card" aria-label="${escapeHtml(s.title)}">
          <div class="card__row">
            <a class="card__title" href="subject.html?subject=${encodeURIComponent(s.slug)}" aria-label="Open ${escapeHtml(s.title)} notes">
              ${escapeHtml(s.title)}
            </a>
            <button class="icon-btn" type="button" data-action="delete-subject" data-subject="${escapeHtml(s.slug)}" aria-label="Delete ${escapeHtml(s.title)}">✕</button>
          </div>
          <p class="card__meta">${count} note${count === 1 ? '' : 's'}</p>
        </article>
      `.trim();
    })
    .join('');
}

function renderGlobalSearch(container, data, query) {
  if (!query) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const hits = searchAllNotes(data, query);

  if (hits.length === 0) {
    container.hidden = false;
    container.innerHTML = `<div class="muted" style="padding:10px">No results for <code>${escapeHtml(query)}</code>.</div>`;
    return;
  }

  container.hidden = false;
  container.innerHTML = hits
    .slice(0, 20)
    .map((hit) => {
      return `
        <a class="result-item" href="subject.html?subject=${encodeURIComponent(hit.subjectSlug)}#${encodeURIComponent(hit.noteId)}">
          <div class="result-item__title">${escapeHtml(hit.noteTitle)}</div>
          <div class="result-item__meta">${escapeHtml(hit.subjectTitle)} • ${escapeHtml(hit.preview)}</div>
        </a>
      `.trim();
    })
    .join('');
}

function renderErrorCard(title, message) {
  return `
    <div class="card" role="alert">
      <h3 class="card__title">${escapeHtml(title)}</h3>
      <p class="card__meta">${escapeHtml(message)}</p>
    </div>
  `.trim();
}

// ----------------------------
// Search
// ----------------------------

function searchAllNotes(data, query) {
  const q = query.toLowerCase();
  const results = [];

  for (const subject of Object.values(data.subjects)) {
    for (const note of subject.notes || []) {
      const haystack = [
        note.title,
        ...flattenNoteText(note.blocks || [])
      ].join('\n').toLowerCase();

      if (haystack.includes(q)) {
        results.push({
          subjectSlug: subject.slug,
          subjectTitle: subject.title,
          noteId: note.id,
          noteTitle: note.title,
          preview: buildPreview(note, q)
        });
      }
    }
  }

  return results;
}

function flattenNoteText(blocks) {
  // Extract plain text from blocks so search works across headings, lists, and code.
  const out = [];
  for (const b of blocks) {
    if (!b) continue;

    if (b.type === 'heading' || b.type === 'paragraph' || b.type === 'quote') {
      out.push(String(b.text || ''));
    } else if (b.type === 'list') {
      for (const item of b.items || []) out.push(String(item));
    } else if (b.type === 'code') {
      out.push(String(b.code || ''));
    }
  }
  return out;
}

function buildPreview(note, q) {
  const text = [note.title, ...flattenNoteText(note.blocks || [])].join(' ');
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return 'Match found';
  const start = Math.max(0, idx - 28);
  const end = Math.min(text.length, idx + q.length + 40);
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
}

// ----------------------------
// Local notes (saved from the website UI)
// ----------------------------

function mergeUserNotesIntoData(data) {
  const userNotesBySubject = loadUserNotes();
  if (!userNotesBySubject) return;

  data.subjects = data.subjects || {};

  for (const [subjectSlug, notes] of Object.entries(userNotesBySubject)) {
    if (!Array.isArray(notes) || notes.length === 0) continue;

    // If subject exists, append; otherwise create a minimal subject.
    if (!data.subjects[subjectSlug]) {
      data.subjects[subjectSlug] = {
        slug: subjectSlug,
        title: getUserSubjectTitle(subjectSlug) || subjectSlug,
        notes: []
      };
    }

    const existing = Array.isArray(data.subjects[subjectSlug].notes) ? data.subjects[subjectSlug].notes : [];
    data.subjects[subjectSlug].notes = existing.concat(notes);
  }
}

function loadUserNotes() {
  // Stored as: { [subjectSlug]: Note[] }
  // Note schema matches data/notes.json notes.
  try {
    const raw = localStorage.getItem('notes.userNotes.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ----------------------------
// Local subjects (saved from the website UI)
// ----------------------------

function mergeUserSubjectsIntoData(data) {
  const userSubjects = loadUserSubjects();
  if (!userSubjects) return;
  data.subjects = data.subjects || {};

  for (const [slug, title] of Object.entries(userSubjects)) {
    if (!data.subjects[slug]) {
      data.subjects[slug] = { slug, title: String(title || slug), notes: [] };
    } else {
      // Prefer user-custom title if provided.
      data.subjects[slug].title = String(title || data.subjects[slug].title || slug);
    }
  }
}

function applyDeletedSubjects(data) {
  const deleted = loadDeletedSubjects();
  if (!deleted || deleted.size === 0) return;
  for (const slug of deleted) {
    if (data.subjects?.[slug]) delete data.subjects[slug];
  }
}

function loadUserSubjects() {
  // Stored as: { [slug]: title }
  try {
    const raw = localStorage.getItem('notes.userSubjects.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveUserSubject(slug, title) {
  const all = loadUserSubjects() || {};
  all[slug] = title;
  localStorage.setItem('notes.userSubjects.v1', JSON.stringify(all));
}

function getUserSubjectTitle(slug) {
  const all = loadUserSubjects();
  return all?.[slug] ? String(all[slug]) : null;
}

function loadDeletedSubjects() {
  try {
    const raw = localStorage.getItem('notes.deletedSubjects.v1');
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function markSubjectDeleted(slug) {
  const set = loadDeletedSubjects();
  set.add(String(slug));
  localStorage.setItem('notes.deletedSubjects.v1', JSON.stringify(Array.from(set)));
}

function deleteSubjectEverywhere(slug) {
  // Remove user-created subject metadata
  const userSubjects = loadUserSubjects() || {};
  if (userSubjects[slug]) {
    delete userSubjects[slug];
    localStorage.setItem('notes.userSubjects.v1', JSON.stringify(userSubjects));
  }

  // Remove locally-saved notes for that subject
  const userNotes = loadUserNotes() || {};
  if (userNotes[slug]) {
    delete userNotes[slug];
    localStorage.setItem('notes.userNotes.v1', JSON.stringify(userNotes));
  }
}

function makeSubjectSlug(title) {
  // Generate a URL-friendly slug.
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || `subject-${Date.now()}`;
}

// ----------------------------
// Export / Import helpers
// ----------------------------

function buildExportPayload() {
  return {
    schema: 'notes-backup-v1',
    exportedAt: new Date().toISOString(),
    userSubjects: loadUserSubjects() || {},
    userNotes: loadUserNotes() || {},
    deletedSubjects: Array.from(loadDeletedSubjects())
  };
}

function applyImportPayload(payload) {
  if (!payload || payload.schema !== 'notes-backup-v1') {
    throw new Error('Invalid backup schema');
  }

  const userSubjects = payload.userSubjects && typeof payload.userSubjects === 'object' ? payload.userSubjects : {};
  const userNotes = payload.userNotes && typeof payload.userNotes === 'object' ? payload.userNotes : {};
  const deletedSubjects = Array.isArray(payload.deletedSubjects) ? payload.deletedSubjects : [];

  localStorage.setItem('notes.userSubjects.v1', JSON.stringify(userSubjects));
  localStorage.setItem('notes.userNotes.v1', JSON.stringify(userNotes));
  localStorage.setItem('notes.deletedSubjects.v1', JSON.stringify(deletedSubjects.map(String)));
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ----------------------------
// Safety: basic HTML escaping for injected text.
// ----------------------------
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
