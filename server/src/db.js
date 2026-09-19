import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

/**
 * Database backend.
 *
 * Local development keeps the original SQLite database unless DATABASE_URL is
 * configured. Render production uses PostgreSQL through a small synchronous
 * compatibility adapter backed by a worker thread. The adapter intentionally
 * preserves the existing db.prepare(...).get/all/run API so the application's
 * existing route code does not need a risky 200+ query rewrite.
 */

function makePostgresAdapter(url) {
  const BUFFER_SIZE = 32 * 1024 * 1024;
  const shared = new SharedArrayBuffer(4 + BUFFER_SIZE);
  const state = new Int32Array(shared, 0, 1);
  const bytes = new Uint8Array(shared, 4);
  const worker = new Worker(new URL('./pg-worker.js', import.meta.url), {
    workerData: { databaseUrl: url, sharedBuffer: shared },
  });
  let closed = false;

  function request(op, sql, params = []) {
    if (closed) throw new Error('Database is closed');
    Atomics.store(state, 0, 0);
    worker.postMessage({ op, sql, params });
    const result = Atomics.wait(state, 0, 0, 30000);
    if (result === 'timed-out') throw new Error('PostgreSQL query timed out after 30 seconds');
    const len = Atomics.load(state, 0) - 1;
    if (len < 0 || len > BUFFER_SIZE) throw new Error('Invalid PostgreSQL worker response');
    const text = new TextDecoder().decode(bytes.subarray(0, len));
    const payload = JSON.parse(text);
    if (!payload.ok) {
      const err = new Error(payload.error?.message || 'PostgreSQL query failed');
      if (payload.error?.code) err.code = payload.error.code;
      throw err;
    }
    return payload.result;
  }

  const adapter = {
    exec(sql) {
      const statements = String(sql).split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/).map((x) => x.trim()).filter(Boolean);
      for (const statement of statements) request('exec', statement, []);
    },
    prepare(sql) {
      const text = String(sql);
      return {
        get(...params) { return request('get', text, params); },
        all(...params) { return request('all', text, params); },
        run(...params) { return request('run', text, params); },
      };
    },
    close() {
      if (closed) return;
      closed = true;
      try { worker.postMessage({ op: 'close' }); } catch {}
      worker.terminate();
    },
  };
  return adapter;
}

function createPostgresWorkerAdapter(url) {
  return makePostgresAdapter(url);
}

export const USE_POSTGRES = Boolean(process.env.DATABASE_URL);
export const db = USE_POSTGRES
  ? createPostgresWorkerAdapter(process.env.DATABASE_URL)
  : (() => {
      if (!fs.existsSync(DB_PATH)) {
        try {
          fs.rmSync(DB_PATH + '-wal', { force: true });
          fs.rmSync(DB_PATH + '-shm', { force: true });
        } catch {}
      }
      const sqlite = new DatabaseSync(DB_PATH);
      try { sqlite.exec('PRAGMA busy_timeout=10000'); } catch {}
      try { sqlite.exec('PRAGMA journal_mode=WAL'); } catch {}
      try { sqlite.exec('PRAGMA foreign_keys=ON'); } catch {}
      return sqlite;
    })();

if (USE_POSTGRES) console.log('[db] PostgreSQL backend enabled via DATABASE_URL');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  qualification TEXT DEFAULT '',
  experience TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  avatar TEXT DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  fee REAL NOT NULL,
  duration TEXT DEFAULT 'Monthly',
  level TEXT DEFAULT 'All levels',
  image TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enrollments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  guardian_name TEXT DEFAULT '',
  age INTEGER,
  gender TEXT DEFAULT '',
  country TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  email TEXT NOT NULL,
  course TEXT NOT NULL,
  level TEXT DEFAULT '',
  timing TEXT NOT NULL,
  days TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Karachi',
  teacher TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  progress INTEGER NOT NULL DEFAULT 0,
  attendance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS class_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_email TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  course TEXT NOT NULL,
  room_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  student_email TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT DEFAULT '',
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,student_email)
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_email TEXT NOT NULL,
  enrollment_id INTEGER,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  method TEXT NOT NULL DEFAULT 'bank',
  reference TEXT NOT NULL,
  note TEXT DEFAULT '',
  proof TEXT DEFAULT '',
  billing_month TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  verified_at TEXT,
  verified_by TEXT,
  receipt_no TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_email TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_methods(
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  instructions TEXT DEFAULT '',
  account_detail TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS receipts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL UNIQUE,
  receipt_no TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_id) REFERENCES payments(id)
);

