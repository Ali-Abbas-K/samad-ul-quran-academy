/**
 * Samad-ul-Qur'an Academy — application server.
 *
 * Zero-dependency Node.js (>= 22.5) HTTP server:
 *   • SQLite persistence via the built-in `node:sqlite` module
 *   • Signed-token auth (students, teachers) + admin key / admin token
 *   • Server-side billing lifecycle (due → grace → suspension → reactivation)
 *   • Static hosting for the `web/` front-end so the site and API share one origin
 *
 * Run:  node server.js       (see server/.env.example for configuration)
 */
import http from 'node:http';
import { PORT, HOST, NODE_ENV, startupWarnings, corsHeaders } from './src/config.js';
import { db } from './src/db.js';
import { json, readBody, serveStatic, readToken, isAdminRequest } from './src/util.js';
import { HttpError } from './src/http.js';
import { runBilling, runBillingThrottled } from './src/billing.js';

import publicRoutes from './src/routes/public.js';
import authRoutes from './src/routes/auth.js';
import studentRoutes from './src/routes/student.js';
import teacherRoutes from './src/routes/teacher.js';
import classroomRoutes from './src/routes/classroom.js';
import adminRoutes from './src/routes/admin.js';

/* ------------------------------------------------------------- routing ---- */

const routes = new Map();
for (const table of [publicRoutes, authRoutes, studentRoutes, teacherRoutes, classroomRoutes, adminRoutes]) {
  for (const [key, handler] of Object.entries(table)) {
    if (routes.has(key)) throw new Error(`Duplicate route registered: ${key}`);
    routes.set(key, handler);
  }
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  /* Cross-origin access is same-origin-only unless ALLOWED_ORIGINS names an
     origin explicitly (see src/config.js). `corsHeaders` returns null for every
     origin that is not on the list, so the default behaviour is unchanged. */
  const cors = corsHeaders(req.headers.origin);
  if (cors) for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

  if (method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET,POST,PATCH,DELETE,OPTIONS' });
    return res.end();
  }

  if (!url.pathname.startsWith('/api/')) {
    if (method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, url);
  }

  const key = `${method} ${url.pathname.replace(/\/+$/, '') || '/api'}`;
  const handler = routes.get(key);
  if (!handler) return json(res, 404, { error: 'Unknown API endpoint', endpoint: key });

  let bodyCache;
  const ctx = {
    req,
    res,
    url,
    method,
    ip: clientIp(req),
    user: readToken(req),
    isAdmin: isAdminRequest(req),
    body: async () => (bodyCache ??= await readBody(req)),
  };

  try {
    // Keep the billing lifecycle current even without an external scheduler.
    runBillingThrottled();
    await handler(ctx);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message, ...err.extra });
    if (err && Number(err.status) >= 400) return json(res, Number(err.status), { error: err.message });
    console.error(`[error] ${key}`, err);
    return json(res, 500, {
      error: 'Something went wrong on the server. Please try again.',
      ...(NODE_ENV === 'production' ? {} : { detail: String(err && err.message || err) }),
    });
  }
});

/* ------------------------------------------------------------- startup ---- */

for (const warning of startupWarnings()) console.warn(`[config] ${warning}`);

try {
  const summary = runBilling('startup');
  console.log(`[billing] startup pass: ${summary.checked} student(s) checked, ${summary.suspended} suspended, ${summary.reactivated} reactivated, ${summary.reminders} reminder(s)`);
} catch (err) {
  console.error('[billing] initial pass failed:', err.message);
}

server.listen(PORT, HOST, () => {
  const students = db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n;
  const teachers = db.prepare("SELECT COUNT(*) n FROM users WHERE role='teacher'").get().n;
  console.log(`Samad-ul-Qur'an Academy server running at http://${HOST}:${PORT}`);
  console.log(`  environment : ${NODE_ENV}`);
  console.log(`  api routes  : ${routes.size}`);
  console.log(`  accounts    : ${students} student(s), ${teachers} teacher(s)`);
});

function shutdown(signal) {
  console.log(`\n[${signal}] shutting down…`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
