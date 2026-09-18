import { db, academy, social, setting, notify, log } from '../db.js';
import { ok, created, bad, notFound } from '../http.js';
import { clean, validEmail, normalizePhone, rateLimit, toInt } from '../util.js';
import { gatewayConfigured } from '../config.js';

export default {
  'GET /api/health': (ctx) => ok(ctx, {
    ok: true,
    service: 'Samad-ul-Qur’an Academy',
    version: '2.0.0',
    time: new Date().toISOString(),
  }),

  'GET /api/courses': (ctx) => {
    const courses = db.prepare(
      `SELECT c.id,c.name,c.description,c.fee,c.duration,c.level,c.image,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course=c.name AND e.status IN ('Approved','Active')) AS students
       FROM courses c WHERE c.active=1 ORDER BY c.id`,
    ).all().map((c) => ({ ...c, slug: slugify(c.name) }));
    return ok(ctx, { courses, currency: setting('currency') || 'PKR' });
  },

  'GET /api/courses/detail': (ctx) => {
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    const slug = clean(ctx.url.searchParams.get('slug'), 120);
    const course = id
      ? db.prepare('SELECT * FROM courses WHERE id=? AND active=1').get(id)
      : db.prepare('SELECT * FROM courses WHERE active=1').all().find((c) => slugify(c.name) === slug);
    if (!course) throw notFound('Course not found');
    course.slug = slugify(course.name);
    const teachers = db.prepare(
      `SELECT DISTINCT u.name,u.qualification,u.experience,u.specialities,u.avatar
       FROM users u JOIN enrollments e ON lower(e.teacher)=lower(u.email)
       WHERE u.role='teacher' AND u.active=1 AND e.course=? LIMIT 6`,
    ).all(course.name);
    return ok(ctx, { course, teachers, currency: setting('currency') || 'PKR' });
  },

  'GET /api/public/settings': (ctx) => ok(ctx, {
    academy: academy(),
    social: social(),
    paymentMethods: db.prepare('SELECT code,name,enabled FROM payment_methods ORDER BY rowid').all(),
    gateways: { easypaisa: gatewayConfigured('easypaisa'), jazzcash: gatewayConfigured('jazzcash') },
  }),

  'GET /api/public/teachers': (ctx) => {
    const teachers = db.prepare(
      `SELECT u.name,u.qualification,u.experience,u.specialities,u.bio,u.avatar,
              (SELECT COUNT(*) FROM enrollments e WHERE lower(e.teacher)=lower(u.email) AND e.status IN ('Approved','Active')) AS students
       FROM users u WHERE u.role='teacher' AND u.active=1 ORDER BY u.name`,
    ).all();
    return ok(ctx, { teachers });
  },

  'GET /api/public/gallery': (ctx) => ok(ctx, {
    items: db.prepare('SELECT id,title,caption,image FROM gallery WHERE active=1 ORDER BY sort_order,id DESC').all(),
  }),

  'GET /api/public/testimonials': (ctx) => ok(ctx, {
    items: db.prepare('SELECT id,name,role,body,rating FROM testimonials WHERE active=1 ORDER BY sort_order,id DESC LIMIT 12').all(),
  }),

  /** Real counts only — nothing here is invented or padded. */
  'GET /api/public/stats': (ctx) => ok(ctx, {
    stats: {
      courses: db.prepare('SELECT COUNT(*) n FROM courses WHERE active=1').get().n,
      teachers: db.prepare("SELECT COUNT(*) n FROM users WHERE role='teacher' AND active=1").get().n,
      students: db.prepare("SELECT COUNT(*) n FROM enrollments WHERE status IN ('Approved','Active')").get().n,
      classes: db.prepare("SELECT COUNT(*) n FROM class_sessions WHERE status='completed'").get().n,
    },
  }),

  'POST /api/contact': async (ctx) => {
    const d = await ctx.body();
    const name = clean(d.name, 120);
    const email = validEmail(d.email);
    const message = clean(d.message, 4000);
    if (!name || !email || !message) throw bad('Name, a valid email and a message are required');
    if (!rateLimit(`contact:${ctx.ip}`, 6, 3_600_000)) throw bad('Too many messages sent from this device. Please try again later.');
    db.prepare('INSERT INTO messages(name,email,phone,subject,message) VALUES(?,?,?,?,?)')
      .run(name, email, normalizePhone(d.phone), clean(d.subject, 160), message);
    log(email, 'contact_message', clean(d.subject, 160));
    notify(setting('academy_email'), 'New website enquiry', `${name} (${email}) sent a message from the website.`, 'info');
    return created(ctx, { ok: true });
  },
};

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