-- Added in this upgrade (new tables only; nothing existing is dropped)
CREATE TABLE IF NOT EXISTS gallery(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  image TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS testimonials(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  body TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reminder_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  billing_month TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_email,kind,billing_month)
);
`;

// SQLite-only PRAGMA statements are deliberately omitted for PostgreSQL.
if (USE_POSTGRES) {
  db.exec(SCHEMA
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
  );
} else {
  db.exec(SCHEMA);
}

/** Additive column migrations. Failures are expected when a column already exists. */
const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE users ADD COLUMN last_login_at TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN specialities TEXT DEFAULT ''",
  "ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'bank'",
  "ALTER TABLE payments ADD COLUMN proof TEXT DEFAULT ''",
  "ALTER TABLE payments ADD COLUMN billing_month TEXT DEFAULT ''",
  'ALTER TABLE payments ADD COLUMN verified_by TEXT',
  'ALTER TABLE payments ADD COLUMN receipt_no TEXT',
  "ALTER TABLE payments ADD COLUMN payment_date TEXT DEFAULT ''",
  "ALTER TABLE payments ADD COLUMN verification_notes TEXT DEFAULT ''",
  "ALTER TABLE payments ADD COLUMN submitted_at TEXT DEFAULT ''",
  "ALTER TABLE enrollments ADD COLUMN timezone TEXT DEFAULT 'Asia/Karachi'",
  "ALTER TABLE enrollments ADD COLUMN guardian_phone TEXT DEFAULT ''",
  "ALTER TABLE enrollments ADD COLUMN approved_at TEXT DEFAULT ''",
  "ALTER TABLE enrollments ADD COLUMN notes TEXT DEFAULT ''",
  "ALTER TABLE class_sessions ADD COLUMN topic TEXT DEFAULT ''",
  "ALTER TABLE chat_messages ADD COLUMN read_at TEXT",
];
for (const sql of MIGRATIONS) {
  try {
    db.exec(USE_POSTGRES ? sql.replace(/ADD COLUMN /, 'ADD COLUMN IF NOT EXISTS ') : sql);
  } catch { /* column already present */ }
}

const INDEXES = [
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_method_reference ON payments(method,reference) WHERE reference IS NOT NULL AND reference <> ''",
  'CREATE INDEX IF NOT EXISTS ix_payments_student ON payments(student_email,billing_month,status)',
  'CREATE INDEX IF NOT EXISTS ix_classes_student ON class_sessions(student_email,starts_at)',
  'CREATE INDEX IF NOT EXISTS ix_classes_teacher ON class_sessions(teacher_email,starts_at)',
  'CREATE INDEX IF NOT EXISTS ix_attendance_student ON attendance(student_email)',
  'CREATE INDEX IF NOT EXISTS ix_enrollments_email ON enrollments(email)',
  'CREATE INDEX IF NOT EXISTS ix_enrollments_teacher ON enrollments(teacher)',
  'CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_email,id)',
  'CREATE INDEX IF NOT EXISTS ix_chat_pair ON chat_messages(student_email,teacher_email,id)',
];
for (const sql of INDEXES) {
  try { db.exec(sql); } catch {}
}

export const DEFAULT_COURSES = [
  ['Noorani Qaida', 3500, 'A strong foundation for Arabic letters, joining, pronunciation and reading.', 'Beginner', 'Monthly', 'assets/img/course-noorani-qaida.webp'],
  ['Nazra Qur’an', 5000, 'Learn fluent Qur’an reading with correct pronunciation and steady practice.', 'Beginner–Intermediate', 'Monthly', 'assets/img/course-nazra.webp'],
  ['Hifz-ul-Qur’an', 6000, 'Qur’an memorization with guided revision and one-to-one instruction.', 'All levels', 'Monthly', 'assets/img/course-hifz.webp'],
  ['Tajweed', 7000, 'Structured tajweed training focused on accurate makharij and recitation rules.', 'All levels', 'Monthly', 'assets/img/course-tajweed.webp'],
  ['Namaz Course', 5000, 'Learn salah, duas and essential practical guidance step by step.', 'Beginner', 'Monthly', 'assets/img/course-namaz.webp'],
  ['Islamic Studies', 6000, 'Age-appropriate Islamic learning covering essential beliefs, manners and knowledge.', 'All levels', 'Monthly', 'assets/img/course-islamic-studies.webp'],
];
for (const [name, fee, description, level, duration, image] of DEFAULT_COURSES) {
  db.prepare('INSERT OR IGNORE INTO courses(name,fee,description,level,duration,image) VALUES(?,?,?,?,?,?)')
    .run(name, fee, description, level, duration, image);
  // Backfill an image for courses that were created before images existed.
  db.prepare("UPDATE courses SET image=? WHERE name=? AND (image IS NULL OR image='')").run(image, name);
}

/**
 * Starter gallery. These are the academy's own class photographs that ship with
 * the site, so the public "Inside the academy" section has real content on a
 * fresh install. They are ordinary gallery rows: an administrator can rename,
 * reorder, hide or delete any of them from Admin → Content, and replace them
 * with their own uploads. Seeded once only — if the table has any row at all
 * (including because an admin deleted these), nothing is re-inserted.
 */
const DEFAULT_GALLERY = [
  ['One-to-one recitation', 'A student reads to her teacher over a live class.', 'assets/img/gallery-1.webp'],
  ['Siblings learning together', 'Two brothers sharing a study desk for their evening lesson.', 'assets/img/gallery-2.webp'],
  ['Evening classes', 'Flexible timings for students who study after school or work.', 'assets/img/gallery-3.webp'],
  ['Letter by letter', 'Guided reading with a pointer — how Noorani Qaida begins.', 'assets/img/gallery-4.webp'],
  ['Parents stay involved', 'Families can sit in on classes and follow their child’s progress.', 'assets/img/gallery-5.webp'],
  ['Ready for class', 'Everything a student needs for a lesson at home.', 'assets/img/gallery-6.webp'],
];
if (!db.prepare('SELECT COUNT(*) n FROM gallery').get().n
  && !db.prepare("SELECT COUNT(*) n FROM settings WHERE key='_gallery_seeded'").get().n) {
  const ins = db.prepare('INSERT INTO gallery(title,caption,image,sort_order,active) VALUES(?,?,?,?,1)');
  DEFAULT_GALLERY.forEach(([title, caption, image], i) => ins.run(title, caption, image, i + 1));
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('_gallery_seeded','1')").run();
}

/**
 * Default settings. `INSERT OR IGNORE` means an administrator's saved value is
 * never overwritten by a restart. Blank values are deliberate — missing
 * credentials must be configured by the academy, never invented here.
 */
export const DEFAULT_SETTINGS = {
  academy_name: 'Samad-ul-Qur’an Academy',
  academy_tagline: 'Learn the Qur’an with clarity, from home.',
  academy_email: 'samadulquran@gmail.com',
  academy_phone: '+92 347 52 44 717',
  academy_whatsapp: '+923475244717',
  academy_address: '',
  academy_iban: 'PK31NAYA1234503227589462',
  academy_account_title: 'Hafiz Muhammad Saqib',
  bank_name: '',
  bank_account_number: '',
  easypaisa_account: '',
  easypaisa_account_title: '',
  jazzcash_account: '',
  jazzcash_account_title: '',
  payment_instructions: 'Transfer the exact monthly fee to the account below, then submit the transaction reference and a screenshot. Your payment stays pending until an administrator verifies it.',
  easypaisa_instructions: 'Send the exact monthly fee to the Easypaisa account below, then submit the transaction/reference ID and proof for administrator verification.',
  jazzcash_instructions: 'Send the exact monthly fee to the JazzCash account below, then submit the transaction/reference ID and proof for administrator verification.',
  cash_instructions: 'Request a cash payment and hand the fee to the academy administration. The request stays pending until an administrator records and approves it.',
  facebook_url: '',
  instagram_url: '',
  youtube_url: '',
  tiktok_url: '',
  due_day: '5',
  grace_end_day: '8',
  suspend_day: '9',
  trial_enabled: '1',
  currency: 'PKR',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v);
}

for (const [code, name] of [['bank', 'Bank Transfer'], ['easypaisa', 'Easypaisa'], ['jazzcash', 'JazzCash'], ['cash', 'Cash']]) {
  db.prepare('INSERT OR IGNORE INTO payment_methods(code,name) VALUES(?,?)').run(code, name);
}

export function setting(key) {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? '';
}
export function settingNum(key, fallback) {
  const n = Number(setting(key));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value ?? ''));
}
export function allSettings() {
  // Keys prefixed with "_" are internal bookkeeping (e.g. one-time seed markers)
  // and are never shown in the administrator settings screen.
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\' ORDER BY key").all().map((r) => [r.key, r.value]));
}

/** Public, non-sensitive academy profile used by the website and portals. */
export function academy() {
  return {
    name: setting('academy_name'),
    tagline: setting('academy_tagline'),
    email: setting('academy_email'),
    phone: setting('academy_phone'),
    whatsapp: setting('academy_whatsapp'),
    address: setting('academy_address'),
    iban: setting('academy_iban'),
    accountTitle: setting('academy_account_title'),
    bankName: setting('bank_name'),
    bankAccountNumber: setting('bank_account_number'),
    easypaisa: setting('easypaisa_account'),
    easypaisaTitle: setting('easypaisa_account_title'),
    jazzcash: setting('jazzcash_account'),
    jazzcashTitle: setting('jazzcash_account_title'),
    currency: setting('currency') || 'PKR',
    dueDay: settingNum('due_day', 5),
    graceEndDay: settingNum('grace_end_day', 8),
    suspendDay: settingNum('suspend_day', 9),
  };
}

export function social() {
  return {
    facebook: setting('facebook_url'),
    instagram: setting('instagram_url'),
    youtube: setting('youtube_url'),
    tiktok: setting('tiktok_url'),
    whatsapp: setting('academy_whatsapp'),
  };
}

export function log(actor, action, details = '') {
  try {
    db.prepare('INSERT INTO audit_logs(actor,action,details) VALUES(?,?,?)').run(String(actor), String(action), String(details ?? ''));
  } catch {}
}

export function notify(email, title, body, type = 'info') {
  if (!email) return;
  db.prepare('INSERT INTO notifications(user_email,title,body,type) VALUES(?,?,?,?)')
    .run(String(email).toLowerCase(), title, body, type);
}

export function courseByName(name) {
  return db.prepare('SELECT * FROM courses WHERE name=?').get(name);
}

/* Payments store the method as a short code ('bank', 'easypaisa'). The UI reads
   `method_label` so tables show "Bank Transfer" rather than "bank". Decorating
   in one place keeps every payment response consistent. */
export function methodLabels() {
  const out = {};
  for (const r of db.prepare('SELECT code,name FROM payment_methods').all()) out[r.code] = r.name;
  return out;
}

export function withMethodLabel(rows) {
  const labels = methodLabels();
  const one = (r) => (r && typeof r === 'object'
    ? { ...r, method_label: labels[r.method] || r.method || '' }
    : r);
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}
