/*
  subject.js (Subject page)
  Responsibilities:
  - Read subject slug from URL (subject.html?subject=physics)
  - Load notes from local JSON
  - Render notes as readable blocks (headings, lists, code)
  - Search within this subject
  - Handle theme toggle (persisted)
*/

(async function () {
  const subjectTitle = document.getElementById('subjectTitle');
  const subjectMeta = document.getElementById('subjectMeta');
  const notesContainer = document.getElementById('notesContainer');
  const subjectSearch = document.getElementById('subjectSearch');

  const noteForm = document.getElementById('noteForm');
  const noteTitleInput = document.getElementById('noteTitle');
  const noteContentInput = document.getElementById('noteContent');
  const downloadMyNotesBtn = document.getElementById('downloadMyNotes');
  const cancelEditBtn = document.getElementById('cancelEdit');
  const sortSelect = document.getElementById('sortSelect');
  const wordCountEl = document.getElementById('wordCount');
  const charCountEl = document.getElementById('charCount');

  const submitBtn = noteForm?.querySelector('button[type="submit"]');
  let editingNoteId = null;

  // Theme handling (same behavior as home page)
  const themeToggle = document.getElementById('themeToggle');
  initTheme(themeToggle);

  const subjectSlug = new URLSearchParams(window.location.search).get('subject');

  if (!subjectSlug) {
    subjectTitle.textContent = 'Subject not specified';
    subjectMeta.textContent = 'Go back to Home and pick a subject.';
    notesContainer.innerHTML = renderEmpty('No subject selected.');
    return;
  }

  let data;
  try {
    data = await loadNotesData();
    if (!isBackendAvailable()) {
      mergeUserSubjectsIntoData(data);
      mergeUserNotesIntoData(data);
    }
  } catch (err) {
    if (String(err?.message || '').includes('AUTH_REQUIRED')) {
      const returnUrl = window.location.pathname + window.location.search;
      window.location.href = `/login.html?return=${encodeURIComponent(returnUrl)}`;
      return;
    }
    subjectTitle.textContent = 'Failed to load notes';
    subjectMeta.textContent = 'Run via a local server. See README.md.';
    notesContainer.innerHTML = renderEmpty('Could not load data/notes.json.');
    console.error(err);
    return;
  }

  const subject = data.subjects?.[subjectSlug];
  if (!subject) {
    subjectTitle.textContent = 'Subject not found';
    subjectMeta.textContent = `No subject with slug: ${subjectSlug}`;
    notesContainer.innerHTML = renderEmpty('Unknown subject.');
    return;
  }

  document.title = `${subject.title} • NoteSphere`;
  subjectTitle.textContent = subject.title;

  let allNotes = subject.notes || [];
  subjectMeta.textContent = `${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;

  // Initial render
  renderNotes(notesContainer, allNotes);

  // Update note stats as user types
  noteContentInput?.addEventListener('input', () => {
    const text = noteContentInput.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    if (wordCountEl) wordCountEl.textContent = words;
    if (charCountEl) charCountEl.textContent = chars;
  });

  // Sort notes
  sortSelect?.addEventListener('change', () => {
    const sortType = sortSelect.value;
    allNotes = sortNotes(allNotes, sortType);
    const q = subjectSearch.value.trim().toLowerCase();
    if (q) {
      const filtered = allNotes.filter((note) => {
        const haystack = [note.title, ...flattenNoteText(note.blocks || [])].join('\n').toLowerCase();
        return haystack.includes(q);
      });
      renderNotes(notesContainer, filtered);
    } else {
      renderNotes(notesContainer, allNotes);
    }
  });

  // Search within this subject
  subjectSearch.addEventListener('input', () => {
    const q = subjectSearch.value.trim().toLowerCase();
    if (!q) {
      subjectMeta.textContent = `${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;
      renderNotes(notesContainer, allNotes);
      return;
    }

    const filtered = allNotes.filter((note) => {
      const haystack = [note.title, ...flattenNoteText(note.blocks || [])].join('\n').toLowerCase();
      return haystack.includes(q);
    });

    subjectMeta.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'} for “${subjectSearch.value.trim()}”`;
    renderNotes(notesContainer, filtered);
  });

  // ----------------------------
  // Add Note (saved in browser localStorage)
  // ----------------------------

  noteForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = (noteTitleInput?.value || '').trim();
    const content = (noteContentInput?.value || '').trim();
    if (!title || !content) return;

    const blocks = parseEditorContentToBlocks(content);

    const save = async () => {
      if (isBackendAvailable()) {
        if (editingNoteId) {
          await updateNoteBackend(subject.slug, editingNoteId, { title, blocks });
        } else {
          await createNoteBackend(subject.slug, { title, blocks });
        }

        const fresh = await loadNotesData();
        allNotes = fresh.subjects?.[subject.slug]?.notes || [];
      } else {
        if (editingNoteId) {
          updateUserNote(subject.slug, editingNoteId, { title, blocks });
        } else {
          const note = {
            id: makeNoteId(subject.slug, title),
            title,
            blocks,
            _source: 'local'
          };
          saveUserNote(subject.slug, note);
        }

        const fresh = await loadNotesData();
        mergeUserSubjectsIntoData(fresh);
        mergeUserNotesIntoData(fresh);
        allNotes = fresh.subjects?.[subject.slug]?.notes || [];
      }

      const q = subjectSearch.value.trim().toLowerCase();
      if (q) {
        const filtered = allNotes.filter((n) => {
          const haystack = [n.title, ...flattenNoteText(n.blocks || [])].join('\n').toLowerCase();
          return haystack.includes(q);
        });
        subjectMeta.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'} for “${subjectSearch.value.trim()}”`;
        renderNotes(notesContainer, filtered);
      } else {
        subjectMeta.textContent = `${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;
        renderNotes(notesContainer, allNotes);
      }
    };

    save()
      .then(() => {
        editingNoteId = null;
        cancelEditBtn.hidden = true;
        if (submitBtn) submitBtn.textContent = 'Save Note';

        noteTitleInput.value = '';
        noteContentInput.value = '';
        if (wordCountEl) wordCountEl.textContent = '0';
        if (charCountEl) charCountEl.textContent = '0';
        noteTitleInput.focus();
        showToast(editingNoteId ? 'Note updated' : 'Note saved successfully', 'success');
      })
      .catch((err) => {
        showToast('Could not save note', 'error');
        console.error(err);
      });
  });

  downloadMyNotesBtn?.addEventListener('click', () => {
    if (isBackendAvailable()) {
      downloadJson(allNotes, `notes-${subject.slug}.json`);
      return;
    }

    const bySubject = loadUserNotes() || {};
    const myNotes = Array.isArray(bySubject[subject.slug]) ? bySubject[subject.slug] : [];
    downloadJson(myNotes, `my-notes-${subject.slug}.json`);
  });

  cancelEditBtn?.addEventListener('click', () => {
    editingNoteId = null;
    cancelEditBtn.hidden = true;
    if (submitBtn) submitBtn.textContent = 'Save Note';
    noteTitleInput.value = '';
    noteContentInput.value = '';
    noteTitleInput.focus();
  });

  notesContainer?.addEventListener('click', (e) => {
    const copyLinkBtn = e.target?.closest?.('[data-action="copy-link"]');
    if (copyLinkBtn) {
      const id = copyLinkBtn.getAttribute('data-id');
      if (!id) return;
      const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
      navigator.clipboard.writeText(url)
        .then(() => showToast('Link copied to clipboard', 'success'))
        .catch(() => showToast('Failed to copy link', 'error'));
      return;
    }

    const editBtn = e.target?.closest?.('[data-action="edit-note"]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      if (!id) return;
      const note = allNotes.find((n) => n.id === id);
      if (!note) return;

      editingNoteId = id;
      cancelEditBtn.hidden = false;
      if (submitBtn) submitBtn.textContent = 'Save Changes';
      noteTitleInput.value = note.title || '';
      noteContentInput.value = blocksToEditorText(note.blocks || []);
      
      // Update stats for existing content
      const text = noteContentInput.value.trim();
      if (wordCountEl) wordCountEl.textContent = text ? text.split(/\s+/).length : 0;
      if (charCountEl) charCountEl.textContent = text.length;
      
      noteTitleInput.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const delBtn = e.target?.closest?.('[data-action="delete-note"]');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (!id) return;
      const ok = window.confirm('Delete this note?');
      if (!ok) return;

      const run = async () => {
        if (isBackendAvailable()) {
          await deleteNoteBackend(subject.slug, id);
          const fresh = await loadNotesData();
          allNotes = fresh.subjects?.[subject.slug]?.notes || [];
        } else {
          deleteUserNote(subject.slug, id);
          const fresh = await loadNotesData();
          mergeUserSubjectsIntoData(fresh);
          mergeUserNotesIntoData(fresh);
          allNotes = fresh.subjects?.[subject.slug]?.notes || [];
        }

        if (editingNoteId === id) {
          editingNoteId = null;
          cancelEditBtn.hidden = true;
          if (submitBtn) submitBtn.textContent = 'Save Note';
          noteTitleInput.value = '';
          noteContentInput.value = '';
        }

        subjectMeta.textContent = `${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;
        renderNotes(notesContainer, allNotes);
        showToast('Note deleted', 'success');
      };

      run().catch((err) => {
        showToast('Could not delete note', 'error');
        console.error(err);
      });
      return;
    }

    const copyBtn = e.target?.closest?.('[data-action="copy-code"]');
    if (copyBtn) {
      const codeEl = copyBtn.parentElement?.querySelector('code');
      const code = codeEl?.textContent || '';
      navigator.clipboard.writeText(code)
        .then(() => {
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
        })
        .catch(() => {
          try {
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            copyBtn.textContent = 'Copied';
            setTimeout(() => (copyBtn.textContent = 'Copy'), 900);
          } catch {
            alert('Copy failed.');
          }
        });
    }
  });
})();

