import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..', '..');
export const WEB_DIR = path.join(ROOT, 'web');
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'samad-ul-quran.db');
export const TZ = 'Asia/Karachi';

fs.mkdirSync(DATA_DIR, { recursive: true });

/** Minimal .env loader (no dependencies). Existing process env always wins. */
function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    /* .env is optional */
  }
}
loadDotEnv(path.join(ROOT, 'server', '.env'));

export const PORT = Number(process.env.PORT || 8080);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const HOST = process.env.HOST || (NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

const INSECURE_SECRET = 'CHANGE_THIS_SECRET_BEFORE_DEPLOYMENT';
const INSECURE_ADMIN_KEY = 'CHANGE_THIS_ADMIN_KEY_BEFORE_DEPLOYMENT';

export const JWT_SECRET = process.env.JWT_SECRET || INSECURE_SECRET;
export const ADMIN_KEY = process.env.ADMIN_KEY || INSECURE_ADMIN_KEY;

/** Session lifetime in seconds (12 hours). */
export const TOKEN_TTL = 60 * 60 * 12;

/**
 * Optional payment-gateway credentials.
 * These are intentionally NOT invented. When they are absent the academy runs the
 * manual payment-proof workflow (student submits reference + proof, admin verifies).
 * Set them in server/.env to enable a real gateway integration.
 */
export const GATEWAYS = {
  easypaisa: {
    storeId: process.env.EASYPAISA_STORE_ID || '',
    hashKey: process.env.EASYPAISA_HASH_KEY || '',
    postUrl: process.env.EASYPAISA_POST_URL || '',
  },
  jazzcash: {
    merchantId: process.env.JAZZCASH_MERCHANT_ID || '',
    password: process.env.JAZZCASH_PASSWORD || '',
    integritySalt: process.env.JAZZCASH_INTEGRITY_SALT || '',
    postUrl: process.env.JAZZCASH_POST_URL || '',
  },
};

export function gatewayConfigured(code) {
  if (code === 'easypaisa') {
    const g = GATEWAYS.easypaisa;
    return Boolean(g.storeId && g.hashKey && g.postUrl);
  }
  if (code === 'jazzcash') {
    const g = GATEWAYS.jazzcash;
    return Boolean(g.merchantId && g.password && g.integritySalt && g.postUrl);
  }
  return false;
}

export function startupWarnings() {
  const warn = [];
  if (JWT_SECRET === INSECURE_SECRET) warn.push('JWT_SECRET is not set — set it in server/.env before deploying.');
  if (ADMIN_KEY === INSECURE_ADMIN_KEY) warn.push('ADMIN_KEY is not set — set it in server/.env before deploying.');
  if (ORIGIN_LIST.includes('*')) warn.push('ALLOWED_ORIGINS contains "*", which is ignored — list each origin explicitly.');
  if (NODE_ENV === 'production' && warn.length) warn.push('Refusing to treat this as a secure production deployment.');
  return warn;
}

/**
 * Cross-origin API access — off by default.
 *
 * The normal deployment serves the website and the API from one origin, so no
 * CORS headers are needed and none are sent. Two situations do need it:
 *
 *   - the Android app shipping the bundled copy of the site, whose pages are
 *     file:// and therefore send `Origin: null`;
 *   - a split deployment where the static site sits on a different host to the API.
 *
 * Set ALLOWED_ORIGINS in server/.env to a comma-separated allow-list, e.g.
 *     ALLOWED_ORIGINS=null
 *     ALLOWED_ORIGINS=https://app.samadulquran.com,https://samadulquran.com
 *
 * "*" is deliberately not supported: every authenticated endpoint here reads a
 * bearer token, and a wildcard allow-list combined with credentials is exactly
 * the configuration that turns a token leak into account takeover.
 */
const ORIGIN_LIST = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const ALLOWED_ORIGINS = ORIGIN_LIST.filter((o) => o !== '*');

export function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.length) return null;
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), display-capture=(self "https://meet.jit.si")',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    'frame-src https://meet.jit.si',
    "form-action 'self'",
    "connect-src 'self'",
    "frame-ancestors 'self'",
  ].join('; '),
};
