/**
 * Simple Picture + Text Blog
 * Zero external dependencies — just Node.js built-ins.
 * Run with: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123'; // CHANGE THIS
const DATA_FILE = path.join(__dirname, 'data', 'posts.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

// In-memory session store: token -> { expires }
const sessions = {};

// ---------- Helpers: data ----------
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
  }
}

function loadPosts() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function savePosts(posts) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
}

// ---------- Helpers: sessions ----------
function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = { expires: Date.now() + 1000 * 60 * 60 * 8 }; // 8 hours
  return token;
}

function isValidSession(token) {
  if (!token || !sessions[token]) return false;
  if (Date.now() > sessions[token].expires) {
    delete sessions[token];
    return false;
  }
  return true;
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = header.split(';').map(c => c.trim());
  for (const c of cookies) {
    if (c.startsWith(name + '=')) return c.substring(name.length + 1);
  }
  return null;
}

function isAuthed(req) {
  const token = getCookie(req, 'session');
  return isValidSession(token);
}

// ---------- Helpers: HTML escaping (security) ----------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------- Helpers: multipart form parsing (for image upload) ----------
// Minimal multipart/form-data parser — no dependencies.
function parseMultipart(buffer, boundary) {
  const result = { fields: {}, files: {} };
  const boundaryBuffer = Buffer.from('--' + boundary);
  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    const nextBoundary = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (nextBoundary === -1) break;
    const part = buffer.slice(start + boundaryBuffer.length, nextBoundary);
    // Each part starts with \r\n then headers then \r\n\r\n then body then \r\n
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerStr = part.slice(0, headerEnd).toString('utf8');
      let body = part.slice(headerEnd + 4);
      // Strip trailing \r\n
      if (body.slice(-2).toString() === '\r\n') {
        body = body.slice(0, -2);
      }
      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]*)"/);
      const contentTypeMatch = headerStr.match(/Content-Type:\s*(.+)/i);
      if (filenameMatch && filenameMatch[1]) {
        const fieldName = nameMatch ? nameMatch[1] : 'file';
        result.files[fieldName] = {
          filename: filenameMatch[1],
          contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
          data: body
        };
      } else if (nameMatch) {
        result.fields[nameMatch[1]] = body.toString('utf8');
      }
    }
    start = nextBoundary;
  }
  return result;
}

function collectBody(req, callback) {
  const chunks = [];
  let size = 0;
  const MAX_SIZE = 15 * 1024 * 1024; // 15MB limit
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    callback(Buffer.concat(chunks));
  });
}

// ---------- Templates ----------
function layout(title, body, isAdmin) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #faf9f7;
    --text: #1a1a1a;
    --muted: #6b6b6b;
    --accent: #2563eb;
    --border: #e5e2dc;
    --card-bg: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
  }
  .wrap { max-width: 680px; margin: 0 auto; padding: 0 20px 80px; }
  header.site {
    border-bottom: 1px solid var(--border);
    padding: 28px 0 20px;
    margin-bottom: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  header.site h1 {
    font-size: 1.4rem;
    margin: 0;
    letter-spacing: -0.02em;
  }
  header.site a { color: var(--text); text-decoration: none; }
  header.site nav a {
    font-size: 0.9rem;
    color: var(--muted);
    margin-left: 16px;
  }
  .post {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 28px;
  }
  .post img {
    width: 100%;
    display: block;
    max-height: 600px;
    object-fit: cover;
  }
  .post .body { padding: 18px 20px 22px; }
  .post .date {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .post .text {
    white-space: pre-wrap;
    font-size: 1.02rem;
  }
  .post .admin-actions {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .post .admin-actions a {
    font-size: 0.85rem;
    color: #b91c1c;
    text-decoration: none;
  }
  .empty {
    text-align: center;
    color: var(--muted);
    padding: 60px 20px;
  }
  form.admin-form {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 36px;
  }
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 6px;
    margin-top: 16px;
  }
  label:first-child { margin-top: 0; }
  textarea, input[type="text"], input[type="password"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 1rem;
    font-family: inherit;
    resize: vertical;
  }
  textarea { min-height: 110px; }
  input[type="file"] {
    display: block;
    margin-top: 4px;
    font-size: 0.95rem;
  }
  button {
    margin-top: 20px;
    background: var(--accent);
    color: white;
    border: none;
    padding: 11px 20px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { opacity: 0.9; }
  .login-box {
    max-width: 320px;
    margin: 80px auto;
    text-align: center;
  }
  .login-box form {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    text-align: left;
  }
  .error-msg {
    background: #fef2f2;
    color: #b91c1c;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .success-msg {
    background: #f0fdf4;
    color: #15803d;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .hint { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="site">
    <a href="/"><h1>My Blog</h1></a>
    <nav>
      ${isAdmin
        ? '<a href="/admin">New post</a><a href="/logout">Log out</a>'
        : '<a href="/login">Admin</a>'}
    </nav>
  </header>
  ${body}
</div>
</body>
</html>`;
}

function renderPost(post, isAdmin) {
  const dateStr = new Date(post.createdAt).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  return `
  <article class="post">
    ${post.image ? `<img src="/uploads/${escapeHtml(post.image)}" alt="">` : ''}
    <div class="body">
      <div class="date">${dateStr}</div>
      ${post.text ? `<div class="text">${escapeHtml(post.text)}</div>` : ''}
      ${isAdmin ? `
        <div class="admin-actions">
          <a href="/admin/delete/${post.id}" onclick="return confirm('Delete this post?');">Delete post</a>
        </div>
      ` : ''}
    </div>
  </article>`;
}

// ---------- Route handlers ----------
function handleHome(req, res) {
  const posts = loadPosts().sort((a, b) => b.createdAt - a.createdAt);
  const admin = isAuthed(req);
  let body;
  if (posts.length === 0) {
    body = `<div class="empty">No posts yet.${admin ? ' <a href="/admin">Write your first one</a>.' : ''}</div>`;
  } else {
    body = posts.map(p => renderPost(p, admin)).join('\n');
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(layout('My Blog', body, admin));
}

function handleLoginPage(req, res, error) {
  const body = `
  <div class="login-box">
    <form method="POST" action="/login">
      ${error ? `<div class="error-msg">${escapeHtml(error)}</div>` : ''}
      <label for="password">Admin password</label>
      <input type="password" id="password" name="password" autofocus required>
      <button type="submit">Log in</button>
    </form>
  </div>`;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(layout('Log in', body, false));
}

function handleLoginSubmit(req, res) {
  collectBody(req, (buf) => {
    const fields = querystring.parse(buf.toString('utf8'));
    if (fields.password === ADMIN_PASSWORD) {
      const token = createSession();
      res.writeHead(302, {
        'Set-Cookie': `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`,
        'Location': '/admin'
      });
      res.end();
    } else {
      handleLoginPage(req, res, 'Wrong password. Try again.');
    }
  });
}

function handleLogout(req, res) {
  const token = getCookie(req, 'session');
  if (token) delete sessions[token];
  res.writeHead(302, {
    'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0',
    'Location': '/'
  });
  res.end();
}

function handleAdminPage(req, res, message) {
  if (!isAuthed(req)) {
    res.writeHead(302, { 'Location': '/login' });
    return res.end();
  }
  const body = `
  <form class="admin-form" method="POST" action="/admin/post" enctype="multipart/form-data">
    ${message ? `<div class="success-msg">${escapeHtml(message)}</div>` : ''}
    <label for="image">Picture (optional)</label>
    <input type="file" id="image" name="image" accept="image/*">
    <label for="text">Text</label>
    <textarea id="text" name="text" placeholder="What's on your mind?"></textarea>
    <button type="submit">Publish post</button>
  </form>`;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(layout('New post', body, true));
}

function handleCreatePost(req, res) {
  if (!isAuthed(req)) {
    res.writeHead(302, { 'Location': '/login' });
    return res.end();
  }
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad request');
  }
  const boundary = boundaryMatch[1].replace(/^"|"$/g, '');
  collectBody(req, (buf) => {
    const parsed = parseMultipart(buf, boundary);
    const text = (parsed.fields.text || '').trim();
    let imageFilename = null;

    if (parsed.files.image && parsed.files.image.filename) {
      const original = parsed.files.image.filename;
      const ext = path.extname(original).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
      imageFilename = crypto.randomBytes(12).toString('hex') + safeExt;
      fs.writeFileSync(path.join(UPLOADS_DIR, imageFilename), parsed.files.image.data);
    }

    if (!text && !imageFilename) {
      return handleAdminPage(req, res, null);
    }

    const posts = loadPosts();
    posts.push({
      id: crypto.randomBytes(8).toString('hex'),
      text,
      image: imageFilename,
      createdAt: Date.now()
    });
    savePosts(posts);

    res.writeHead(302, { 'Location': '/' });
    res.end();
  });
}

function handleDeletePost(req, res, id) {
  if (!isAuthed(req)) {
    res.writeHead(302, { 'Location': '/login' });
    return res.end();
  }
  let posts = loadPosts();
  const toDelete = posts.find(p => p.id === id);
  if (toDelete && toDelete.image) {
    const imgPath = path.join(UPLOADS_DIR, toDelete.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  posts = posts.filter(p => p.id !== id);
  savePosts(posts);
  res.writeHead(302, { 'Location': '/' });
  res.end();
}

function handleUploadFile(req, res, filename) {
  // Basic path traversal protection
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!filePath.startsWith(UPLOADS_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(safeName).toLowerCase();
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' });
    res.end(data);
  });
}

// ---------- Server ----------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  try {
    if (req.method === 'GET' && url === '/') return handleHome(req, res);
    if (req.method === 'GET' && url === '/login') return handleLoginPage(req, res, null);
    if (req.method === 'POST' && url === '/login') return handleLoginSubmit(req, res);
    if (req.method === 'GET' && url === '/logout') return handleLogout(req, res);
    if (req.method === 'GET' && url === '/admin') return handleAdminPage(req, res, null);
    if (req.method === 'POST' && url === '/admin/post') return handleCreatePost(req, res);
    if (req.method === 'GET' && url.startsWith('/admin/delete/')) {
      const id = url.split('/admin/delete/')[1];
      return handleDeletePost(req, res, id);
    }
    if (req.method === 'GET' && url.startsWith('/uploads/')) {
      const filename = url.split('/uploads/')[1];
      return handleUploadFile(req, res, filename);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`Blog running at http://localhost:${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