// ----------------------------
// Theme helpers (same as home)
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
    // Typical failure case: opening subject.html directly (file://) blocks fetch().
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

async function createNoteBackend(subjectSlug, { title, blocks }) {
  return await fetchJson(`/api/subjects/${encodeURIComponent(subjectSlug)}/notes`, {
    method: 'POST',
    body: { title, blocks }
  });
}

async function updateNoteBackend(subjectSlug, noteId, { title, blocks }) {
  return await fetchJson(`/api/subjects/${encodeURIComponent(subjectSlug)}/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    body: { title, blocks }
  });
}

async function deleteNoteBackend(subjectSlug, noteId) {
  const res = await fetch(`/api/subjects/${encodeURIComponent(subjectSlug)}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE'
  });
  if (res.status === 401) {
    const returnUrl = window.location.pathname + window.location.search;
    window.location.href = `/login.html?return=${encodeURIComponent(returnUrl)}`;
    throw new Error('AUTH_REQUIRED');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return true;
}

// ----------------------------
// Local notes storage helpers
// ----------------------------

function mergeUserNotesIntoData(data) {
  const userNotesBySubject = loadUserNotes();
  if (!userNotesBySubject) return;

  data.subjects = data.subjects || {};
  for (const [subjectSlug, notes] of Object.entries(userNotesBySubject)) {
    if (!Array.isArray(notes) || notes.length === 0) continue;

    if (!data.subjects[subjectSlug]) {
      data.subjects[subjectSlug] = { slug: subjectSlug, title: subjectSlug, notes: [] };
    }

    const existing = Array.isArray(data.subjects[subjectSlug].notes) ? data.subjects[subjectSlug].notes : [];
    data.subjects[subjectSlug].notes = existing.concat(notes);
  }
}

