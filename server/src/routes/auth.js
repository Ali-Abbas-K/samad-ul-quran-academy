import { db, notify, log, courseByName, setting } from '../db.js';
import { ok, created, bad, conflict, requireUser, HttpError } from '../http.js';
import {
  clean, lower, validEmail, normalizePhone, rateLimit, signToken, safeUser,
  hashPassword, verifyPassword, validImage, toInt,
} from '../util.js';
import { studentBilling } from '../billing.js';

const DAY_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default {
  'POST /api/auth/login': async (ctx) => {
    const d = await ctx.body();
    const email = validEmail(d.email);
    const password = String(d.password || '');
    if (!email || !password) throw bad('Email and password are required');
    if (!rateLimit(`login:${email}`, 8, 900_000) || !rateLimit(`login-ip:${ctx.ip}`, 30, 900_000)) {
      throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }
    const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
    if (!user.active) throw new HttpError(403, 'This account has been deactivated. Please contact the academy.');
    if (d.role && d.role !== user.role) throw new HttpError(403, `This account is registered as a ${user.role}. Use the ${user.role} login page.`);

    db.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
    log(user.email, 'login', user.role);
    return ok(ctx, {
      token: signToken({ sub: user.id, role: user.role, email: user.email }),
      user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)),
    });
  },

  /** Exchanges the configured admin key for a short-lived admin session token. */
  'POST /api/auth/admin': async (ctx) => {
    const d = await ctx.body();
    if (!rateLimit(`admin-login:${ctx.ip}`, 10, 900_000)) {
      throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
    }
    const { adminKeyMatches } = await import('../util.js');
    if (!adminKeyMatches(d.key)) {
      log('unknown', 'admin_login_failed', ctx.ip);
      throw new HttpError(401, 'Invalid administrator key');
    }
    log('admin', 'admin_login', ctx.ip);
    return ok(ctx, {
      token: signToken({ sub: 0, role: 'admin', email: 'admin' }, 60 * 60 * 8),
      user: { role: 'admin', name: 'Administrator', email: setting('academy_email') },
    });
  },

  'POST /api/auth/register': () => {
    throw new HttpError(403, 'Public registration is disabled. Students receive an account through the admission form; teachers are created by the administrator.');
  },

  /** Public admission / enrolment request. Creates the student account on first use. */
  'POST /api/enrollments': async (ctx) => {
    const d = await ctx.body();
    if (!rateLimit(`enroll:${ctx.ip}`, 8, 3_600_000)) throw bad('Too many admission requests from this device. Please contact us on WhatsApp.');

    const course = db.prepare('SELECT * FROM courses WHERE name=? AND active=1').get(clean(d.course, 120));
    if (!course) throw bad('Please choose a valid course');

    const studentName = clean(d.studentName, 120);
    const email = validEmail(d.email);
    const timing = clean(d.timing, 60);
    const days = Array.isArray(d.days) ? d.days.filter((x) => DAY_LIST.includes(x)).join(', ') : clean(d.days, 160);
    const age = d.age === '' || d.age === undefined || d.age === null ? null : toInt(d.age, 0);

    if (!studentName || !email) throw bad('Student name and a valid email address are required');
    if (!timing || !days) throw bad('Please choose your preferred class time and days');
    if (age !== null && (age < 3 || age > 100)) throw bad('Please enter a valid age');
    if (age !== null && age < 18 && !clean(d.guardianName, 120)) throw bad('Guardian name is required for students under 18');

    let student = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) AND role='student'").get(email);
    const existingOther = db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?) AND role<>'student'").get(email);
    if (existingOther) throw conflict('This email is already registered with a teacher or staff account');

    if (!student) {
      if (String(d.password || '').length < 8) throw bad('Create a password of at least 8 characters for your student portal');
      const res = db.prepare('INSERT INTO users(role,name,email,password_hash,phone,active) VALUES(?,?,?,?,?,1)')
        .run('student', studentName, email, hashPassword(d.password), normalizePhone(d.whatsapp));
      student = db.prepare('SELECT * FROM users WHERE id=?').get(res.lastInsertRowid);
      log(email, 'student_account_created', 'admission');
    }

    const duplicate = db.prepare(
      "SELECT 1 FROM enrollments WHERE lower(email)=lower(?) AND course=? AND status IN ('Pending','Approved','Active')",
    ).get(email, course.name);
    if (duplicate) throw conflict(`You already have an active or pending admission for ${course.name}.`);

    const result = db.prepare(
      `INSERT INTO enrollments(student_name,guardian_name,guardian_phone,age,gender,country,whatsapp,email,course,level,timing,days,timezone,teacher,message,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending')`,
    ).run(
      studentName,
      clean(d.guardianName, 120),
      normalizePhone(d.guardianPhone),
      age,
      clean(d.gender, 20),
      clean(d.country, 80),
      normalizePhone(d.whatsapp),
      email,
      course.name,
      clean(d.level, 60) || course.level,
      timing,
      days,
      clean(d.timezone, 60) || 'Asia/Karachi',
      '',
      clean(d.message, 2000),
    );

    notify(email, 'Admission received', `Your ${course.name} admission request has been received and is pending review. We will assign your teacher shortly.`, 'admission');
    notify(setting('academy_email'), 'New admission request', `${studentName} applied for ${course.name}.`, 'admission');
    log(email, 'enrollment_created', String(result.lastInsertRowid));

    return created(ctx, {
      ok: true,
      enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(result.lastInsertRowid),
      fee: course.fee,
      accountCreated: true,
    });
  },

  'GET /api/me': (ctx) => {
    const u = requireUser(ctx);
    if (u.role === 'admin') return ok(ctx, { user: { role: 'admin', name: 'Administrator', email: 'admin' } });
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(u.sub);
    if (!row || !row.active) throw new HttpError(401, 'Session is no longer valid');
    const payload = { user: safeUser(row) };
    if (row.role === 'student') payload.billing = studentBilling(row.email);
    return ok(ctx, payload);
  },

  'PATCH /api/profile': async (ctx) => {
    const u = requireUser(ctx);
    const d = await ctx.body();
    if (d.avatar !== undefined && !validImage(d.avatar)) throw bad('Profile photo must be a PNG, JPG or WEBP image under 700 KB');
    const editable = u.role === 'teacher'
      ? ['name', 'phone', 'qualification', 'experience', 'specialities', 'bio', 'avatar']
      : ['name', 'phone', 'avatar'];
    const fields = [];
    const values = [];
    for (const key of editable) {
      if (d[key] === undefined) continue;
      fields.push(`${key}=?`);
      values.push(key === 'phone' ? normalizePhone(d[key]) : key === 'avatar' ? String(d[key] || '') : clean(d[key], key === 'bio' ? 1200 : 200));
    }
    if (fields.length) {
      values.push(u.sub);
      db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...values);
      log(u.email, 'profile_updated', fields.map((f) => f.split('=')[0]).join(','));
    }
    return ok(ctx, { user: safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.sub)) });
  },

  'POST /api/profile/password': async (ctx) => {
    const u = requireUser(ctx);
    const d = await ctx.body();
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(u.sub);
    if (!verifyPassword(d.currentPassword || '', row.password_hash)) throw bad('Your current password is incorrect');
    if (String(d.newPassword || '').length < 8) throw bad('The new password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(d.newPassword), u.sub);
    log(u.email, 'password_changed');
    return ok(ctx);
  },

  'GET /api/notifications': (ctx) => {
    const u = requireUser(ctx);
    const rows = db.prepare('SELECT * FROM notifications WHERE lower(user_email)=lower(?) ORDER BY id DESC LIMIT 100').all(u.email);
    return ok(ctx, { notifications: rows, unread: rows.filter((r) => !r.read_at).length });
  },

  'PATCH /api/notifications/read': async (ctx) => {
    const u = requireUser(ctx);
    const d = await ctx.body();
    if (d.all) {
      db.prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE lower(user_email)=lower(?) AND read_at IS NULL').run(u.email);
    } else {
      db.prepare('UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND lower(user_email)=lower(?)').run(toInt(d.id, 0), u.email);
    }
    return ok(ctx);
  },
};

export { DAY_LIST };
