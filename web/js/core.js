/* =============================================================================
   core.js — shared runtime for the Samad-ul-Qur'an Academy web app.
   No inline script anywhere in the HTML: the Content-Security-Policy is
   script-src 'self', so every handler is attached here through delegation.
   ========================================================================== */

/* --------------------------------------------------------------- config --- */

const API = 'https://samad-ul-quran-academy-1.onrender.com/api';
const PK_TZ = 'Asia/Karachi';

/* -------------------------------------------------------------- storage --- */
/* localStorage throws in sandboxed/opaque-origin frames, so it always has an
   in-memory fallback. Sessions still work; they simply do not survive reload. */

const memoryStore = new Map();
const store = {
  get(key) {
    try { const v = localStorage.getItem(key); if (v !== null) return v; } catch { /* ignore */ }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  set(key, value) {
    memoryStore.set(key, String(value));
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  },
  remove(key) {
    memoryStore.delete(key);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const TOKEN_KEY = 'suq.token';
const ROLE_KEY = 'suq.role';
const USER_KEY = 'suq.user';

const auth = {
  get token() { return store.get(TOKEN_KEY) || ''; },
  get role() { return store.get(ROLE_KEY) || ''; },
  get user() {
    try { return JSON.parse(store.get(USER_KEY) || 'null'); } catch { return null; }
  },
  save(token, user, role) {
    store.set(TOKEN_KEY, token);
    store.set(ROLE_KEY, role || user?.role || '');
    store.set(USER_KEY, JSON.stringify(user || null));
  },
  update(user) { store.set(USER_KEY, JSON.stringify(user || null)); },
  clear() { [TOKEN_KEY, ROLE_KEY, USER_KEY].forEach(store.remove); },
  loginUrl(role) {
    return role === 'teacher' ? 'teacher-login.html' : role === 'admin' ? 'admin-login.html' : 'student-login.html';
  },
};

/* ------------------------------------------------------------- http ------- */

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(path, options = {}) {
  const opts = { method: options.method || 'GET', headers: { Accept: 'application/json' } };
  if (options.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  const token = options.token === null ? '' : (options.token || auth.token);
  if (token) opts.headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API + path, opts);
  } catch (err) {
    throw new ApiError('Cannot reach the academy server. Check your internet connection and try again.', 0, {});
  }

  let payload = {};
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 300) }; }
  }

  if (!res.ok) {
    if (res.status === 401 && auth.token) {
      auth.clear();
      const role = document.body.dataset.role;
      if (role) {
        toast('Your session expired. Please sign in again.', 'warning');
        setTimeout(() => { location.href = auth.loginUrl(role); }, 1200);
      }
    }
    throw new ApiError(payload.error || payload.message || `Request failed (${res.status})`, res.status, payload);
  }
  return payload;
}

const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

/* ------------------------------------------------------------- format ----- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function money(amount, currency) {
  const n = Number(amount || 0);
  const cur = currency || 'PKR';
  return `${cur} ${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}

function parseStamp(value) {
  if (!value) return null;
  const s = String(value).trim().replace(' ', 'T');
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Server timestamps are stored as Pakistan-local wall clock; render them as such. */
function fmtDateTime(value) {
  const d = parseStamp(value);
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'UTC',
  });
}

