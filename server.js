/*
  server.js
  Minimal backend + static file server for the Personal Notes website.

  What it does:
  - Serves static files (index.html, subject.html, assets/, data/)
  - Provides a JSON API to create/update/delete subjects and notes
  - Persists changes to data/notes.json (so edits are saved on disk)

  Run:
    node server.js

  Then open:
    http://localhost:5500/
*/

const http = require('http');
const { promises: fs } = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'notes.json');
const PORT = Number(process.env.PORT || 5500);

let writeLock = Promise.resolve();

function withWriteLock(fn) {
  // Serialize writes to avoid clobbering notes.json.
  writeLock = writeLock.then(fn, fn);
  return writeLock;
}

function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendText(res, status, text, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(text);
}

function safeJoin(root, unsafePath) {
  // Prevent directory traversal.
  const normalized = path.normalize(unsafePath).replace(/^([/\\])+/, '');
  const joined = path.join(root, normalized);
  if (!joined.startsWith(root)) return null;
  return joined;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

async function readNotesFile() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid notes.json');
    parsed.version = parsed.version || 1;
    parsed.subjects = parsed.subjects && typeof parsed.subjects === 'object' ? parsed.subjects : {};
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { version: 1, subjects: {} };
    }
    throw err;
  }
}

async function writeNotesFile(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, json, 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

function slugifySubject(title) {
  const slug = String(title)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return slug || `subject-${Date.now()}`;
}

function makeNoteId(subjectSlug, title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  return `${subjectSlug}-${Date.now()}-${slug || 'note'}`;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  return JSON.parse(text);
}

function matchRoute(urlPath, pattern) {
  // pattern examples:
  // - /api/subjects/:slug
  // - /api/subjects/:slug/notes/:id
  const a = urlPath.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;

  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/data') {
    const data = await readNotesFile();
    return sendJson(res, 200, data);
  }

  if (req.method === 'GET' && url.pathname === '/api/export') {
    const data = await readNotesFile();
    return sendJson(res, 200, data, {
      'Content-Disposition': `attachment; filename="notes-${new Date().toISOString().slice(0, 10)}.json"`
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || typeof body.subjects !== 'object') {
      return sendJson(res, 400, { error: 'Invalid data. Expected { subjects: {...} }' });
    }

    // Minimal normalization
    const normalized = {
      version: 1,
      subjects: body.subjects
    };

    await withWriteLock(async () => {
      await writeNotesFile(normalized);
    });

    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/subjects') {
    const body = await readJsonBody(req);
    const title = body?.title ? String(body.title).trim() : '';
    if (!title) return sendJson(res, 400, { error: 'title is required' });

    const slug = body?.slug ? String(body.slug).trim() : slugifySubject(title);

    return await withWriteLock(async () => {
      const data = await readNotesFile();
      if (data.subjects[slug]) return sendJson(res, 409, { error: 'Subject already exists', slug });

      data.subjects[slug] = { slug, title, notes: [] };
      await writeNotesFile(data);
      return sendJson(res, 201, data.subjects[slug]);
    });
  }

  const delSubjectParams = matchRoute(url.pathname, '/api/subjects/:slug');
  if (req.method === 'DELETE' && delSubjectParams) {
    const { slug } = delSubjectParams;

    return await withWriteLock(async () => {
      const data = await readNotesFile();
      if (!data.subjects[slug]) return sendJson(res, 404, { error: 'Subject not found' });

      delete data.subjects[slug];
      await writeNotesFile(data);
      return sendJson(res, 200, { ok: true });
    });
  }

  const addNoteParams = matchRoute(url.pathname, '/api/subjects/:slug/notes');
  if (req.method === 'POST' && addNoteParams) {
    const { slug } = addNoteParams;
    const body = await readJsonBody(req);
    const title = body?.title ? String(body.title).trim() : '';
    const blocks = Array.isArray(body?.blocks) ? body.blocks : null;

    if (!title) return sendJson(res, 400, { error: 'title is required' });
    if (!blocks) return sendJson(res, 400, { error: 'blocks must be an array' });

    return await withWriteLock(async () => {
      const data = await readNotesFile();
      const subject = data.subjects[slug];
      if (!subject) return sendJson(res, 404, { error: 'Subject not found' });

      subject.notes = Array.isArray(subject.notes) ? subject.notes : [];

      const note = {
        id: makeNoteId(slug, title),
        title,
        blocks
      };
      subject.notes.push(note);
      await writeNotesFile(data);
      return sendJson(res, 201, note);
    });
  }

  const updateNoteParams = matchRoute(url.pathname, '/api/subjects/:slug/notes/:id');
  if (req.method === 'PUT' && updateNoteParams) {
    const { slug, id } = updateNoteParams;
    const body = await readJsonBody(req);

    const title = body?.title ? String(body.title).trim() : '';
    const blocks = Array.isArray(body?.blocks) ? body.blocks : null;

    if (!title) return sendJson(res, 400, { error: 'title is required' });
    if (!blocks) return sendJson(res, 400, { error: 'blocks must be an array' });

    return await withWriteLock(async () => {
      const data = await readNotesFile();
      const subject = data.subjects[slug];
      if (!subject) return sendJson(res, 404, { error: 'Subject not found' });

      subject.notes = Array.isArray(subject.notes) ? subject.notes : [];
      const idx = subject.notes.findIndex((n) => n.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'Note not found' });

      subject.notes[idx] = { id, title, blocks };
      await writeNotesFile(data);
      return sendJson(res, 200, subject.notes[idx]);
    });
  }

  if (req.method === 'DELETE' && updateNoteParams) {
    const { slug, id } = updateNoteParams;

    return await withWriteLock(async () => {
      const data = await readNotesFile();
      const subject = data.subjects[slug];
      if (!subject) return sendJson(res, 404, { error: 'Subject not found' });

      subject.notes = Array.isArray(subject.notes) ? subject.notes : [];
      const before = subject.notes.length;
      subject.notes = subject.notes.filter((n) => n.id !== id);
      if (subject.notes.length === before) return sendJson(res, 404, { error: 'Note not found' });

      data.subjects[slug].notes = subject.notes;
      await writeNotesFile(data);
      return sendJson(res, 200, { ok: true });
    });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

async function handleStatic(req, res, url) {
  // Map URL to file path
  let reqPath = url.pathname;
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = safeJoin(ROOT, reqPath);
  if (!filePath) return sendText(res, 400, 'Bad path');

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      // Directory -> try index.html inside
      const maybe = path.join(filePath, 'index.html');
      const maybeStat = await fs.stat(maybe);
      if (maybeStat.isFile()) {
        const bytes = await fs.readFile(maybe);
        res.writeHead(200, { 'Content-Type': contentTypeFor(maybe) });
        return res.end(bytes);
      }
      return sendText(res, 404, 'Not found');
    }

    const bytes = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    return res.end(bytes);
  } catch (err) {
    return sendText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    return await handleStatic(req, res, url);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Notes server running at http://localhost:${PORT}/`);
  console.log(`Data file: ${DATA_FILE}`);
});
