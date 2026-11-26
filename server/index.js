import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { PUBLIC_DIR, UPLOAD_DIR } from './paths.js';
import { routes } from './api.js';
import { HttpError } from './auth.js';
import './db.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8'
};

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readBody(req, limit = 24 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large (maximum 24 MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolveBody({});
      try { resolveBody(JSON.parse(raw)); }
      catch { reject(new HttpError(400, 'Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

function safePath(root, relative) {
  const target = resolve(root, '.' + decodeURIComponent(relative));
  const base = resolve(root);
  if (target !== base && !target.startsWith(base + sep)) return null;
  return target;
}

async function serveFile(res, path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(path);
    res.writeHead(200, {
      'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.pattern.exec(pathname);
        if (!match) continue;
        const result = await route.handler({ req, res, body, query, params: match.groups || {}, url });
        if (result !== undefined) return sendJSON(res, result.status || 200, result.body ?? result);
        return;
      }
      return sendJSON(res, 404, { error: 'API route not found.' });
    }

    if (pathname.startsWith('/media/')) {
      const file = safePath(UPLOAD_DIR, pathname.slice('/media'.length));
      if (!file) { res.writeHead(403); return res.end('Forbidden'); }
      return await serveFile(res, file);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); return res.end('Method not allowed');
    }
    let file = safePath(PUBLIC_DIR, pathname === '/' ? '/index.html' : pathname);
    if (!file) { res.writeHead(403); return res.end('Forbidden'); }
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
    } catch { /* fall through to 404 */ }
    return await serveFile(res, file);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('[eduplay]', error);
    if (!res.headersSent) sendJSON(res, status, {
      error: error.message || 'Unexpected server error.',
      details: error.details
    });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`EduPlay is running at http://localhost:${PORT}`);
  console.log('Demo accounts: teacher@eduplay.ph / Teacher123!  •  student@eduplay.ph / Student123!');
});
