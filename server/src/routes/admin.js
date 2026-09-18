import { db, academy, allSettings, setSetting, setting, notify, log, courseByName, withMethodLabel, DEFAULT_SETTINGS } from '../db.js';
import { ok, created, bad, notFound, conflict, requireAdmin } from '../http.js';
import {
  clean, lower, validEmail, normalizePhone, hashPassword, validImage, validIBAN,
  validMonth, validDate, toInt, clamp, safeUser, roomName,
} from '../util.js';
import { gatewayConfigured } from '../config.js';
import {
  currentMonth, monthLabel, studentBilling, runBilling, reactivateIfSettled,
  activeEnrollment, nowPK, billingRules,
} from '../billing.js';
import { normaliseWindow } from './teacher.js';

const ENROLLMENT_STATUSES = ['Pending', 'Approved', 'Active', 'Rejected', 'Completed'];
const PAYMENT_STATUSES = ['pending', 'verified', 'rejected'];

function like(value) {
  return `%${String(value || '').toLowerCase()}%`;
}

function receiptNumber(payment) {
  const month = (payment.billing_month || currentMonth()).replace('-', '');
  return payment.receipt_no || `SUQ-${month}-${String(payment.id).padStart(6, '0')}`;
}

export default {
  'GET /api/admin/overview': (ctx) => {
    requireAdmin(ctx);
    const month = currentMonth();
    const counts = {
      students: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n,
      activeStudents: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student' AND active=1 AND account_status='active'").get().n,
      suspendedStudents: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student' AND account_status='suspended'").get().n,
      teachers: db.prepare("SELECT COUNT(*) n FROM users WHERE role='teacher' AND active=1").get().n,
      courses: db.prepare('SELECT COUNT(*) n FROM courses WHERE active=1').get().n,
      enrollments: db.prepare("SELECT COUNT(*) n FROM enrollments WHERE status IN ('Approved','Active')").get().n,
      admissions: db.prepare("SELECT COUNT(*) n FROM enrollments WHERE status='Pending'").get().n,
      classes: db.prepare("SELECT COUNT(*) n FROM class_sessions WHERE status='scheduled'").get().n,
      pendingPayments: db.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").get().n,
      unreadMessages: db.prepare('SELECT COUNT(*) n FROM messages').get().n,
      monthlyRevenue: db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='verified' AND billing_month=?").get(month).n,
      pendingAmount: db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='pending'").get().n,
    };
    const attendance = db.prepare(
      `SELECT status, COUNT(*) n FROM attendance WHERE marked_at >= date('now','-30 day') GROUP BY status`,
    ).all();
    return ok(ctx, {
      month,
      monthLabel: monthLabel(month),
      counts,
      rules: billingRules(),
      attendanceOverview: attendance,
      revenueTrend: db.prepare(
        "SELECT billing_month month, COALESCE(SUM(amount),0) total FROM payments WHERE status='verified' GROUP BY billing_month ORDER BY billing_month DESC LIMIT 6",
      ).all().reverse(),
      upcomingClasses: db.prepare(
        `SELECT c.id,c.course,c.starts_at,c.ends_at,c.status,s.name student_name,t.name teacher_name
         FROM class_sessions c LEFT JOIN users s ON lower(s.email)=lower(c.student_email)
         LEFT JOIN users t ON lower(t.email)=lower(c.teacher_email)
         WHERE c.status IN ('scheduled','live') ORDER BY c.starts_at LIMIT 8`,
      ).all(),
      pendingAdmissions: db.prepare(
        "SELECT id,student_name,email,course,timing,days,created_at FROM enrollments WHERE status='Pending' ORDER BY id DESC LIMIT 8",
      ).all(),
      pendingPaymentList: db.prepare(
        `SELECT p.id,p.amount,p.method,p.billing_month,p.reference,p.payment_date,s.name student_name,p.student_email
         FROM payments p LEFT JOIN users s ON lower(s.email)=lower(p.student_email)
         WHERE p.status='pending' ORDER BY p.id DESC LIMIT 8`,
      ).all(),
      recentActivity: db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 12').all(),
      teachers: db.prepare("SELECT id,name,email,active FROM users WHERE role='teacher' ORDER BY name").all(),
      courses: db.prepare('SELECT id,name,fee,active FROM courses ORDER BY name').all(),
      settings: academy(),
    });
  },

  /* ------------------------------------------------------------ students -- */

  'GET /api/admin/students': (ctx) => {
    requireAdmin(ctx);
    const q = clean(ctx.url.searchParams.get('q'), 120);
    const status = clean(ctx.url.searchParams.get('status'), 20);
    let sql = `SELECT u.id,u.name,u.email,u.phone,u.avatar,u.active,u.account_status,u.created_at,u.last_login_at,
                      e.id enrollment_id,e.course,e.status enrollment_status,e.timing,e.days,e.progress,e.attendance,
                      e.teacher,t.name teacher_name
               FROM users u
               LEFT JOIN enrollments e ON e.id=(SELECT id FROM enrollments WHERE lower(email)=lower(u.email) ORDER BY id DESC LIMIT 1)
               LEFT JOIN users t ON lower(t.email)=lower(e.teacher)
               WHERE u.role='student'`;
    const args = [];
    if (q) { sql += ' AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR u.phone LIKE ?)'; args.push(like(q), like(q), like(q)); }
    if (status === 'active') sql += " AND u.active=1 AND u.account_status='active'";
    if (status === 'suspended') sql += " AND u.account_status='suspended'";
    if (status === 'inactive') sql += ' AND u.active=0';
    sql += ' ORDER BY u.name';
    const students = db.prepare(sql).all(...args).map((s) => ({ ...s, billing: studentBilling(s.email) }));
    return ok(ctx, { students });
  },

  'GET /api/admin/students/detail': (ctx) => {
    requireAdmin(ctx);
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    const student = db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(id);
    if (!student) throw notFound('Student not found');
    return ok(ctx, {
      student: safeUser(student),
      billing: studentBilling(student.email),
      enrollments: db.prepare(
        `SELECT e.*,t.name teacher_name FROM enrollments e LEFT JOIN users t ON lower(t.email)=lower(e.teacher)
         WHERE lower(e.email)=lower(?) ORDER BY e.id DESC`,
      ).all(student.email),
      classes: db.prepare(
        `SELECT c.*,t.name teacher_name FROM class_sessions c LEFT JOIN users t ON lower(t.email)=lower(c.teacher_email)
         WHERE lower(c.student_email)=lower(?) ORDER BY c.starts_at DESC LIMIT 100`,
      ).all(student.email),
      attendance: db.prepare(
        `SELECT a.*,c.starts_at,c.course FROM attendance a JOIN class_sessions c ON c.id=a.class_id
         WHERE lower(a.student_email)=lower(?) ORDER BY c.starts_at DESC LIMIT 100`,
      ).all(student.email),
      payments: db.prepare(
        'SELECT id,amount,method,reference,status,billing_month,payment_date,receipt_no,verification_notes,created_at,verified_at FROM payments WHERE lower(student_email)=lower(?) ORDER BY id DESC',
      ).all(student.email),
      history: db.prepare('SELECT * FROM audit_logs WHERE actor=? OR details LIKE ? ORDER BY id DESC LIMIT 50').all(student.email, like(student.email)),
    });
  },

  'POST /api/admin/students': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const name = clean(d.name, 120);
    const email = validEmail(d.email);
    if (!name || !email) throw bad('Student name and a valid email are required');
    if (String(d.password || '').length < 8) throw bad('Set a password of at least 8 characters');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email)) throw conflict('A user with this email already exists');
    const res = db.prepare('INSERT INTO users(role,name,email,password_hash,phone,active) VALUES(?,?,?,?,?,1)')
      .run('student', name, email, hashPassword(d.password), normalizePhone(d.phone));
    log('admin', 'student_created', email);

    if (d.course) {
      const course = db.prepare('SELECT * FROM courses WHERE name=? AND active=1').get(clean(d.course, 120));
      if (course) {
        db.prepare(
          `INSERT INTO enrollments(student_name,guardian_name,whatsapp,email,course,level,timing,days,timezone,teacher,status,approved_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,'Approved',CURRENT_TIMESTAMP)`,
        ).run(name, clean(d.guardianName, 120), normalizePhone(d.phone), email, course.name, course.level,
          clean(d.timing, 60) || '18:00', clean(d.days, 160) || 'Monday, Wednesday, Friday', 'Asia/Karachi', lower(d.teacherEmail));
        log('admin', 'enrollment_created', `${email} → ${course.name}`);
      }
    }
    notify(email, 'Welcome to the academy', 'Your student account has been created by the academy administration. Sign in to view your classes and fees.', 'success');
    return created(ctx, { user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(res.lastInsertRowid)) });
  },

  'PATCH /api/admin/students': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const student = db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(toInt(d.id, 0));
    if (!student) throw notFound('Student not found');
    const fields = [];
    const values = [];
    if (d.name !== undefined) { fields.push('name=?'); values.push(clean(d.name, 120)); }
    if (d.phone !== undefined) { fields.push('phone=?'); values.push(normalizePhone(d.phone)); }
    if (!fields.length) throw bad('Nothing to update');
    values.push(student.id);
    db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...values);
    log('admin', 'student_updated', student.email);
    return ok(ctx);
  },

  'PATCH /api/admin/students/status': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const student = db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(toInt(d.id, 0));
    if (!student) throw notFound('Student not found');
    const action = String(d.action || (d.active ? 'activate' : 'suspend'));
    if (action === 'activate') {
      db.prepare("UPDATE users SET active=1,account_status='active' WHERE id=?").run(student.id);
      notify(student.email, 'Account reactivated', 'Your account has been reactivated by the academy. All your classes and history are intact.', 'success');
      log('admin', 'student_reactivated', student.email);
    } else if (action === 'suspend') {
      db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(student.id);
      notify(student.email, 'Account suspended', clean(d.reason, 300) || 'Your account has been temporarily suspended. Please contact the academy.', 'warning');
      log('admin', 'student_suspended', `${student.email} ${clean(d.reason, 200)}`);
    } else if (action === 'deactivate') {
      db.prepare("UPDATE users SET active=0,account_status='suspended' WHERE id=?").run(student.id);
      log('admin', 'student_deactivated', student.email);
    } else {
      throw bad('Unknown action');
    }
    return ok(ctx, { student: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(student.id)) });
  },

  'POST /api/admin/students/password': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    if (String(d.password || '').length < 8) throw bad('Password must be at least 8 characters');
    const student = db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(toInt(d.id, 0));
    if (!student) throw notFound('Student not found');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(d.password), student.id);
    log('admin', 'student_password_reset', student.email);
    notify(student.email, 'Password changed', 'Your portal password was reset by the academy administration.', 'warning');
    return ok(ctx);
  },

  /* ------------------------------------------------------------ teachers -- */

  'GET /api/admin/teachers': (ctx) => {
    requireAdmin(ctx);
    const q = clean(ctx.url.searchParams.get('q'), 120);
    let sql = `SELECT u.id,u.name,u.email,u.phone,u.qualification,u.experience,u.specialities,u.bio,u.avatar,u.active,u.created_at,u.last_login_at,
                      (SELECT COUNT(*) FROM enrollments e WHERE lower(e.teacher)=lower(u.email) AND e.status IN ('Approved','Active')) students,
                      (SELECT COUNT(*) FROM class_sessions c WHERE lower(c.teacher_email)=lower(u.email)) classes
               FROM users u WHERE u.role='teacher'`;
    const args = [];
    if (q) { sql += ' AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ?)'; args.push(like(q), like(q)); }
    sql += ' ORDER BY u.name';
    return ok(ctx, { teachers: db.prepare(sql).all(...args) });
  },

  'POST /api/admin/teachers': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const name = clean(d.name, 120);
    const email = validEmail(d.email);
    if (!name || !email) throw bad('Teacher name and a valid email are required');
    if (String(d.password || '').length < 8) throw bad('Set a password of at least 8 characters');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email)) throw conflict('A user with this email already exists');
    const res = db.prepare(
      'INSERT INTO users(role,name,email,password_hash,phone,qualification,experience,specialities,bio,active) VALUES(?,?,?,?,?,?,?,?,?,1)',
    ).run('teacher', name, email, hashPassword(d.password), normalizePhone(d.phone),
      clean(d.qualification, 160), clean(d.experience, 160), clean(d.specialities, 200), clean(d.bio, 1200));
    log('admin', 'teacher_created', email);
    return created(ctx, { user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(res.lastInsertRowid)) });
  },

  'PATCH /api/admin/teachers': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const teacher = db.prepare("SELECT * FROM users WHERE id=? AND role='teacher'").get(toInt(d.id, 0));
    if (!teacher) throw notFound('Teacher not found');
    if (d.avatar !== undefined && !validImage(d.avatar)) throw bad('Photo must be a PNG, JPG or WEBP image under 700 KB');
    const fields = [];
    const values = [];
    for (const key of ['name', 'phone', 'qualification', 'experience', 'specialities', 'bio', 'avatar']) {
      if (d[key] === undefined) continue;
      fields.push(`${key}=?`);
      values.push(key === 'phone' ? normalizePhone(d[key]) : key === 'avatar' ? String(d[key] || '') : clean(d[key], key === 'bio' ? 1200 : 200));
    }
    if (!fields.length) throw bad('Nothing to update');
    values.push(teacher.id);
    db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...values);
    log('admin', 'teacher_updated', teacher.email);
    return ok(ctx);
  },

  'PATCH /api/admin/teachers/status': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const teacher = db.prepare("SELECT * FROM users WHERE id=? AND role='teacher'").get(toInt(d.id, 0));
    if (!teacher) throw notFound('Teacher not found');
    const active = d.active ? 1 : 0;
    if (!active) {
      const assigned = db.prepare("SELECT COUNT(*) n FROM enrollments WHERE lower(teacher)=lower(?) AND status IN ('Approved','Active')").get(teacher.email).n;
      if (assigned) throw conflict(`${teacher.name} still has ${assigned} assigned student(s). Reassign them before deactivating.`);
    }
    db.prepare("UPDATE users SET active=? WHERE id=? AND role='teacher'").run(active, teacher.id);
    log('admin', active ? 'teacher_activated' : 'teacher_deactivated', teacher.email);
    return ok(ctx);
  },

  'POST /api/admin/teachers/password': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    if (String(d.password || '').length < 8) throw bad('Password must be at least 8 characters');
    const teacher = db.prepare("SELECT * FROM users WHERE id=? AND role='teacher'").get(toInt(d.id, 0));
    if (!teacher) throw notFound('Teacher not found');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(d.password), teacher.id);
    log('admin', 'teacher_password_reset', teacher.email);
    return ok(ctx);
  },

  /* --------------------------------------------------------- enrollments -- */

  'GET /api/admin/enrollments': (ctx) => {
    requireAdmin(ctx);
    const status = clean(ctx.url.searchParams.get('status'), 20);
    const q = clean(ctx.url.searchParams.get('q'), 120);
    const course = clean(ctx.url.searchParams.get('course'), 120);
    let sql = `SELECT e.*,s.name student_display,s.account_status,s.id student_id,t.name teacher_name
               FROM enrollments e LEFT JOIN users s ON lower(s.email)=lower(e.email)
               LEFT JOIN users t ON lower(t.email)=lower(e.teacher) WHERE 1=1`;
    const args = [];
    if (status && ENROLLMENT_STATUSES.includes(status)) { sql += ' AND e.status=?'; args.push(status); }
    if (course) { sql += ' AND e.course=?'; args.push(course); }
    if (q) { sql += ' AND (lower(e.student_name) LIKE ? OR lower(e.email) LIKE ? OR e.whatsapp LIKE ?)'; args.push(like(q), like(q), like(q)); }
    sql += ' ORDER BY e.id DESC';
    return ok(ctx, { enrollments: db.prepare(sql).all(...args) });
  },

  'PATCH /api/admin/enrollments': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(toInt(d.id, 0));
    if (!enrollment) throw notFound('Enrollment not found');
    const fields = [];
    const values = [];
    if (d.status !== undefined) {
      if (!ENROLLMENT_STATUSES.includes(String(d.status))) throw bad('Invalid enrollment status');
      fields.push('status=?'); values.push(String(d.status));
      if (['Approved', 'Active'].includes(String(d.status)) && !enrollment.approved_at) { fields.push('approved_at=?'); values.push(new Date().toISOString().slice(0, 19).replace('T', ' ')); }
    }
    if (d.course !== undefined) {
      const course = db.prepare('SELECT * FROM courses WHERE name=?').get(clean(d.course, 120));
      if (!course) throw bad('Unknown course');
      fields.push('course=?'); values.push(course.name);
    }
    if (d.teacher !== undefined) {
      const email = lower(d.teacher);
      if (email) {
        const teacher = db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?) AND role='teacher' AND active=1").get(email);
        if (!teacher) throw bad('Choose an active teacher');
      }
      fields.push('teacher=?'); values.push(email);
    }
    for (const key of ['level', 'timing', 'days', 'timezone', 'message', 'notes', 'student_name', 'guardian_name']) {
      if (d[key] === undefined) continue;
      fields.push(`${key}=?`); values.push(clean(d[key], 300));
    }
    for (const key of ['progress', 'attendance']) {
      if (d[key] === undefined) continue;
      fields.push(`${key}=?`); values.push(clamp(d[key], 0, 100));
    }
    if (!fields.length) throw bad('Nothing to update');
    values.push(enrollment.id);
    db.prepare(`UPDATE enrollments SET ${fields.join(',')} WHERE id=?`).run(...values);
    log('admin', 'enrollment_updated', JSON.stringify({ id: enrollment.id, changes: fields.map((f) => f.split('=')[0]) }));
    return ok(ctx, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id) });
  },

  /** Approve or reject an admission request. */
  'POST /api/admin/enrollments/decision': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(toInt(d.id, 0));
    if (!enrollment) throw notFound('Admission request not found');
    const decision = String(d.decision || '');
    if (!['approve', 'reject'].includes(decision)) throw bad('Decision must be approve or reject');

    if (decision === 'approve') {
      const teacherEmail = lower(d.teacherEmail || enrollment.teacher);
      if (teacherEmail) {
        const teacher = db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?) AND role='teacher' AND active=1").get(teacherEmail);
        if (!teacher) throw bad('Choose an active teacher');
      }
      db.prepare("UPDATE enrollments SET status='Approved',teacher=?,approved_at=CURRENT_TIMESTAMP WHERE id=?").run(teacherEmail, enrollment.id);
      db.prepare("UPDATE users SET active=1,account_status='active' WHERE lower(email)=lower(?) AND role='student'").run(enrollment.email);
      const fee = Number(courseByName(enrollment.course)?.fee || 0);
      notify(enrollment.email, 'Admission approved',
        `Your ${enrollment.course} admission is approved.${teacherEmail ? ' Your teacher has been assigned.' : ''} The monthly fee is ${setting('currency') || 'PKR'} ${fee.toLocaleString('en-US')}, due on the ${billingRules().dueDay}th.`,
        'success');
      log('admin', 'enrollment_approved', JSON.stringify({ id: enrollment.id, student: enrollment.email, teacher: teacherEmail }));
    } else {
      const reason = clean(d.reason, 500);
      if (!reason) throw bad('A reason is required when rejecting an admission');
      db.prepare("UPDATE enrollments SET status='Rejected',notes=? WHERE id=?").run(reason, enrollment.id);
      notify(enrollment.email, 'Admission not approved', reason, 'warning');
      log('admin', 'enrollment_rejected', JSON.stringify({ id: enrollment.id, student: enrollment.email, reason }));
    }
    return ok(ctx, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id) });
  },

  'POST /api/admin/enrollments/assign': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const teacher = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) AND role='teacher' AND active=1").get(lower(d.teacherEmail));
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(toInt(d.enrollmentId, 0));
    if (!teacher || !enrollment) throw notFound('An active teacher and enrollment are required');
    const status = ENROLLMENT_STATUSES.includes(String(d.status)) ? String(d.status)
      : (enrollment.status === 'Pending' ? 'Approved' : enrollment.status);
    db.prepare('UPDATE enrollments SET teacher=?,status=?,approved_at=COALESCE(NULLIF(approved_at,\'\'),CURRENT_TIMESTAMP) WHERE id=?')
      .run(teacher.email, status, enrollment.id);
    notify(enrollment.email, 'Teacher assigned', `${teacher.name} is now your teacher for ${enrollment.course}. You can message them from your dashboard.`, 'admission');
    notify(teacher.email, 'New student assigned', `${enrollment.student_name} has been assigned to you for ${enrollment.course}.`, 'info');
    log('admin', 'teacher_assigned', JSON.stringify({ enrollment: enrollment.id, teacher: teacher.email }));
    return ok(ctx);
  },

  /* -------------------------------------------------------------- classes -- */

  'GET /api/admin/classes': (ctx) => {
    requireAdmin(ctx);
    const status = clean(ctx.url.searchParams.get('status'), 20);
    const teacher = lower(ctx.url.searchParams.get('teacher'));
    const date = validDate(ctx.url.searchParams.get('date'));
    const q = clean(ctx.url.searchParams.get('q'), 120);
    let sql = `SELECT c.*,s.name student_name,t.name teacher_name,a.status attendance_status
               FROM class_sessions c LEFT JOIN users s ON lower(s.email)=lower(c.student_email)
               LEFT JOIN users t ON lower(t.email)=lower(c.teacher_email)
               LEFT JOIN attendance a ON a.class_id=c.id WHERE 1=1`;
    const args = [];
    if (status) { sql += ' AND c.status=?'; args.push(status); }
    if (teacher) { sql += ' AND lower(c.teacher_email)=?'; args.push(teacher); }
    if (date) { sql += ' AND substr(c.starts_at,1,10)=?'; args.push(date); }
    if (q) { sql += ' AND (lower(s.name) LIKE ? OR lower(c.student_email) LIKE ? OR lower(c.course) LIKE ?)'; args.push(like(q), like(q), like(q)); }
    sql += ' ORDER BY c.starts_at DESC LIMIT 400';
    return ok(ctx, { classes: db.prepare(sql).all(...args) });
  },

  'POST /api/admin/classes': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=?').get(toInt(d.enrollmentId, 0));
    if (!enrollment) throw notFound('Enrollment not found');
    const teacherEmail = lower(d.teacherEmail) || enrollment.teacher;
    if (!teacherEmail) throw bad('Assign a teacher to this student first');
    const teacher = db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?) AND role='teacher' AND active=1").get(teacherEmail);
    if (!teacher) throw bad('Choose an active teacher');
    const { startsAt, endsAt } = normaliseWindow(d);
    const res = db.prepare(
      `INSERT INTO class_sessions(student_email,teacher_email,course,room_name,starts_at,ends_at,status,notes,topic)
       VALUES(?,?,?,?,?,?,'scheduled',?,?)`,
    ).run(enrollment.email, teacherEmail, enrollment.course, roomName(enrollment.email, enrollment.course), startsAt, endsAt, clean(d.notes, 500), clean(d.topic, 160));
    notify(enrollment.email, 'Class scheduled', `Your ${enrollment.course} class is scheduled for ${startsAt} (Pakistan time).`, 'class');
    notify(teacherEmail, 'Class scheduled', `A ${enrollment.course} class with ${enrollment.student_name} is scheduled for ${startsAt}.`, 'class');
    log('admin', 'class_created', String(res.lastInsertRowid));
    return created(ctx, { class: db.prepare('SELECT * FROM class_sessions WHERE id=?').get(res.lastInsertRowid) });
  },

  'PATCH /api/admin/classes': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const session = db.prepare('SELECT * FROM class_sessions WHERE id=?').get(toInt(d.id, 0));
    if (!session) throw notFound('Class not found');
    const fields = [];
    const values = [];
    if (d.startsAt !== undefined || d.endsAt !== undefined) {
      const { startsAt, endsAt } = normaliseWindow({ startsAt: d.startsAt || session.starts_at, endsAt: d.endsAt || '' });
      fields.push('starts_at=?', 'ends_at=?'); values.push(startsAt, endsAt);
    }
    if (d.status !== undefined) {
      if (!['scheduled', 'live', 'completed', 'cancelled'].includes(String(d.status))) throw bad('Invalid class status');
      fields.push('status=?'); values.push(String(d.status));
    }
    if (d.teacherEmail !== undefined) {
      const teacherEmail = lower(d.teacherEmail);
      if (!db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?) AND role='teacher' AND active=1").get(teacherEmail)) throw bad('Choose an active teacher');
      fields.push('teacher_email=?'); values.push(teacherEmail);
    }
    for (const key of ['notes', 'topic']) {
      if (d[key] === undefined) continue;
      fields.push(`${key}=?`); values.push(clean(d[key], 500));
    }
    if (!fields.length) throw bad('Nothing to update');
    values.push(session.id);
    db.prepare(`UPDATE class_sessions SET ${fields.join(',')} WHERE id=?`).run(...values);
    if (d.startsAt) notify(session.student_email, 'Class rescheduled', `Your ${session.course} class has been moved to ${clean(d.startsAt, 20).replace('T', ' ')}.`, 'class');
    log('admin', 'class_updated', JSON.stringify({ id: session.id, changes: fields.map((f) => f.split('=')[0]) }));
    return ok(ctx);
  },

  'DELETE /api/admin/classes': (ctx) => {
    requireAdmin(ctx);
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    const session = db.prepare('SELECT * FROM class_sessions WHERE id=?').get(id);
    if (!session) throw notFound('Class not found');
    db.prepare("UPDATE class_sessions SET status='cancelled' WHERE id=?").run(id);
    notify(session.student_email, 'Class cancelled', `Your ${session.course} class on ${session.starts_at} was cancelled by the academy.`, 'warning');
    log('admin', 'class_cancelled', String(id));
    return ok(ctx);
  },

  /* ----------------------------------------------------------- attendance -- */

  'GET /api/admin/attendance': (ctx) => {
    requireAdmin(ctx);
    const q = clean(ctx.url.searchParams.get('q'), 120);
    const teacher = lower(ctx.url.searchParams.get('teacher'));
    const status = clean(ctx.url.searchParams.get('status'), 20);
    const month = validMonth(ctx.url.searchParams.get('month'));
    let sql = `SELECT a.*,c.starts_at,c.course,s.name student_name,t.name teacher_name
               FROM attendance a JOIN class_sessions c ON c.id=a.class_id
               LEFT JOIN users s ON lower(s.email)=lower(a.student_email)
               LEFT JOIN users t ON lower(t.email)=lower(a.teacher_email) WHERE 1=1`;
    const args = [];
    if (q) { sql += ' AND (lower(s.name) LIKE ? OR lower(a.student_email) LIKE ?)'; args.push(like(q), like(q)); }
    if (teacher) { sql += ' AND lower(a.teacher_email)=?'; args.push(teacher); }
    if (status) { sql += ' AND a.status=?'; args.push(status); }
    if (month) { sql += ' AND substr(c.starts_at,1,7)=?'; args.push(month); }
    sql += ' ORDER BY c.starts_at DESC LIMIT 500';

    const byStudent = db.prepare(
      `SELECT s.name student_name,a.student_email,
              SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) present,
              SUM(CASE WHEN a.status='Absent' THEN 1 ELSE 0 END) absent,
              SUM(CASE WHEN a.status='Late' THEN 1 ELSE 0 END) late,
              SUM(CASE WHEN a.status='Leave' THEN 1 ELSE 0 END) leave_count,
              COUNT(*) total,
              ROUND(100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/COUNT(*)) percentage
       FROM attendance a LEFT JOIN users s ON lower(s.email)=lower(a.student_email)
       GROUP BY a.student_email ORDER BY percentage DESC`,
    ).all();
    const byTeacher = db.prepare(
      `SELECT t.name teacher_name,a.teacher_email,COUNT(*) marked,
              ROUND(100.0*SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END)/COUNT(*)) percentage
       FROM attendance a LEFT JOIN users t ON lower(t.email)=lower(a.teacher_email)
       GROUP BY a.teacher_email ORDER BY marked DESC`,
    ).all();
    return ok(ctx, { attendance: db.prepare(sql).all(...args), byStudent, byTeacher });
  },

  /* -------------------------------------------------------------- payments -- */

  'GET /api/admin/payments': (ctx) => {
    requireAdmin(ctx);
    const status = clean(ctx.url.searchParams.get('status'), 20);
    const method = clean(ctx.url.searchParams.get('method'), 20);
    const month = validMonth(ctx.url.searchParams.get('month'));
    const date = validDate(ctx.url.searchParams.get('date'));
    const q = clean(ctx.url.searchParams.get('q'), 120);
    let sql = `SELECT p.id,p.student_email,p.amount,p.currency,p.method,p.reference,p.note,p.billing_month,p.status,
                      p.payment_date,p.submitted_at,p.verified_at,p.verified_by,p.verification_notes,p.receipt_no,p.created_at,
                      (p.proof IS NOT NULL AND p.proof<>'') has_proof,
                      s.name student_name,e.course
               FROM payments p LEFT JOIN users s ON lower(s.email)=lower(p.student_email)
               LEFT JOIN enrollments e ON e.id=p.enrollment_id WHERE 1=1`;
    const args = [];
    if (status && PAYMENT_STATUSES.includes(status)) { sql += ' AND p.status=?'; args.push(status); }
    if (method) { sql += ' AND p.method=?'; args.push(method); }
    if (month) { sql += ' AND p.billing_month=?'; args.push(month); }
    if (date) { sql += ' AND p.payment_date=?'; args.push(date); }
    if (q) { sql += ' AND (lower(s.name) LIKE ? OR lower(p.student_email) LIKE ? OR lower(p.reference) LIKE ?)'; args.push(like(q), like(q), like(q)); }
    sql += ' ORDER BY p.id DESC LIMIT 500';
    const totals = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status='verified' THEN amount ELSE 0 END),0) verified,
              COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,
              COALESCE(SUM(CASE WHEN status='rejected' THEN amount ELSE 0 END),0) rejected
       FROM payments`,
    ).get();
    return ok(ctx, { payments: withMethodLabel(db.prepare(sql).all(...args)), totals, methods: db.prepare('SELECT code,name,enabled FROM payment_methods').all() });
  },

  'GET /api/admin/payments/proof': (ctx) => {
    requireAdmin(ctx);
    const row = db.prepare('SELECT id,proof,reference,method,amount,student_email,billing_month FROM payments WHERE id=?').get(toInt(ctx.url.searchParams.get('id'), 0));
    if (!row) throw notFound('Payment not found');
    if (!row.proof) throw notFound('No proof was attached to this payment');
    return ok(ctx, { payment: row });
  },

  'POST /api/admin/payments/verify': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(toInt(d.id, 0));
    if (!payment) throw notFound('Payment not found');
    const status = String(d.status || '').toLowerCase();
    if (!PAYMENT_STATUSES.includes(status)) throw bad('Invalid payment status');
    if (payment.status === 'verified' && status !== 'verified') throw conflict('A verified payment cannot be reversed here. Record an adjustment instead.');
    if (status === 'rejected' && !clean(d.note, 500)) throw bad('A reason is required when rejecting a payment');

    const receipt = status === 'verified' ? receiptNumber(payment) : null;
    const note = clean(d.note, 500);
    db.prepare(
      `UPDATE payments SET status=?,
        verified_at=CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE NULL END,
        verified_by=CASE WHEN ?='verified' THEN 'admin' ELSE NULL END,
        verification_notes=?,receipt_no=?,
        amount=COALESCE(?,amount),payment_date=COALESCE(?,payment_date)
       WHERE id=?`,
    ).run(status, status, status, note, receipt,
      d.receivedAmount === undefined ? null : Number(d.receivedAmount),
      validDate(d.receivedDate) || null, payment.id);

    if (status === 'verified') {
      db.prepare('INSERT OR IGNORE INTO receipts(payment_id,receipt_no) VALUES(?,?)').run(payment.id, receipt);
      const reactivated = reactivateIfSettled(payment.student_email);
      notify(payment.student_email, 'Payment verified',
        `Your ${monthLabel(payment.billing_month)} payment has been verified. Receipt ${receipt}.${reactivated ? ' Your account is active again.' : ''}`,
        'success');
      log('admin', 'payment_verified', JSON.stringify({ id: payment.id, student: payment.student_email, month: payment.billing_month, receipt, note }));
    } else if (status === 'rejected') {
      notify(payment.student_email, 'Payment rejected', `${note} Please submit the correct payment details for ${monthLabel(payment.billing_month)}.`, 'warning');
      log('admin', 'payment_rejected', JSON.stringify({ id: payment.id, student: payment.student_email, note }));
    } else {
      log('admin', 'payment_reset_pending', JSON.stringify({ id: payment.id, note }));
    }
    return ok(ctx, { ok: true, receipt_no: receipt, payment: db.prepare('SELECT id,status,receipt_no,verified_at FROM payments WHERE id=?').get(payment.id) });
  },

  /** Records a cash payment on the student's behalf (kept pending until approved). */
  'POST /api/admin/payments': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const email = validEmail(d.studentEmail);
    if (!email) throw bad('A valid student email is required');
    const enrollment = activeEnrollment(email);
    if (!enrollment) throw bad('That student has no approved enrollment');
    const course = courseByName(enrollment.course);
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw bad('Enter the amount received');
    const month = validMonth(d.billingMonth) || currentMonth();
    const paymentDate = validDate(d.paymentDate) || nowPK().date;
    const res = db.prepare(
      `INSERT INTO payments(student_email,enrollment_id,amount,currency,method,reference,note,billing_month,payment_date,submitted_at,status)
       VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'pending')`,
    ).run(email, enrollment.id, amount, setting('currency') || 'PKR', 'cash', clean(d.reference, 80), clean(d.note, 500), month, paymentDate);
    log('admin', 'payment_recorded', JSON.stringify({ id: res.lastInsertRowid, student: email, month, amount }));
    notify(email, 'Cash payment recorded', `A cash payment of ${setting('currency') || 'PKR'} ${amount.toLocaleString('en-US')} for ${monthLabel(month)} was recorded and is pending approval.`, 'payment');
    return created(ctx, { payment: db.prepare('SELECT * FROM payments WHERE id=?').get(res.lastInsertRowid), fee: course?.fee });
  },

  'PATCH /api/admin/payments': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const payment = db.prepare('SELECT * FROM payments WHERE id=?').get(toInt(d.id, 0));
    if (!payment) throw notFound('Payment not found');
    if (payment.status === 'verified') throw conflict('Verified payments cannot be edited');
    const amount = d.amount === undefined ? payment.amount : Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw bad('Enter a valid amount');
    db.prepare('UPDATE payments SET amount=?,reference=?,note=? WHERE id=?')
      .run(amount, clean(d.reference, 80), clean(d.note, 1000), payment.id);
    log('admin', 'payment_edited', JSON.stringify({ id: payment.id }));
    return ok(ctx);
  },

  'GET /api/admin/finance': (ctx) => {
    requireAdmin(ctx);
    const month = validMonth(ctx.url.searchParams.get('month')) || currentMonth();
    const previous = (() => {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 2, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const totalsFor = (mth) => db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status='verified' THEN amount ELSE 0 END),0) verified,
              COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) pending,
              COALESCE(SUM(CASE WHEN status='rejected' THEN amount ELSE 0 END),0) rejected,
              COUNT(*) submissions
       FROM payments WHERE billing_month=?`,
    ).get(mth);

    const outstanding = db.prepare(
      `SELECT COALESCE(SUM(c.fee),0) amount, COUNT(*) students FROM users u
       JOIN enrollments e ON e.id=(SELECT id FROM enrollments WHERE lower(email)=lower(u.email) AND status IN ('Approved','Active') ORDER BY id DESC LIMIT 1)
       JOIN courses c ON c.name=e.course
       WHERE u.role='student' AND u.active=1
         AND NOT EXISTS(SELECT 1 FROM payments p WHERE lower(p.student_email)=lower(u.email) AND p.billing_month=? AND p.status='verified')`,
    ).get(month);

    return ok(ctx, {
      month,
      monthLabel: monthLabel(month),
      previousMonth: previous,
      totals: {
        ...totalsFor(month),
        previousVerified: totalsFor(previous).verified,
        outstanding: Number(outstanding?.amount || 0),
        outstandingStudents: Number(outstanding?.students || 0),
        suspendedStudents: db.prepare("SELECT COUNT(*) n FROM users WHERE role='student' AND account_status='suspended'").get().n,
      },
      byMethod: db.prepare(
        "SELECT p.method,COALESCE(SUM(p.amount),0) total,COUNT(*) count FROM payments p WHERE p.status='verified' AND p.billing_month=? GROUP BY p.method",
      ).all(month),
      byCourse: db.prepare(
        `SELECT COALESCE(e.course,'Unassigned') course,COALESCE(SUM(p.amount),0) total,COUNT(*) count
         FROM payments p LEFT JOIN enrollments e ON e.id=p.enrollment_id
         WHERE p.status='verified' AND p.billing_month=? GROUP BY e.course ORDER BY total DESC`,
      ).all(month),
      trend: db.prepare(
        "SELECT billing_month month,COALESCE(SUM(amount),0) total FROM payments WHERE status='verified' GROUP BY billing_month ORDER BY billing_month DESC LIMIT 12",
      ).all().reverse(),
      overdue: db.prepare(
        `SELECT u.name,u.email,u.account_status,c.fee,e.course FROM users u
         JOIN enrollments e ON e.id=(SELECT id FROM enrollments WHERE lower(email)=lower(u.email) AND status IN ('Approved','Active') ORDER BY id DESC LIMIT 1)
         JOIN courses c ON c.name=e.course
         WHERE u.role='student' AND u.active=1
           AND NOT EXISTS(SELECT 1 FROM payments p WHERE lower(p.student_email)=lower(u.email) AND p.billing_month=? AND p.status='verified')
         ORDER BY u.name`,
      ).all(month),
      payments: db.prepare(
        `SELECT p.id,p.student_email,p.amount,p.method,p.status,p.billing_month,p.payment_date,p.reference,p.receipt_no,
                s.name student_name,e.course
         FROM payments p LEFT JOIN users s ON lower(s.email)=lower(p.student_email)
         LEFT JOIN enrollments e ON e.id=p.enrollment_id WHERE p.billing_month=? ORDER BY p.id DESC`,
      ).all(month),
    });
  },

  'POST /api/admin/billing/run': (ctx) => {
    requireAdmin(ctx);
    const summary = runBilling('manual');
    log('admin', 'billing_pass', JSON.stringify(summary));
    return ok(ctx, { summary });
  },

  /* ------------------------------------------------- content & settings ---- */

  'GET /api/admin/courses': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { courses: db.prepare('SELECT * FROM courses ORDER BY id').all() });
  },

  'PATCH /api/admin/courses': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    if (d.image !== undefined && String(d.image).startsWith('data:') && !validImage(d.image)) throw bad('Course image must be a PNG, JPG or WEBP under 700 KB');
    if (d.id) {
      const fields = [];
      const values = [];
      for (const key of ['name', 'description', 'duration', 'level', 'image']) {
        if (d[key] === undefined) continue;
        fields.push(`${key}=?`); values.push(clean(d[key], key === 'description' ? 2000 : 300));
      }
      if (d.fee !== undefined) {
        const fee = Number(d.fee);
        if (!Number.isFinite(fee) || fee < 0) throw bad('Enter a valid fee');
        fields.push('fee=?'); values.push(fee);
      }
      if (d.active !== undefined) { fields.push('active=?'); values.push(d.active ? 1 : 0); }
      if (!fields.length) throw bad('Nothing to update');
      values.push(toInt(d.id, 0));
      db.prepare(`UPDATE courses SET ${fields.join(',')} WHERE id=?`).run(...values);
      log('admin', 'course_updated', String(d.id));
    } else {
      const name = clean(d.name, 120);
      if (!name) throw bad('Course name is required');
      const fee = Number(d.fee);
      if (!Number.isFinite(fee) || fee < 0) throw bad('Enter a valid fee');
      if (db.prepare('SELECT 1 FROM courses WHERE name=?').get(name)) throw conflict('A course with this name already exists');
      db.prepare('INSERT INTO courses(name,description,fee,duration,level,image,active) VALUES(?,?,?,?,?,?,1)')
        .run(name, clean(d.description, 2000), fee, clean(d.duration, 60) || 'Monthly', clean(d.level, 60) || 'All levels', clean(d.image, 400));
      log('admin', 'course_created', name);
    }
    return ok(ctx, { courses: db.prepare('SELECT * FROM courses ORDER BY id').all() });
  },

  'GET /api/admin/gallery': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { items: db.prepare('SELECT * FROM gallery ORDER BY sort_order,id DESC').all() });
  },

  'POST /api/admin/gallery': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const image = String(d.image || '');
    if (!image) throw bad('Choose an image to upload');
    if (image.startsWith('data:') ? !validImage(image) : image.length > 400) throw bad('Image must be a PNG, JPG or WEBP under 700 KB, or a path inside assets/');
    const res = db.prepare('INSERT INTO gallery(title,caption,image,sort_order,active) VALUES(?,?,?,?,1)')
      .run(clean(d.title, 120), clean(d.caption, 300), image, toInt(d.sortOrder, 0));
    log('admin', 'gallery_added', String(res.lastInsertRowid));
    return created(ctx, { item: db.prepare('SELECT * FROM gallery WHERE id=?').get(res.lastInsertRowid) });
  },

  'PATCH /api/admin/gallery': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const item = db.prepare('SELECT * FROM gallery WHERE id=?').get(toInt(d.id, 0));
    if (!item) throw notFound('Gallery item not found');
    db.prepare('UPDATE gallery SET title=?,caption=?,sort_order=?,active=? WHERE id=?')
      .run(clean(d.title ?? item.title, 120), clean(d.caption ?? item.caption, 300), toInt(d.sortOrder ?? item.sort_order, 0), d.active === undefined ? item.active : (d.active ? 1 : 0), item.id);
    log('admin', 'gallery_updated', String(item.id));
    return ok(ctx);
  },

  'DELETE /api/admin/gallery': (ctx) => {
    requireAdmin(ctx);
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    db.prepare('DELETE FROM gallery WHERE id=?').run(id);
    log('admin', 'gallery_removed', String(id));
    return ok(ctx);
  },

  'GET /api/admin/testimonials': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { items: db.prepare('SELECT * FROM testimonials ORDER BY sort_order,id DESC').all() });
  },

  'POST /api/admin/testimonials': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const name = clean(d.name, 120);
    const bodyText = clean(d.body, 1200);
    if (!name || !bodyText) throw bad('A name and the testimonial text are required');
    const res = db.prepare('INSERT INTO testimonials(name,role,body,rating,sort_order,active) VALUES(?,?,?,?,?,1)')
      .run(name, clean(d.role, 120), bodyText, clamp(d.rating ?? 5, 1, 5), toInt(d.sortOrder, 0));
    log('admin', 'testimonial_added', name);
    return created(ctx, { item: db.prepare('SELECT * FROM testimonials WHERE id=?').get(res.lastInsertRowid) });
  },

  'PATCH /api/admin/testimonials': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const item = db.prepare('SELECT * FROM testimonials WHERE id=?').get(toInt(d.id, 0));
    if (!item) throw notFound('Testimonial not found');
    db.prepare('UPDATE testimonials SET name=?,role=?,body=?,rating=?,sort_order=?,active=? WHERE id=?')
      .run(clean(d.name ?? item.name, 120), clean(d.role ?? item.role, 120), clean(d.body ?? item.body, 1200),
        clamp(d.rating ?? item.rating, 1, 5), toInt(d.sortOrder ?? item.sort_order, 0),
        d.active === undefined ? item.active : (d.active ? 1 : 0), item.id);
    log('admin', 'testimonial_updated', String(item.id));
    return ok(ctx);
  },

  'DELETE /api/admin/testimonials': (ctx) => {
    requireAdmin(ctx);
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    db.prepare('DELETE FROM testimonials WHERE id=?').run(id);
    log('admin', 'testimonial_removed', String(id));
    return ok(ctx);
  },

  'GET /api/admin/messages': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { messages: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 300').all() });
  },

  /** Oversight of student ↔ teacher conversations. */
  'GET /api/admin/chat': (ctx) => {
    requireAdmin(ctx);
    const student = lower(ctx.url.searchParams.get('student'));
    const teacher = lower(ctx.url.searchParams.get('teacher'));
    if (!student || !teacher) {
      return ok(ctx, {
        conversations: db.prepare(
          `SELECT m.student_email,m.teacher_email,s.name student_name,t.name teacher_name,COUNT(*) messages,MAX(m.created_at) last_at
           FROM chat_messages m LEFT JOIN users s ON lower(s.email)=lower(m.student_email)
           LEFT JOIN users t ON lower(t.email)=lower(m.teacher_email)
           GROUP BY m.student_email,m.teacher_email ORDER BY last_at DESC LIMIT 100`,
        ).all(),
      });
    }
    log('admin', 'chat_reviewed', `${student} ↔ ${teacher}`);
    return ok(ctx, {
      messages: db.prepare('SELECT * FROM chat_messages WHERE lower(student_email)=? AND lower(teacher_email)=? ORDER BY id').all(student, teacher),
    });
  },

  'GET /api/admin/notifications': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { notifications: db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 300').all() });
  },

  'POST /api/admin/notifications': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const title = clean(d.title, 160);
    const bodyText = clean(d.body, 2000);
    if (!title || !bodyText) throw bad('A title and message are required');
    const audience = validEmail(d.email)
      ? [validEmail(d.email)]
      : db.prepare(`SELECT email FROM users WHERE active=1${d.role === 'student' || d.role === 'teacher' ? ' AND role=?' : ''}`)
        .all(...(d.role === 'student' || d.role === 'teacher' ? [d.role] : [])).map((r) => r.email);
    for (const email of audience) notify(email, title, bodyText, clean(d.type, 20) || 'announcement');
    log('admin', 'notification_sent', JSON.stringify({ count: audience.length, title }));
    return ok(ctx, { ok: true, count: audience.length });
  },

  'GET /api/admin/settings': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, {
      settings: allSettings(),
      keys: Object.keys(DEFAULT_SETTINGS),
      paymentMethods: db.prepare('SELECT * FROM payment_methods ORDER BY rowid').all(),
      config: configStatus(),
    });
  },

  'PATCH /api/admin/settings': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const blocked = new Set(['admin_key', 'jwt_secret', 'ADMIN_KEY', 'JWT_SECRET']);
    const changed = [];
    for (const [key, value] of Object.entries(d)) {
      if (blocked.has(key)) continue;
      if (!/^[a-z0-9_]{2,40}$/.test(key)) continue;
      if (key === 'academy_iban' && String(value || '').trim() && !validIBAN(value)) throw bad('That IBAN does not pass the checksum test. Please re-check it.');
      if (['due_day', 'grace_end_day', 'suspend_day'].includes(key)) {
        const n = toInt(value, 0);
        if (n < 1 || n > 28) throw bad('Billing days must be between 1 and 28');
      }
      setSetting(key, typeof value === 'string' ? value.trim() : value);
      changed.push(key);
    }
    const rules = billingRules();
    if (!(rules.dueDay <= rules.graceEndDay && rules.graceEndDay < rules.suspendDay)) {
      throw bad('Billing days must follow: due day ≤ grace end day < suspension day');
    }
    log('admin', 'settings_updated', changed.join(','));
    return ok(ctx, { settings: allSettings(), academy: academy(), config: configStatus() });
  },

  'PATCH /api/admin/payment-methods': async (ctx) => {
    requireAdmin(ctx);
    const d = await ctx.body();
    const row = db.prepare('SELECT * FROM payment_methods WHERE code=?').get(clean(d.code, 20));
    if (!row) throw notFound('Payment method not found');
    db.prepare('UPDATE payment_methods SET enabled=?,instructions=?,account_detail=? WHERE code=?')
      .run(d.enabled === undefined ? row.enabled : (d.enabled ? 1 : 0),
        clean(d.instructions ?? row.instructions, 1000), clean(d.accountDetail ?? row.account_detail, 300), row.code);
    log('admin', 'payment_method_updated', row.code);
    return ok(ctx, { methods: db.prepare('SELECT * FROM payment_methods ORDER BY rowid').all() });
  },

  'GET /api/admin/config-status': (ctx) => {
    requireAdmin(ctx);
    return ok(ctx, { config: configStatus() });
  },

  'GET /api/admin/audit': (ctx) => {
    requireAdmin(ctx);
    const q = clean(ctx.url.searchParams.get('q'), 120);
    const action = clean(ctx.url.searchParams.get('action'), 60);
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const args = [];
    if (q) { sql += ' AND (lower(actor) LIKE ? OR lower(details) LIKE ?)'; args.push(like(q), like(q)); }
    if (action) { sql += ' AND action=?'; args.push(action); }
    sql += ' ORDER BY id DESC LIMIT 500';
    return ok(ctx, {
      logs: db.prepare(sql).all(...args),
      actions: db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all().map((r) => r.action),
    });
  },
};

