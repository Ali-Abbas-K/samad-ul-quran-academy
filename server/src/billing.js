import { TZ } from './config.js';
import { db, setting, settingNum, notify, log, courseByName } from './db.js';

/* ------------------------------------------------------- Pakistan clock ---- */

/** Current date/time as observed in Asia/Karachi, regardless of server TZ. */
export function nowPK() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    monthKey: `${parts.year}-${parts.month}`,
  };
}

export function currentMonth() {
  return nowPK().monthKey;
}

export function monthLabel(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return String(month || '');
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function billingRules() {
  return {
    dueDay: settingNum('due_day', 5),
    graceEndDay: settingNum('grace_end_day', 8),
    suspendDay: settingNum('suspend_day', 9),
  };
}

/* ----------------------------------------------------------- enrollment ---- */

const BILLABLE = ['Approved', 'Active'];

export function activeEnrollment(email) {
  return db.prepare(
    `SELECT * FROM enrollments WHERE lower(email)=lower(?) AND status IN (${BILLABLE.map(() => '?').join(',')})
     ORDER BY id DESC LIMIT 1`,
  ).get(email, ...BILLABLE);
}

export function latestEnrollment(email) {
  return db.prepare('SELECT * FROM enrollments WHERE lower(email)=lower(?) ORDER BY id DESC LIMIT 1').get(email);
}

export function monthlyFee(email) {
  const e = activeEnrollment(email) || latestEnrollment(email);
  if (!e) return 0;
  return Number(courseByName(e.course)?.fee || 0);
}

export function verifiedForMonth(email, month) {
  return Number(
    db.prepare(
      "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE lower(student_email)=lower(?) AND billing_month=? AND status='verified'",
    ).get(email, month)?.total || 0,
  );
}

export function pendingForMonth(email, month) {
  return Number(
    db.prepare(
      "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE lower(student_email)=lower(?) AND billing_month=? AND status='pending'",
    ).get(email, month)?.total || 0,
  );
}

/** Backwards-compatible helper: verified amount for the current billing month. */
export function monthlyPaid(email) {
  return verifiedForMonth(email, currentMonth());
}

/**
 * Billing state for one student.
 *  paid       – current month verified in full
 *  upcoming   – before the due day
 *  due        – on the due day
 *  grace      – after the due day, up to and including the grace end day
 *  suspended  – on/after the suspension day with no verified payment
 *  inactive   – no billable enrollment yet (pending admission etc.)
 */
export function studentBilling(email) {
  const { dueDay, graceEndDay, suspendDay } = billingRules();
  const now = nowPK();
  const month = now.monthKey;
  const enrollment = activeEnrollment(email);
  const fee = enrollment ? Number(courseByName(enrollment.course)?.fee || 0) : 0;
  const paid = verifiedForMonth(email, month);
  const pending = pendingForMonth(email, month);
  const remaining = Math.max(0, fee - paid);
  const base = {
    month,
    monthLabel: monthLabel(month),
    fee,
    paid,
    pending,
    remaining,
    day: now.day,
    dueDay,
    graceEndDay,
    suspendDay,
    dueDate: `${now.year}-${String(now.month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
    arrears: unpaidMonths(email).filter((m) => m.month !== month),
  };
  if (!enrollment || fee <= 0) return { ...base, status: 'inactive' };
  if (paid >= fee) return { ...base, status: 'paid' };
  if (now.day >= suspendDay) return { ...base, status: 'suspended' };
  if (now.day > dueDay) return { ...base, status: 'grace' };
  if (now.day === dueDay) return { ...base, status: 'due' };
  return { ...base, status: 'upcoming' };
}

/**
 * Months the student may still submit a payment for: the current month plus any
 * earlier month since enrolment that has no verified payment (max 6 back).
 */
export function unpaidMonths(email) {
  const enrollment = activeEnrollment(email) || latestEnrollment(email);
  if (!enrollment) return [];
  const fee = Number(courseByName(enrollment.course)?.fee || 0);
  const start = String(enrollment.approved_at || enrollment.created_at || '').slice(0, 7);
  const current = currentMonth();
  const months = [];
  let cursor = current;
  for (let i = 0; i < 6; i += 1) {
    if (start && cursor < start) break;
    const verified = verifiedForMonth(email, cursor);
    const pending = pendingForMonth(email, cursor);
    if (verified < fee) {
      months.push({ month: cursor, label: monthLabel(cursor), fee, verified, pending, settled: false });
    }
    cursor = shiftMonth(cursor, -1);
  }
  return months;
}

export function payableMonths(email) {
  const list = unpaidMonths(email).filter((m) => m.pending <= 0);
  const current = currentMonth();
  if (!list.some((m) => m.month === current)) {
    const fee = monthlyFee(email);
    const verified = verifiedForMonth(email, current);
    const pending = pendingForMonth(email, current);
    if (verified < fee && pending <= 0) {
      list.unshift({ month: current, label: monthLabel(current), fee, verified, pending, settled: false });
    }
  }
  return list.sort((a, b) => a.month.localeCompare(b.month));
}

/* -------------------------------------------------------------- engine ----- */

function reminderSent(email, kind, month) {
  return Boolean(db.prepare('SELECT 1 FROM reminder_log WHERE lower(user_email)=lower(?) AND kind=? AND billing_month=?').get(email, kind, month));
}
function markReminder(email, kind, month) {
  try {
    db.prepare('INSERT OR IGNORE INTO reminder_log(user_email,kind,billing_month) VALUES(?,?,?)').run(String(email).toLowerCase(), kind, month);
  } catch {}
}

function sendReminder(email, kind, month, title, body, type = 'payment') {
  if (reminderSent(email, kind, month)) return false;
  notify(email, title, body, type);
  markReminder(email, kind, month);
  return true;
}

/**
 * Server-side billing pass. Safe to run repeatedly (idempotent per day/month).
 * Runs automatically on API traffic (throttled) and can be scheduled with cron.
 */
export function runBilling(reason = 'auto') {
  const { dueDay, graceEndDay, suspendDay } = billingRules();
  const now = nowPK();
  const month = now.monthKey;
  const currency = setting('currency') || 'PKR';
  const summary = { reason, month, day: now.day, suspended: 0, reactivated: 0, reminders: 0, checked: 0 };

  const students = db.prepare("SELECT id,email,name,account_status,active FROM users WHERE role='student' AND active=1").all();

  for (const student of students) {
    const enrollment = activeEnrollment(student.email);
    if (!enrollment) continue;
    const fee = Number(courseByName(enrollment.course)?.fee || 0);
    if (fee <= 0) continue;
    summary.checked += 1;

    const paid = verifiedForMonth(student.email, month);
    const amount = `${currency} ${Number(fee).toLocaleString('en-US')}`;

    if (paid >= fee) {
      if (student.account_status === 'suspended') {
        db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(student.id);
        notify(student.email, 'Account reactivated', 'Your monthly fee is verified and your learning access has been restored.', 'success');
        log('system', 'student_reactivated', JSON.stringify({ student: student.email, month }));
        summary.reactivated += 1;
      }
      continue;
    }

    // Reminder ladder — one notification per stage per month.
    if (now.day === dueDay - 2 || now.day === dueDay - 1) {
      if (sendReminder(student.email, 'pre_due', month,
        'Monthly fee due soon',
        `Your ${monthLabel(month)} fee of ${amount} is due on the ${ordinal(dueDay)}. Submit your payment to keep your classes running.`)) summary.reminders += 1;
    } else if (now.day === dueDay) {
      if (sendReminder(student.email, 'due', month,
        'Monthly fee due today',
        `Your ${monthLabel(month)} fee of ${amount} is due today.`, 'warning')) summary.reminders += 1;
    } else if (now.day > dueDay && now.day <= graceEndDay) {
      const kind = now.day === graceEndDay ? 'grace_final' : 'grace';
      if (sendReminder(student.email, kind, month,
        now.day === graceEndDay ? 'Final grace day' : 'Payment pending — grace period',
        `Your ${monthLabel(month)} payment is not verified yet. Please complete it before the ${ordinal(graceEndDay)} to avoid suspension.`, 'warning')) summary.reminders += 1;
    }

    if (now.day >= suspendDay) {
      if (student.account_status !== 'suspended') {
        db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(student.id);
        log('system', 'student_suspended', JSON.stringify({ student: student.email, month, day: now.day }));
        summary.suspended += 1;
      }
      if (sendReminder(student.email, 'suspended', month,
        'Account temporarily suspended',
        `Your account is suspended because the ${monthLabel(month)} fee has not been verified. Your classes, attendance and payment history are preserved — access returns as soon as the payment is verified.`, 'warning')) summary.reminders += 1;
    }
  }

  return summary;
}

export function ordinal(n) {
  const v = Number(n);
  const suffix = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] || 'th';
  return `${v}${suffix}`;
}

/** Called after an administrator verifies a payment. */
export function reactivateIfSettled(email) {
  const state = studentBilling(email);
  if (state.status === 'paid' || state.status === 'inactive') {
    const row = db.prepare("SELECT id,account_status FROM users WHERE lower(email)=lower(?) AND role='student'").get(email);
    if (row && row.account_status === 'suspended') {
      db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(row.id);
      log('admin', 'student_reactivated', JSON.stringify({ student: email, month: state.month }));
      return true;
    }
  }
  return false;
}

let lastRun = 0;
/** Throttled hook used by the request pipeline so billing stays current without cron. */
export function runBillingThrottled() {
  const now = Date.now();
  if (now - lastRun < 60_000) return;
  lastRun = now;
  try { runBilling('request'); } catch (err) { console.error('billing pass failed', err); }
}
