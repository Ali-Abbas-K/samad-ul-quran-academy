import { db, academy, setting, notify, log, courseByName, withMethodLabel } from '../db.js';
import { ok, created, bad, notFound, conflict, requireUser } from '../http.js';
import { clean, validImage, validDate, validMonth, toInt, safeUser } from '../util.js';
import { gatewayConfigured } from '../config.js';
import {
  studentBilling, monthlyPaid, payableMonths, unpaidMonths, activeEnrollment,
  latestEnrollment, currentMonth, monthLabel,
} from '../billing.js';

const METHODS = ['bank', 'easypaisa', 'jazzcash', 'cash'];

function attendanceSummary(email) {
  const rows = db.prepare(
    `SELECT a.status, COUNT(*) n FROM attendance a WHERE lower(a.student_email)=lower(?) GROUP BY a.status`,
  ).all(email);
  const counts = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
  for (const r of rows) counts[r.status] = r.n;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const attended = counts.Present + counts.Late;
  return { ...counts, total, percentage: total ? Math.round((attended / total) * 100) : 0 };
}

export function paymentInstructions() {
  return {
    bank: setting('payment_instructions'),
    easypaisa: setting('easypaisa_instructions'),
    jazzcash: setting('jazzcash_instructions'),
    cash: setting('cash_instructions'),
  };
}

export function enabledMethods() {
  return db.prepare('SELECT code,name,enabled,instructions,account_detail FROM payment_methods WHERE enabled=1 ORDER BY code').all()
    .map((m) => ({ ...m, gateway: gatewayConfigured(m.code) }));
}

