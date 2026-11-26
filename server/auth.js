import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './paths.js';

const SECRET_PATH = join(DATA_DIR, 'secret.key');

function secret() {
  if (!existsSync(SECRET_PATH)) writeFileSync(SECRET_PATH, randomBytes(48).toString('hex'), { mode: 0o600 });
  return readFileSync(SECRET_PATH, 'utf8').trim();
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    if (!salt || !expected) return false;
    const actual = scryptSync(String(password), salt, 64);
    const wanted = Buffer.from(expected, 'hex');
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  } catch {
    return false;
  }
}

const b64 = (buffer) => Buffer.from(buffer).toString('base64url');
const unb64 = (text) => Buffer.from(String(text), 'base64url').toString('utf8');

export function signToken(user, ttlSeconds = 7 * 24 * 3600) {
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role_name || user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    iat: Math.floor(Date.now() / 1000)
  };
  const body = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', secret()).update(body).digest('base64url');
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(unb64(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const fail = (status, message, details) => { throw new HttpError(status, message, details); };
