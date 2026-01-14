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
const https = require('https');
const { promises: fs } = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (err) {
  console.warn('bcryptjs not installed. Run: npm install');
  bcrypt = null;
}

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'notes.json');
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const PORT = Number(process.env.PORT || 5500);

const AUTH_ENABLED = String(process.env.NOTESPHERE_AUTH ?? '1') !== '0';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SESSION_COOKIE = 'notesphere.sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sessions = new Map();
let users = new Map(); // username -> { username, passwordHash, email, provider, createdAt }

let writeLock = Promise.resolve();

// ----------------------------
// User Management
// ----------------------------

async function loadUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    users = new Map(Object.entries(parsed));
  } catch (err) {
    if (err.code === 'ENOENT') {
      users = new Map();
      // Create default admin if no users exist
      if (bcrypt) {
        const hash = await bcrypt.hash('admin123', 10);
        users.set('admin', {
          username: 'admin',
          passwordHash: hash,
          email: 'admin@notesphere.local',
          provider: 'local',
          createdAt: new Date().toISOString()
        });
        await saveUsers();
      }
    } else {
      console.error('Failed to load users:', err);
    }
  }
}

async function saveUsers() {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  const data = Object.fromEntries(users);
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function createUser(username, password, email, provider = 'local') {
  if (users.has(username)) {
    throw new Error('Username already exists');
  }
  
  let passwordHash = null;
  if (provider === 'local' && password) {
    if (!bcrypt) throw new Error('Password hashing not available');
    passwordHash = await bcrypt.hash(password, 10);
  }
  
  const user = {
    username,
    passwordHash,
    email,
    provider,
    createdAt: new Date().toISOString()
  };
  
  users.set(username, user);
  await saveUsers();
  return { username, email, provider };
}

async function verifyPassword(username, password) {
  const user = users.get(username);
  if (!user || !user.passwordHash) return false;
  if (!bcrypt) return false;
  return await bcrypt.compare(password, user.passwordHash);
}

function findUserByEmail(email) {
  for (const user of users.values()) {
    if (user.email === email) return user;
  }
  return null;
}

// Simplified Google token verification
// In production, use google-auth-library package
async function verifyGoogleToken(idToken) {
  return new Promise((resolve) => {
    // This is a simplified verification that decodes the JWT
    // For production, you MUST use proper verification with Google's certificates
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        resolve(null);
        return;
      }
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Basic validation (in production, verify signature and issuer)
      if (payload.email && payload.email_verified) {
        resolve(payload);
      } else {
        resolve(null);
      }
    } catch (err) {
      console.error('Token decode error:', err);
      resolve(null);
    }
  });
}

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

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getReturnTo(url) {
  const full = url.pathname + (url.search || '');
  // Avoid open redirects: allow only same-site relative paths.
  if (!full.startsWith('/')) return '/index.html';
  if (full.startsWith('//')) return '/index.html';
  return full;
}