function mergeUserSubjectsIntoData(data) {
  const userSubjects = loadUserSubjects();
  if (!userSubjects) return;

  data.subjects = data.subjects || {};
  for (const [slug, title] of Object.entries(userSubjects)) {
    if (!data.subjects[slug]) {
      data.subjects[slug] = { slug, title: String(title || slug), notes: [] };
    } else {
      data.subjects[slug].title = String(title || data.subjects[slug].title || slug);
    }
  }
}

function loadUserSubjects() {
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

function loadUserNotes() {
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

function saveUserNote(subjectSlug, note) {
  const all = loadUserNotes() || {};
  const list = Array.isArray(all[subjectSlug]) ? all[subjectSlug] : [];
  all[subjectSlug] = list.concat([note]);
  localStorage.setItem('notes.userNotes.v1', JSON.stringify(all));
}

function updateUserNote(subjectSlug, noteId, { title, blocks }) {
  const all = loadUserNotes() || {};
  const list = Array.isArray(all[subjectSlug]) ? all[subjectSlug] : [];
  all[subjectSlug] = list.map((n) => (n.id === noteId ? { ...n, title, blocks, _source: 'local' } : n));
  localStorage.setItem('notes.userNotes.v1', JSON.stringify(all));
}

function deleteUserNote(subjectSlug, noteId) {
  const all = loadUserNotes() || {};
  const list = Array.isArray(all[subjectSlug]) ? all[subjectSlug] : [];
  all[subjectSlug] = list.filter((n) => n.id !== noteId);
  localStorage.setItem('notes.userNotes.v1', JSON.stringify(all));
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

function makeNoteId(subjectSlug, title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${subjectSlug}-${Date.now()}-${slug || 'note'}`;
}

// ----------------------------
// Editor content parser (simple markdown-ish)
// ----------------------------

function parseEditorContentToBlocks(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];

  let paragraphBuffer = [];
  let listBuffer = null; // { ordered, items: [] }
  let codeBuffer = null; // { language, lines: [] }

  const flushParagraph = () => {
    const content = paragraphBuffer.join(' ').trim();
    if (content) blocks.push({ type: 'paragraph', text: content });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer && listBuffer.items.length) {
      blocks.push({ type: 'list', ordered: !!listBuffer.ordered, items: listBuffer.items });
    }
    listBuffer = null;
  };

  const flushCode = () => {
    if (codeBuffer) {
      blocks.push({ type: 'code', language: codeBuffer.language || '', code: codeBuffer.lines.join('\n') + '\n' });
      codeBuffer = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    // Code fence handling
    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();

      if (!codeBuffer) {
        const lang = trimmed.slice(3).trim();
        codeBuffer = { language: lang, lines: [] };
      } else {
        flushCode();
      }
      continue;
    }

    if (codeBuffer) {
      codeBuffer.lines.push(line);
      continue;
    }

    // Blank line -> end paragraph/list
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Heading (#, ##, ### ...)
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: trimmed.replace(/^#{1,6}\s+/, '') });
      continue;
    }

    // Ordered list: 1. item
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!listBuffer || listBuffer.ordered !== true) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(orderedMatch[1]);
      continue;
    }

    // Unordered list: - item / * item
    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (!listBuffer || listBuffer.ordered !== false) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(unorderedMatch[1]);
      continue;
    }

    // Default: paragraph line
    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return blocks;
}

function blocksToEditorText(blocks) {
  const parts = [];

  for (const block of blocks || []) {
    if (!block || !block.type) continue;

    if (block.type === 'heading') {
      parts.push(`# ${String(block.text || '').trim()}`);
      continue;
    }

    if (block.type === 'paragraph') {
      parts.push(String(block.text || '').trim());
      continue;
    }

    if (block.type === 'quote') {
      parts.push(`> ${String(block.text || '').trim()}`);
      continue;
    }

    if (block.type === 'list') {
      const items = Array.isArray(block.items) ? block.items : [];
      if (block.ordered) {
        items.forEach((it, idx) => parts.push(`${idx + 1}. ${String(it)}`));
      } else {
        items.forEach((it) => parts.push(`- ${String(it)}`));
      }
      continue;
    }

    if (block.type === 'code') {
      const lang = String(block.language || '').trim();
      const code = String(block.code || '').replace(/\s+$/, '');
      const fence = '```' + (lang ? lang : '');
      parts.push(fence + '\n' + code + '\n```');
      continue;
    }
  }

  const out = parts
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return out ? out + '\n' : '';
}

function flattenNoteText(blocks) {
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

// ----------------------------
// Rendering
// ----------------------------

function renderNotes(container, notes) {
  if (!notes || notes.length === 0) {
    container.innerHTML = renderEmpty('No notes match your search.');
    return;
  }

  container.innerHTML = notes.map(renderNote).join('');
}

function renderNote(note) {
  const blocksHtml = (note.blocks || []).map(renderBlock).join('');
  const title = note?.title ? String(note.title) : 'Untitled';

  // id is used for deep-linking from global search results.
  return `
    <article class="note" id="${escapeAttr(note.id)}">
      <div class="note__header">
        <h2 class="note__title">${escapeHtml(title)}</h2>
        <div class="note__actions">
          <button class="btn btn--ghost btn--copy-link" type="button" data-action="copy-link" data-id="${escapeAttr(note.id)}" title="Copy link to note">🔗 Copy Link</button>
          <button class="btn btn--ghost" type="button" data-action="edit-note" data-id="${escapeAttr(note.id)}">Edit</button>
          <button class="btn btn--danger" type="button" data-action="delete-note" data-id="${escapeAttr(note.id)}">Delete</button>
        </div>
      </div>
      <div class="note__body">
        ${blocksHtml}
      </div>
    </article>
  `.trim();
}

function renderBlock(block) {
  // Notes are stored as structured blocks in data/notes.json.
  // This keeps rendering simple (no markdown parser needed).
  if (!block || !block.type) return '';

  if (block.type === 'heading') {
    return `<h3>${escapeHtml(block.text || '')}</h3>`;
  }

  if (block.type === 'paragraph') {
    return `<p>${escapeHtml(block.text || '')}</p>`;
  }

  if (block.type === 'quote') {
    // Simple quote style using <p> + muted text.
    return `<p class="muted">${escapeHtml(block.text || '')}</p>`;
  }

  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = (block.items || []).map((it) => `<li>${escapeHtml(it)}</li>`).join('');
    return `<${tag}>${items}</${tag}>`;
  }

  if (block.type === 'code') {
    // language is optional, but helpful for future syntax highlighting.
    const lang = block.language ? `language-${escapeAttr(block.language)}` : '';
    return `
      <div class="code-block">
        <button class="code-copy" type="button" data-action="copy-code">Copy</button>
        <pre><code class="${lang}">${escapeHtml(block.code || '')}</code></pre>
      </div>
    `.trim();
  }

  return '';
}

function renderEmpty(message) {
  return `
    <div class="empty-state" role="status">
      <div class="empty-state__icon">📝</div>
      <h3 class="empty-state__title">No notes yet</h3>
      <p class="empty-state__text">${escapeHtml(message)}</p>
    </div>
  `.trim();
}

// ----------------------------
// Sorting
// ----------------------------

function sortNotes(notes, sortType) {
  const sorted = [...notes];
  
  switch (sortType) {
    case 'title-asc':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'title-desc':
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      break;
    case 'default':
    default:
      // Keep original order
      break;
  }
  
  return sorted;
}

// ----------------------------
// Safety
// ----------------------------

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(str) {
  // Attribute-safe escaping (simple)
  return escapeHtml(str).replaceAll(' ', '_');
}