export default {
  'GET /api/student/dashboard': (ctx) => {
    const u = requireUser(ctx, 'student');
    const student = db.prepare('SELECT * FROM users WHERE id=?').get(u.sub);
    const enrollment = db.prepare(
      `SELECT e.*,t.name teacher_name,t.avatar teacher_avatar,t.qualification teacher_qualification,t.email teacher_email
       FROM enrollments e LEFT JOIN users t ON lower(t.email)=lower(e.teacher)
       WHERE lower(e.email)=lower(?) ORDER BY e.id DESC LIMIT 1`,
    ).get(u.email);
    const enrollments = db.prepare(
      `SELECT e.*,t.name teacher_name FROM enrollments e LEFT JOIN users t ON lower(t.email)=lower(e.teacher)
       WHERE lower(e.email)=lower(?) ORDER BY e.id DESC`,
    ).all(u.email);
    const classes = db.prepare(
      `SELECT c.*,t.name teacher_name,a.status attendance_status
       FROM class_sessions c
       LEFT JOIN users t ON lower(t.email)=lower(c.teacher_email)
       LEFT JOIN attendance a ON a.class_id=c.id AND lower(a.student_email)=lower(c.student_email)
       WHERE lower(c.student_email)=lower(?) ORDER BY c.starts_at DESC LIMIT 60`,
    ).all(u.email);
    const attendance = db.prepare(
      `SELECT a.*,c.starts_at,c.course FROM attendance a JOIN class_sessions c ON c.id=a.class_id
       WHERE lower(a.student_email)=lower(?) ORDER BY c.starts_at DESC LIMIT 60`,
    ).all(u.email);
    const notifications = db.prepare('SELECT * FROM notifications WHERE lower(user_email)=lower(?) ORDER BY id DESC LIMIT 20').all(u.email);
    const payments = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status='verified' THEN amount ELSE 0 END),0) paid,
              COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending
       FROM payments WHERE lower(student_email)=lower(?)`,
    ).get(u.email);
    const recentPayments = db.prepare(
      'SELECT id,amount,method,status,billing_month,payment_date,reference,receipt_no,created_at FROM payments WHERE lower(student_email)=lower(?) ORDER BY id DESC LIMIT 6',
    ).all(u.email).map((r) => withMethodLabel(r));
    const unreadMessages = db.prepare(
      "SELECT COUNT(*) n FROM chat_messages WHERE lower(student_email)=lower(?) AND sender_role='teacher' AND read_at IS NULL",
    ).get(u.email).n;

    const current = enrollment ? courseByName(enrollment.course) : null;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const upcoming = classes.filter((c) => c.status === 'scheduled' && c.starts_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    return ok(ctx, {
      student: safeUser(student),
      enrollment,
      enrollments,
      course: current,
      classes,
      upcoming,
      nextClass: upcoming[0] || null,
      attendance,
      attendanceSummary: attendanceSummary(u.email),
      notifications,
      unreadNotifications: notifications.filter((n) => !n.read_at).length,
      unreadMessages,
      payments,
      recentPayments,
      fee: Number(current?.fee || 0),
      monthlyPaid: monthlyPaid(u.email),
      monthlyStatus: studentBilling(u.email),
      academy: academy(),
    });
  },

  'GET /api/student/attendance': (ctx) => {
    const u = requireUser(ctx, 'student');
    const rows = db.prepare(
      `SELECT a.id,a.status,a.notes,a.marked_at,c.starts_at,c.ends_at,c.course,t.name teacher_name
       FROM attendance a JOIN class_sessions c ON c.id=a.class_id
       LEFT JOIN users t ON lower(t.email)=lower(a.teacher_email)
       WHERE lower(a.student_email)=lower(?) ORDER BY c.starts_at DESC`,
    ).all(u.email);
    return ok(ctx, { attendance: rows, summary: attendanceSummary(u.email) });
  },

  'GET /api/student/payments': (ctx) => {
    const u = requireUser(ctx, 'student');
    const enrollment = activeEnrollment(u.email) || latestEnrollment(u.email);
    const course = enrollment ? courseByName(enrollment.course) : null;
    return ok(ctx, {
      payments: withMethodLabel(db.prepare('SELECT * FROM payments WHERE lower(student_email)=lower(?) ORDER BY id DESC').all(u.email)),
      summary: db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN status='verified' THEN amount ELSE 0 END),0) paid,
                COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,
                COALESCE(SUM(CASE WHEN status='rejected' THEN amount ELSE 0 END),0) rejected
         FROM payments WHERE lower(student_email)=lower(?)`,
      ).get(u.email),
      fee: Number(course?.fee || 0),
      course: enrollment?.course || '',
      enrollmentStatus: enrollment?.status || '',
      billing: studentBilling(u.email),
      payableMonths: payableMonths(u.email),
      unpaidMonths: unpaidMonths(u.email),
      methods: enabledMethods(),
      instructions: paymentInstructions(),
      academy: academy(),
    });
  },

  'POST /api/payments': async (ctx) => {
    const u = requireUser(ctx, 'student');
    const d = await ctx.body();
    const enrollment = activeEnrollment(u.email);
    if (!enrollment) throw bad('Your admission must be approved before you can submit a payment');
    const course = courseByName(enrollment.course);
    if (!course) throw bad('Your course could not be found. Please contact the academy.');

    const method = METHODS.includes(String(d.method || '')) ? String(d.method) : '';
    if (!method) throw bad('Choose a valid payment method');
    const methodRow = db.prepare('SELECT * FROM payment_methods WHERE code=? AND enabled=1').get(method);
    if (!methodRow) throw bad('That payment method is currently unavailable');

    const month = validMonth(d.billingMonth) || currentMonth();
    const allowed = payableMonths(u.email);
    if (!allowed.some((m) => m.month === month)) {
      throw bad(`${monthLabel(month)} is not open for payment. Either it is already settled or a submission is awaiting verification.`);
    }

    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw bad('Enter the amount you paid');
    if (Math.abs(amount - Number(course.fee)) > 0.01) {
      throw bad(`The monthly fee for ${course.name} is ${setting('currency') || 'PKR'} ${Number(course.fee).toLocaleString('en-US')}. Please submit the exact amount.`);
    }

    const paymentDate = validDate(d.paymentDate);
    if (!paymentDate) throw bad('Enter a valid payment date');
    if (paymentDate > new Date().toISOString().slice(0, 10)) throw bad('The payment date cannot be in the future');

    const reference = clean(d.reference, 80);
    if (method !== 'cash' && !reference) throw bad('The transaction / reference number is required for this payment method');
    if (method !== 'cash') {
      if (!d.proof) throw bad('Attach a screenshot or photo of the payment receipt');
      if (!validImage(d.proof)) throw bad('Payment proof must be a PNG, JPG or WEBP image under 700 KB');
    } else if (d.proof && !validImage(d.proof)) {
      throw bad('Payment proof must be a PNG, JPG or WEBP image under 700 KB');
    }

    if (reference) {
      const dup = db.prepare('SELECT id FROM payments WHERE method=? AND reference=?').get(method, reference);
      if (dup) throw conflict('This transaction / reference number has already been submitted');
    }

    const result = db.prepare(
      `INSERT INTO payments(student_email,enrollment_id,amount,currency,method,reference,note,proof,billing_month,payment_date,submitted_at,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'pending')`,
    ).run(u.email, enrollment.id, amount, setting('currency') || 'PKR', method, reference, clean(d.note, 1000), d.proof || '', month, paymentDate);

    notify(u.email, 'Payment submitted', `Your ${monthLabel(month)} payment of ${setting('currency') || 'PKR'} ${amount.toLocaleString('en-US')} is pending administrator verification.`, 'payment');
    notify(setting('academy_email'), 'Payment awaiting verification', `${u.email} submitted a ${methodRow.name} payment for ${monthLabel(month)}.`, 'payment');
    log(u.email, 'payment_submitted', JSON.stringify({ id: result.lastInsertRowid, method, month }));

    return created(ctx, { ok: true, payment: db.prepare('SELECT * FROM payments WHERE id=?').get(result.lastInsertRowid) });
  },

  'GET /api/student/receipt': (ctx) => {
    const u = requireUser(ctx, 'student');
    const row = db.prepare(
      `SELECT p.*,e.course,e.student_name,s.name account_name FROM payments p
       LEFT JOIN enrollments e ON e.id=p.enrollment_id
       LEFT JOIN users s ON lower(s.email)=lower(p.student_email)
       WHERE p.id=? AND lower(p.student_email)=lower(?)`,
    ).get(toInt(ctx.url.searchParams.get('id'), 0), u.email);
    if (!row || row.status !== 'verified') throw notFound('A verified receipt for this payment was not found');
    return ok(ctx, { receipt: withMethodLabel({ ...row, proof: undefined, monthLabel: monthLabel(row.billing_month) }), academy: academy() });
  },

  /** Legacy alias kept so older clients keep working. */
  'GET /api/student/notifications': (ctx) => {
    const u = requireUser(ctx, 'student');
    return ok(ctx, { notifications: db.prepare('SELECT * FROM notifications WHERE lower(user_email)=lower(?) ORDER BY id DESC LIMIT 100').all(u.email) });
  },
};
