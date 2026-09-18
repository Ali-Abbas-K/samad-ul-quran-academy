import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JWT_SECRET, ADMIN_KEY, TOKEN_TTL, SECURITY_HEADERS, WEB_DIR, NODE_ENV } from './config.js';

/* ---------------------------------------------------------------- HTTP ---- */

export function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(body);
}

export function readBody(req, limit = 3_500_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
export function mime(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

const IMMUTABLE = new Set(['.webp', '.jpg', '.jpeg', '.png', '.svg', '.woff2', '.woff', '.ico']);

export function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  // Allow clean URLs: /courses -> /courses.html
  const target = path.resolve(WEB_DIR, '.' + pathname);
  if (!target.startsWith(WEB_DIR)) return json(res, 403, { error: 'Forbidden' });

  const candidates = [target];
  if (!path.extname(target)) candidates.push(target + '.html');

  const file = candidates.find((f) => {
    try { return fs.statSync(f).isFile(); } catch { return false; }
  });

  if (!file) {
    const notFound = path.join(WEB_DIR, '404.html');
    if (fs.existsSync(notFound)) {
      const html = fs.readFileSync(notFound);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
      return res.end(html);
    }
    return json(res, 404, { error: 'Not found' });
  }

  const ext = path.extname(file).toLowerCase();
  const cache = NODE_ENV === 'production' && IMMUTABLE.has(ext)
    ? 'public, max-age=604800'
    : 'no-store, no-cache, must-revalidate';

  res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': cache, ...SECURITY_HEADERS });
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------ passwords ---- */

/** scrypt with a random salt — same `salt:hash` format used by earlier releases. */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(plain), salt, 64).toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [salt, hex] = String(stored || '').split(':');
  if (!salt || !hex) return false;
  try {
    const expected = Buffer.from(hex, 'hex');
    const actual = crypto.scryptSync(String(plain), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- tokens ---- */

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');

export function signToken(payload, ttl = TOKEN_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const data = b64({ ...payload, iat: now, exp: now + ttl });
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

export function readToken(req) {
  const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [head, data, sig] = raw.split('.');
  if (!head || !data || !sig) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${data}`).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export function adminKeyMatches(value) {
  const a = Buffer.from(String(value || ''));
  const b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/** Admin requests may present either the admin key header or an admin bearer token. */
export function isAdminRequest(req) {
  if (adminKeyMatches(req.headers['x-admin-key'])) return true;
  const token = readToken(req);
  return Boolean(token && token.role === 'admin');
}

/* ----------------------------------------------------------- rate limit ---- */

const buckets = new Map();
export function rateLimit(key, max = 8, windowMs = 900_000) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < 900_000);
    if (live.length) buckets.set(key, live); else buckets.delete(key);
  }
}, 300_000).unref?.();

/* ---------------------------------------------------------- validation ---- */

export const clean = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
export const lower = (v) => clean(v, 320).toLowerCase();

export function validEmail(v) {
  const e = lower(v);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
}

export function normalizePhone(v) {
  return String(v ?? '').replace(/[^0-9+]/g, '').replace(/^00/, '+').slice(0, 20);
}

const IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export function validImage(value, maxChars = 950_000) {
  if (!value) return true;
  return typeof value === 'string' && IMAGE_RE.test(value) && value.length < maxChars;
}

export function validIBAN(value) {
  const x = String(value || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x)) return false;
  let digits = '';
  for (const ch of x.slice(4) + x.slice(0, 4)) {
    digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  }
  try { return Number(BigInt(digits) % 97n) === 1; } catch { return false; }
}

export function validDate(value) {
  const v = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '';
}

export function validMonth(value) {
  const v = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : '';
}

export function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

export function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    qualification: u.qualification || '',
    experience: u.experience || '',
    bio: u.bio || '',
    specialities: u.specialities || '',
    active: u.active,
    avatar: u.avatar || '',
    account_status: u.account_status || 'active',
    created_at: u.created_at,
    last_login_at: u.last_login_at || '',
  };
}

export function roomName(studentEmail, course) {
  const hash = crypto.createHash('sha256').update(`samad|${String(studentEmail).toLowerCase()}|${course}`).digest('hex');
  return 'SamadUlQuran-' + hash.slice(0, 24);
}