function fmtDate(value) {
  const d = parseStamp(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtTime(value) {
  const d = parseStamp(value);
  if (!d) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

function fmtDay(value) {
  const d = parseStamp(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function relTime(value) {
  const d = parseStamp(value);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins} min ago` : `in ${-mins} min`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return hrs > 0 ? `${hrs} hr ago` : `in ${-hrs} hr`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days} day${Math.abs(days) === 1 ? '' : 's'} ago` : `in ${-days} days`;
  return fmtDate(value);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function pkNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    monthKey: `${parts.year}-${parts.month}`,
    day: Number(parts.day),
  };
}

function monthLabel(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return String(month || '—');
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function badge(status, extraClass) {
  const label = String(status || '—');
  return `<span class="badge badge-${slugify(label) || 'plain'}${extraClass ? ` ${extraClass}` : ''}">${esc(label)}</span>`;
}

function avatar(name, image, cls) {
  if (image) return `<span class="avatar ${cls || ''}"><img src="${esc(image)}" alt="" width="38" height="38" style="width:100%;height:100%;object-fit:cover"></span>`;
  return `<span class="avatar ${cls || ''}" aria-hidden="true">${esc(initials(name))}</span>`;
}

/* --------------------------------------------------------------- icons ---- */

const ICONS = {
  book: '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11v18H5.5A2.5 2.5 0 0 1 3 18.5v-13Z"/><path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H13v18h5.5A2.5 2.5 0 0 0 21 18.5v-13Z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.4 6.4 0 0 1 12.4 0"/><path d="M16.5 5.6a3 3 0 0 1 0 5.8"/><path d="M18 20a6 6 0 0 0-2-4.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 2"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.8 2.8L16.4 9.6"/>',
  alert: '<path d="M12 3.6 2.6 20h18.8L12 3.6Z"/><path d="M12 9.5v4.2M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  bell: '<path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z"/><path d="M10 18.5a2.2 2.2 0 0 0 4 0"/>',
  chat: '<path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4a10 10 0 0 1-2.6-.35L4.5 20.5l1.3-3.4A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z"/>',
  video: '<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 11l5-3v8l-5-3z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/>',
  shield: '<path d="M12 3 5 6v6c0 4.3 3 7.9 7 9 4-1.1 7-4.7 7-9V6l-7-3Z"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  logout: '<path d="M14.5 8.5V5.8A1.8 1.8 0 0 0 12.7 4H6.3A1.8 1.8 0 0 0 4.5 5.8v12.4A1.8 1.8 0 0 0 6.3 20h6.4a1.8 1.8 0 0 0 1.8-1.8v-2.7"/><path d="M9.5 12h10.5M17 9l3 3-3 3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
  upload: '<path d="M12 16.5V4.5M8 8l4-3.5L16 8"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4.5v12M8 13l4 3.5L16 13"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5H6.5a2 2 0 0 0-2 2v9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.8 6.8 8.2 6 8.2-6"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6L16.5 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
  pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  whatsapp: '<path d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.5 20.5l4.4-1.3A8.4 8.4 0 1 0 12 3.5Z"/><path d="M9 9.2c0 3 2.3 5.3 5.3 5.3.5 0 1-.4 1-1v-.8l-1.7-.7-.8.9a4.6 4.6 0 0 1-2.2-2.2l.9-.8-.7-1.7H10c-.6 0-1 .4-1 1Z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>',
  quran: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v14H6.5A2.5 2.5 0 0 0 4 20.5v-14Z"/><path d="M9 8.5h6M9 11.5h4"/>',
  certificate: '<circle cx="12" cy="10" r="5.5"/><path d="M9 15v6l3-2 3 2v-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5v3Z"/><path d="M14.5 5.5 18.5 9.5"/>',
  trash: '<path d="M4.5 7h15M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12S18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.5 5.9A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-2.6 3.4"/><path d="M6.2 8A17 17 0 0 0 2.5 12S6 18.2 12 18.2c1 0 1.9-.2 2.7-.4"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 16h10v4H7z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  home: '<path d="M4 11 12 4l8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8Z"/>',
  key: '<circle cx="8.5" cy="8.5" r="4.5"/><path d="m11.8 11.8 8.2 8.2M16.5 16.5l2-2M19 19l1.5-1.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  facebook: '<path d="M14 8.5h2.5V5.5H14a3.5 3.5 0 0 0-3.5 3.5V11H8.5v3h2v6h3v-6h2.2l.5-3h-2.7V9.3c0-.4.3-.8.5-.8Z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.6" cy="7.4" r="1"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="m11 9.5 4 2.5-4 2.5v-5Z"/>',
  tiktok: '<path d="M13.5 4v9.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1"/><path d="M13.5 4c.4 2.3 2 3.9 4.3 4.1"/>',
};

function icon(name, cls) {
  const path = ICONS[name] || ICONS.info;
  return `<svg class="${cls || 'icon'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* --------------------------------------------------------------- toasts --- */

function toastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

function toast(message, type = 'info', title = '') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : type === 'warning' ? 'alert' : 'info';
  el.innerHTML = `${icon(iconName)}<div>${title ? `<strong>${esc(title)}</strong>` : ''}<span>${esc(message)}</span></div>`
    + '<button type="button" data-toast-close aria-label="Dismiss">&times;</button>';
  toastStack().appendChild(el);
  const kill = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('[data-toast-close]').addEventListener('click', kill);
  setTimeout(kill, type === 'error' ? 7000 : 4500);
  return el;
}

/* --------------------------------------------------------------- modal ---- */

let openModal = null;

function modal({ title, subtitle, body, footer, wide, onMount }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title || 'Dialog')}">
      <div class="modal-head">
        <div><h3>${esc(title || '')}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        <button type="button" class="modal-close" data-modal-close aria-label="Close">${icon('close')}</button>
      </div>
      <div class="modal-body">${body || ''}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  openModal = backdrop;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-modal-close]')) closeModal();
  });
  const focusable = backdrop.querySelector('input, select, textarea, button:not([data-modal-close])');
  if (focusable) setTimeout(() => focusable.focus(), 60);
  if (typeof onMount === 'function') onMount(backdrop);
  return backdrop;
}

function closeModal() {
  if (!openModal) return;
  openModal.remove();
  openModal = null;
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    document.body.classList.remove('nav-open', 'sidebar-open');
  }
});

function confirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary', requireNote = false, notePlaceholder = 'Reason' }) {
  return new Promise((resolve) => {
    const box = modal({
      title,
      body: `<p>${esc(message)}</p>${requireNote
        ? `<div class="field mt-4"><label for="confirm-note">Reason <span class="req">*</span></label>
             <textarea class="textarea" id="confirm-note" placeholder="${esc(notePlaceholder)}" required></textarea>
             <span class="error-text">This field is required.</span></div>`
        : ''}`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
               <button type="button" class="btn btn-${tone}" data-confirm-go>${esc(confirmLabel)}</button>`,
    });
    let settled = false;
    box.querySelector('[data-confirm-go]').addEventListener('click', () => {
      const noteEl = box.querySelector('#confirm-note');
      if (requireNote && !noteEl.value.trim()) {
        noteEl.closest('.field').classList.add('has-error');
        noteEl.focus();
        return;
      }
      settled = true;
      const note = noteEl ? noteEl.value.trim() : '';
      closeModal();
      resolve({ ok: true, note });
    });
    const observer = new MutationObserver(() => {
      if (!document.body.contains(box) && !settled) { settled = true; observer.disconnect(); resolve({ ok: false }); }
    });
    observer.observe(document.body, { childList: true });
  });
}