function setSessionCookie(res, sessionId, { maxAgeSeconds } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (typeof maxAgeSeconds === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  // If you're serving over HTTPS in production, also add: Secure
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  setSessionCookie(res, 'deleted', { maxAgeSeconds: 0 });
}

function getSession(req) {
  if (!AUTH_ENABLED) return { username: 'anonymous' };
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

function requireAuthApi(req, res) {
  if (!AUTH_ENABLED) return { username: 'anonymous' };
  const session = getSession(req);
  if (session) return session;
  sendJson(res, 401, { error: 'Unauthorized' });
  return null;
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

  if (req.method === 'GET' && url.pathname === '/api/me') {
    if (!AUTH_ENABLED) return sendJson(res, 200, { authenticated: true, username: 'anonymous' });
    const session = getSession(req);
    return sendJson(res, 200, session ? { authenticated: true, username: session.username } : { authenticated: false });
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readJsonBody(req);
    const username = body?.username ? String(body.username).trim() : '';
    const password = body?.password ? String(body.password) : '';
    if (!username || !password) return sendJson(res, 400, { error: 'username and password are required' });

    if (!AUTH_ENABLED) {
      return sendJson(res, 400, { error: 'Auth is disabled on this server' });
    }

    const isValid = await verifyPassword(username, password);
    if (!isValid) {
      return sendJson(res, 401, { error: 'Invalid credentials' });
    }

    const user = users.get(username);
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { username, email: user.email, createdAt: Date.now() });
    setSessionCookie(res, sid, { maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) });
    return sendJson(res, 200, { ok: true, username, email: user.email });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    const body = await readJsonBody(req);
    const username = body?.username ? String(body.username).trim() : '';
    const password = body?.password ? String(body.password) : '';
    const email = body?.email ? String(body.email).trim() : '';

    if (!username || !password || !email) {
      return sendJson(res, 400, { error: 'username, password, and email are required' });
    }

    if (!AUTH_ENABLED) {
      return sendJson(res, 400, { error: 'Auth is disabled on this server' });
    }

    if (!bcrypt) {
      return sendJson(res, 500, { error: 'Registration not available. Install bcryptjs: npm install' });
    }

    // Validate username
    if (username.length < 3 || username.length > 20) {
      return sendJson(res, 400, { error: 'Username must be 3-20 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return sendJson(res, 400, { error: 'Username can only contain letters, numbers, - and _' });
    }

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Invalid email address' });
    }

    // Check if email already exists
    if (findUserByEmail(email)) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    // Validate password strength
    if (password.length < 6) {
      return sendJson(res, 400, { error: 'Password must be at least 6 characters' });
    }

    try {
      const user = await createUser(username, password, email, 'local');
      
      // Auto-login after registration
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { username: user.username, email: user.email, createdAt: Date.now() });
      setSessionCookie(res, sid, { maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) });
      
      return sendJson(res, 201, { ok: true, username: user.username, email: user.email });
    } catch (err) {
      if (err.message === 'Username already exists') {
        return sendJson(res, 409, { error: err.message });
      }
      console.error('Registration error:', err);
      return sendJson(res, 500, { error: 'Registration failed' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/google') {
    const body = await readJsonBody(req);
    const idToken = body?.idToken ? String(body.idToken) : '';

    if (!idToken) {
      return sendJson(res, 400, { error: 'idToken is required' });
    }

    if (!AUTH_ENABLED) {
      return sendJson(res, 400, { error: 'Auth is disabled on this server' });
    }

    try {
      // Verify Google ID token (simplified - in production use google-auth-library)
      const payload = await verifyGoogleToken(idToken);
      
      if (!payload) {
        return sendJson(res, 401, { error: 'Invalid Google token' });
      }

      const email = payload.email;
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_');

      // Find or create user
      let user = findUserByEmail(email);
      if (!user) {
        // Create new user from Google account
        const createdUser = await createUser(username, null, email, 'google');
        user = { username: createdUser.username, email: createdUser.email };
      }

      // Create session
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { username: user.username, email: user.email, createdAt: Date.now() });
      setSessionCookie(res, sid, { maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) });

      return sendJson(res, 200, { ok: true, username: user.username, email: user.email });
    } catch (err) {
      console.error('Google auth error:', err);
      return sendJson(res, 401, { error: 'Google authentication failed' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = getSession(req);
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies[SESSION_COOKIE];
    if (sid) sessions.delete(sid);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true, wasAuthenticated: Boolean(session) });
  }

  // Require auth for all remaining API endpoints.
  if (AUTH_ENABLED) {
    const session = requireAuthApi(req, res);
    if (!session) return;
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

  if (AUTH_ENABLED) {
    const session = getSession(req);
    const isLoginPage = reqPath === '/login.html';
    const isProtectedHtml = reqPath === '/index.html' || reqPath === '/subject.html';
    const isProtectedData = reqPath.startsWith('/data/');

    if (!session && !isLoginPage && (isProtectedHtml || isProtectedData)) {
      // For data requests, return 401 instead of redirecting.
      if (isProtectedData) {
        const asJson = reqPath.toLowerCase().endsWith('.json');
        if (asJson) return sendJson(res, 401, { error: 'Unauthorized' });
        return sendText(res, 401, 'Unauthorized');
      }

      const returnTo = encodeURIComponent(getReturnTo(url));
      res.writeHead(302, { Location: `/login.html?return=${returnTo}` });
      return res.end();
    }
  }

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

// Initialize users database
loadUsers().then(() => {
  server.listen(PORT, () => {
    console.log(`Notes server running at http://localhost:${PORT}/`);
    console.log(`Data file: ${DATA_FILE}`);
    console.log(`Users file: ${USERS_FILE}`);

    if (AUTH_ENABLED) {
      console.log('Auth: enabled');
      console.log(`Registered users: ${users.size}`);
      if (GOOGLE_CLIENT_ID) {
        console.log('Google OAuth: enabled');
      } else {
        console.log('Google OAuth: disabled (set GOOGLE_CLIENT_ID to enable)');
      }
    } else {
      console.log('Auth: disabled (NOTESPHERE_AUTH=0)');
    }
  });
});
