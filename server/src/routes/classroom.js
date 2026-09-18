import { db, notify, log } from '../db.js';
import { ok, created, bad, notFound, forbidden, requireUser } from '../http.js';
import { clean, toInt } from '../util.js';
import { studentBilling, nowPK } from '../billing.js';

/** Suspended students keep their history but cannot enter the live classroom. */
function assertLearningAccess(email) {
  const row = db.prepare("SELECT account_status FROM users WHERE lower(email)=lower(?) AND role='student'").get(email);
  if (row?.account_status === 'suspended') {
    const billing = studentBilling(email);
    throw forbidden(`Your account is suspended because the ${billing.monthLabel} fee is not verified yet. Submit or wait for verification of your payment to restore classroom access.`);
  }
}

function conversationAllowed(role, studentEmail, teacherEmail) {
  return Boolean(db.prepare(
    "SELECT 1 FROM enrollments WHERE lower(email)=lower(?) AND lower(teacher)=lower(?) AND status IN ('Approved','Active','Completed')",
  ).get(studentEmail, teacherEmail));
}

export default {
  'GET /api/classes': (ctx) => {
    const u = requireUser(ctx);
    const rows = u.role === 'student'
      ? db.prepare(
        `SELECT c.*,t.name teacher_name,a.status attendance_status FROM class_sessions c
         LEFT JOIN users t ON lower(t.email)=lower(c.teacher_email)
         LEFT JOIN attendance a ON a.class_id=c.id
         WHERE lower(c.student_email)=lower(?) ORDER BY c.starts_at DESC`,
      ).all(u.email)
      : db.prepare(
        `SELECT c.*,s.name student_name,a.status attendance_status FROM class_sessions c
         LEFT JOIN users s ON lower(s.email)=lower(c.student_email)
         LEFT JOIN attendance a ON a.class_id=c.id
         WHERE lower(c.teacher_email)=lower(?) ORDER BY c.starts_at DESC`,
      ).all(u.email);
    return ok(ctx, { classes: rows, now: nowPK() });
  },

  /**
   * Returns the private Jitsi room for a class the caller belongs to.
   * The room name is derived server-side; it is never accepted from the client.
   */
  'GET /api/classes/join': (ctx) => {
    const u = requireUser(ctx);
    const session = db.prepare('SELECT * FROM class_sessions WHERE id=?').get(toInt(ctx.url.searchParams.get('id'), 0));
    if (!session) throw notFound('Class not found');
    if (u.role === 'student') {
      if (session.student_email.toLowerCase() !== u.email.toLowerCase()) throw forbidden('This class does not belong to you');
      assertLearningAccess(u.email);
    } else if (u.role === 'teacher') {
      if (session.teacher_email.toLowerCase() !== u.email.toLowerCase()) throw forbidden('You are not assigned to this class');
    } else {
      throw forbidden('Only students and teachers can join a class');
    }
    if (session.status === 'cancelled') throw bad('This class was cancelled');
    if (u.role === 'teacher' && session.status === 'scheduled') {
      db.prepare("UPDATE class_sessions SET status='live' WHERE id=?").run(session.id);
      notify(session.student_email, 'Your class is live', `Your teacher has opened the ${session.course} classroom.`, 'class');
    }
    const displayName = db.prepare('SELECT name FROM users WHERE lower(email)=lower(?)').get(u.email)?.name || u.email;
    log(u.email, 'class_joined', String(session.id));
    return ok(ctx, {
      ok: true,
      room: session.room_name,
      provider: 'jitsi',
      url: `https://meet.jit.si/${encodeURIComponent(session.room_name)}#userInfo.displayName=%22${encodeURIComponent(displayName)}%22&config.prejoinPageEnabled=false`,
      class: db.prepare('SELECT * FROM class_sessions WHERE id=?').get(session.id),
      displayName,
    });
  },

  'GET /api/chat/contacts': (ctx) => {
    const u = requireUser(ctx);
    let contacts = [];
    if (u.role === 'student') {
      contacts = db.prepare(
        `SELECT DISTINCT t.name,t.email,t.avatar,'teacher' role,
                (SELECT COUNT(*) FROM chat_messages m WHERE lower(m.teacher_email)=lower(t.email) AND lower(m.student_email)=lower(?) AND m.sender_role='teacher' AND m.read_at IS NULL) unread,
                (SELECT m.message FROM chat_messages m WHERE lower(m.teacher_email)=lower(t.email) AND lower(m.student_email)=lower(?) ORDER BY m.id DESC LIMIT 1) last_message,
                (SELECT m.created_at FROM chat_messages m WHERE lower(m.teacher_email)=lower(t.email) AND lower(m.student_email)=lower(?) ORDER BY m.id DESC LIMIT 1) last_at
         FROM enrollments e JOIN users t ON lower(t.email)=lower(e.teacher)
         WHERE lower(e.email)=lower(?) AND e.teacher<>'' AND t.active=1`,
      ).all(u.email, u.email, u.email, u.email);
    } else if (u.role === 'teacher') {
      contacts = db.prepare(
        `SELECT DISTINCT s.name,s.email,s.avatar,'student' role,
                (SELECT COUNT(*) FROM chat_messages m WHERE lower(m.student_email)=lower(s.email) AND lower(m.teacher_email)=lower(?) AND m.sender_role='student' AND m.read_at IS NULL) unread,
                (SELECT m.message FROM chat_messages m WHERE lower(m.student_email)=lower(s.email) AND lower(m.teacher_email)=lower(?) ORDER BY m.id DESC LIMIT 1) last_message,
                (SELECT m.created_at FROM chat_messages m WHERE lower(m.student_email)=lower(s.email) AND lower(m.teacher_email)=lower(?) ORDER BY m.id DESC LIMIT 1) last_at
         FROM enrollments e JOIN users s ON lower(s.email)=lower(e.email)
         WHERE lower(e.teacher)=lower(?) AND s.active=1`,
      ).all(u.email, u.email, u.email, u.email);
    }
    return ok(ctx, { contacts });
  },

  'GET /api/chat': (ctx) => {
    const u = requireUser(ctx);
    const other = String(ctx.url.searchParams.get('with') || '').toLowerCase();
    const studentEmail = u.role === 'student' ? u.email : other;
    const teacherEmail = u.role === 'teacher' ? u.email : other;
    if (!other || !conversationAllowed(u.role, studentEmail, teacherEmail)) throw forbidden('This conversation is not available to you');
    const messages = db.prepare(
      'SELECT * FROM chat_messages WHERE lower(student_email)=lower(?) AND lower(teacher_email)=lower(?) ORDER BY id',
    ).all(studentEmail, teacherEmail);
    db.prepare(
      'UPDATE chat_messages SET read_at=CURRENT_TIMESTAMP WHERE lower(student_email)=lower(?) AND lower(teacher_email)=lower(?) AND sender_role<>? AND read_at IS NULL',
    ).run(studentEmail, teacherEmail, u.role);
    return ok(ctx, { messages, with: other });
  },

  'POST /api/chat': async (ctx) => {
    const u = requireUser(ctx);
    const d = await ctx.body();
    const other = String(d.with || '').toLowerCase();
    const message = clean(d.message, 2000);
    if (!message) throw bad('Type a message before sending');
    const studentEmail = u.role === 'student' ? u.email : other;
    const teacherEmail = u.role === 'teacher' ? u.email : other;
    if (!other || !conversationAllowed(u.role, studentEmail, teacherEmail)) throw forbidden('This conversation is not available to you');
    if (u.role === 'student') assertLearningAccess(u.email);
    db.prepare('INSERT INTO chat_messages(student_email,teacher_email,sender_email,sender_role,message) VALUES(?,?,?,?,?)')
      .run(studentEmail, teacherEmail, u.email, u.role, message);
    const senderName = db.prepare('SELECT name FROM users WHERE lower(email)=lower(?)').get(u.email)?.name || u.role;
    notify(other, 'New message', `${senderName} sent you a message.`, 'message');
    return created(ctx, { ok: true });
  },
};