/* ------------------------------------------------------------ form utils -- */

function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('is-loading', Boolean(loading));
  button.disabled = Boolean(loading);
}

function fieldError(input, message) {
  const field = input.closest('.field');
  if (!field) return;
  field.classList.toggle('has-error', Boolean(message));
  const holder = field.querySelector('.error-text');
  if (holder && message) holder.textContent = message;
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
}

function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.group) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else {
        out[el.name] = el.checked;
      }
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
      else if (!(el.name in out)) out[el.name] = '';
    } else {
      out[el.name] = el.value;
    }
  }
  return out;
}

/** Reads a file input into a data URL, enforcing the same limits as the API. */
function readImage(file, maxBytes = 700 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      return reject(new Error('Please choose a PNG, JPG or WEBP image.'));
    }
    if (file.size > maxBytes) {
      return reject(new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please use one under 700 KB.`));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------- render helpers --- */

function skeletonRows(count = 4) {
  return Array.from({ length: count }, () => '<div class="skeleton skeleton-row"></div>').join('');
}

function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton skeleton-card"></div>').join('');
}

function emptyState(title, message, action) {
  return `<div class="empty-state"><span class="icon-badge">${icon('info')}</span>
    <h3>${esc(title)}</h3><p>${esc(message)}</p>${action || ''}</div>`;
}

function errorState(message, retryAction) {
  return `<div class="error-state"><span class="icon-badge">${icon('alert')}</span>
    <h3>Something went wrong</h3><p>${esc(message)}</p>
    ${retryAction ? `<button type="button" class="btn btn-outline" data-action="${esc(retryAction)}">${icon('refresh')} Try again</button>` : ''}</div>`;
}

function mount(target, html) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el) el.innerHTML = html;
  return el;
}

function qs(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

/* ------------------------------------------------------------- shell ------ */

function initHeader() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.addEventListener('click', () => document.body.classList.remove('nav-open'));
    });
  }
  if (header) {
    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  const page = document.body.dataset.page;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
  });
}

function initSidebar() {
  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  }
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (backdrop) backdrop.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
  const page = document.body.dataset.page;
  document.querySelectorAll('.side-link').forEach((link) => {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
  });
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach((el) => io.observe(el));
}

function initPasswordToggles() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.password-toggle');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = icon(show ? 'eyeOff' : 'eye');
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

function initCopyButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const value = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied to clipboard', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied to clipboard', 'success'); }
      catch { toast('Copy is blocked in this browser. Please select the text manually.', 'warning'); }
      ta.remove();
    }
  });
}

function initFileDrops() {
  document.addEventListener('change', async (e) => {
    const input = e.target.closest('.file-drop input[type=file]');
    if (!input) return;
    const drop = input.closest('.file-drop');
    const preview = drop.parentElement.querySelector('.file-preview');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const dataUrl = await readImage(file);
      drop.dataset.value = dataUrl;
      if (preview) {
        preview.classList.add('is-set');
        preview.innerHTML = `<img src="${dataUrl}" alt="Selected file preview">
          <p class="tiny muted mt-2">${esc(file.name)} · ${(file.size / 1024).toFixed(0)} KB
          <button type="button" class="copy-btn" data-clear-file>Remove</button></p>`;
      }
      const label = drop.querySelector('[data-drop-label]');
      if (label) label.textContent = file.name;
    } catch (err) {
      input.value = '';
      drop.dataset.value = '';
      toast(err.message, 'error');
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear-file]')) return;
    const wrap = e.target.closest('.field, .stack, form') || document;
    const drop = wrap.querySelector('.file-drop');
    const preview = wrap.querySelector('.file-preview');
    if (drop) {
      drop.dataset.value = '';
      const input = drop.querySelector('input[type=file]');
      if (input) input.value = '';
      const label = drop.querySelector('[data-drop-label]');
      if (label) label.textContent = label.dataset.dropLabel || 'Choose a file';
    }
    if (preview) { preview.classList.remove('is-set'); preview.innerHTML = ''; }
  });
  document.addEventListener('dragover', (e) => {
    const drop = e.target.closest('.file-drop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.add('is-over');
  });
  document.addEventListener('dragleave', (e) => {
    const drop = e.target.closest('.file-drop');
    if (drop) drop.classList.remove('is-over');
  });
  document.addEventListener('drop', (e) => {
    const drop = e.target.closest('.file-drop');
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    const input = drop.querySelector('input[type=file]');
    if (input && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

function initAccordionGroups() {
  document.querySelectorAll('[data-accordion-group]').forEach((group) => {
    group.addEventListener('toggle', (e) => {
      const item = e.target;
      if (item.tagName !== 'DETAILS' || !item.open) return;
      group.querySelectorAll('details[open]').forEach((other) => { if (other !== item) other.open = false; });
    }, true);
  });
}

function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach((bar) => {
    bar.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      e.preventDefault();
      const scope = bar.dataset.tabs;
      bar.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      document.querySelectorAll(`[data-tab-panel][data-scope="${scope}"]`).forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== tab.dataset.tab;
      });
    });
  });
}

function initYear() {
  const y = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = y; });
}

/** Fills header/footer contact + social details from admin-configured settings. */
async function applyPublicSettings() {
  const needs = document.querySelector('[data-academy], [data-social], [data-whatsapp-link]');
  if (!needs) return null;
  let data;
  try {
    data = await api.get('/public/settings', { token: null });
  } catch {
    return null;
  }
  const { academy: a = {}, social: s = {} } = data;
  document.querySelectorAll('[data-academy]').forEach((el) => {
    const key = el.dataset.academy;
    const value = a[key];
    if (!value) {
      if (el.dataset.hideEmpty !== undefined) el.closest('[data-hide-wrap]')?.setAttribute('hidden', '');
      return;
    }
    if (el.tagName === 'A') {
      el.textContent = value;
      if (key === 'email') el.href = `mailto:${value}`;
      else if (key === 'phone') el.href = `tel:${String(value).replace(/[^\d+]/g, '')}`;
    } else {
      el.textContent = value;
    }
  });
  const waNumber = String(a.whatsapp || '').replace(/[^\d]/g, '');
  document.querySelectorAll('[data-whatsapp-link]').forEach((el) => {
    if (!waNumber) { el.setAttribute('hidden', ''); return; }
    const text = el.dataset.whatsappText || 'Assalam-u-alaikum, I would like to know more about the Qur\'an classes.';
    el.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    el.removeAttribute('hidden');
  });
  document.querySelectorAll('[data-social]').forEach((el) => {
    const url = s[el.dataset.social];
    if (url) { el.href = url; el.removeAttribute('hidden'); }
    else el.setAttribute('hidden', '');
  });
  const socialRow = document.querySelector('[data-social-row]');
  if (socialRow && !socialRow.querySelector('a:not([hidden])')) {
    const note = socialRow.parentElement.querySelector('[data-social-empty]');
    if (note) note.removeAttribute('hidden');
  }
  window.SAMAD_SETTINGS = data;
  return data;
}

/* ------------------------------------------------------------ guards ----- */

/** Redirects to the right login page when the portal is opened without a session. */
function requireRole(role) {
  if (!auth.token || (auth.role && auth.role !== role)) {
    const back = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`${auth.loginUrl(role)}?next=${back}`);
    return false;
  }
  return true;
}

function logout(role) {
  auth.clear();
  location.href = auth.loginUrl(role || document.body.dataset.role);
}

function initLogout() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-logout]')) return;
    e.preventDefault();
    logout();
  });
}

/* ---------------------------------------------------------- boot ---------- */

const PAGE_HANDLERS = {};

function registerPage(name, handler) {
  PAGE_HANDLERS[name] = handler;
}

async function boot() {
  initHeader();
  initSidebar();
  initReveal();
  initPasswordToggles();
  initCopyButtons();
  initFileDrops();
  initAccordionGroups();
  initTabs();
  initYear();
  initLogout();
  await applyPublicSettings();
  const page = document.body.dataset.page;
  const handler = PAGE_HANDLERS[page];
  if (typeof handler === 'function') {
    try {
      await handler();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Something went wrong while loading this page.', 'error');
    }
  }
}

window.SUQ = {
  API, api, ApiError, auth, store, toast, modal, closeModal, confirmDialog,
  esc, money, fmtDate, fmtDateTime, fmtTime, fmtDay, relTime, initials, badge, avatar, icon,
  monthLabel, pkNow, slugify, setLoading, fieldError, clearFieldErrors, formValues, readImage,
  skeletonRows, skeletonCards, emptyState, errorState, mount, qs, requireRole, logout,
  registerPage, applyPublicSettings, parseStamp,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { boot(); });
} else {
  boot();
}