/**
 * Reports which optional integrations still need credentials. Nothing is invented:
 * a missing value is reported as missing so the academy can supply it.
 */
export function configStatus() {
  const a = academy();
  const required = [
    { key: 'bank_name', label: 'Bank name (Bank Transfer)', value: a.bankName, where: 'Admin → Settings' },
    { key: 'academy_iban', label: 'IBAN', value: a.iban, where: 'Admin → Settings' },
    { key: 'academy_account_title', label: 'Account title', value: a.accountTitle, where: 'Admin → Settings' },
    { key: 'easypaisa_account', label: 'Easypaisa account number', value: a.easypaisa, where: 'Admin → Settings' },
    { key: 'jazzcash_account', label: 'JazzCash account number', value: a.jazzcash, where: 'Admin → Settings' },
    { key: 'facebook_url', label: 'Facebook URL', value: setting('facebook_url'), where: 'Admin → Settings' },
    { key: 'instagram_url', label: 'Instagram URL', value: setting('instagram_url'), where: 'Admin → Settings' },
    { key: 'youtube_url', label: 'YouTube URL', value: setting('youtube_url'), where: 'Admin → Settings' },
    { key: 'tiktok_url', label: 'TikTok URL', value: setting('tiktok_url'), where: 'Admin → Settings' },
  ];
  return {
    settings: required.map((r) => ({ ...r, configured: Boolean(String(r.value || '').trim()) })),
    gateways: [
      {
        code: 'easypaisa',
        label: 'Easypaisa merchant API',
        configured: gatewayConfigured('easypaisa'),
        env: ['EASYPAISA_STORE_ID', 'EASYPAISA_HASH_KEY', 'EASYPAISA_POST_URL'],
        missing: ['EASYPAISA_STORE_ID', 'EASYPAISA_HASH_KEY', 'EASYPAISA_POST_URL'].filter((k) => !process.env[k]),
        fallback: 'Manual payment-proof workflow with administrator verification',
      },
      {
        code: 'jazzcash',
        label: 'JazzCash merchant API',
        configured: gatewayConfigured('jazzcash'),
        env: ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT', 'JAZZCASH_POST_URL'],
        missing: ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT', 'JAZZCASH_POST_URL'].filter((k) => !process.env[k]),
        fallback: 'Manual payment-proof workflow with administrator verification',
      },
    ],
    secrets: [
      { key: 'JWT_SECRET', configured: Boolean(process.env.JWT_SECRET), where: 'server/.env' },
      { key: 'ADMIN_KEY', configured: Boolean(process.env.ADMIN_KEY), where: 'server/.env' },
    ],
  };
}
