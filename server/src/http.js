import { json, isAdminRequest } from './util.js';

/** Thrown by guards to abort a handler with a specific HTTP status. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg);
export const conflict = (msg) => new HttpError(409, msg);

export function requireUser(ctx, role) {
  if (!ctx.user) throw new HttpError(401, 'Please sign in to continue');
  if (role && ctx.user.role !== role) throw forbidden(`This area is for ${role} accounts only`);
  return ctx.user;
}

export function requireAdmin(ctx) {
  if (!isAdminRequest(ctx.req)) throw new HttpError(401, 'Administrator access required');
  return true;
}

export function send(ctx, status, payload) {
  json(ctx.res, status, payload);
}

export const ok = (ctx, payload = { ok: true }) => send(ctx, 200, payload);
export const created = (ctx, payload = { ok: true }) => send(ctx, 201, payload);
