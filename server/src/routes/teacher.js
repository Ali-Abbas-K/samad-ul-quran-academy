import { db, academy, notify, log } from '../db.js';
import { ok, created, bad, notFound, requireUser } from '../http.js';
import { clean, toInt, clamp, safeUser } from '../util.js';
import { nowPK } from '../billing.js';

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Leave'];

function recalcAttendance(studentEmail) {
  const row = db.prepare(
    `SELECT ROUND(100.0*SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)) pct
     FROM attendance WHERE lower(student_email)=lower(?)`,
  ).get(studentEmail);
  const pct = Math.round(Number(row?.pct || 0));
  db.prepare('UPDATE enrollments SET attendance=? WHERE lower(email)=lower(?)').run(pct, studentEmail);
  return pct;
}

export default {
  'GET /api/teacher/dashboard': (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const teacher = db.prepare('SELECT * FROM users WHERE id=?').get(u.sub);
    const enrollments = db.prepare(
      `SELECT e.*,s.name student_account_name,s.avatar student_avatar,s.account_status student_account_status,s.email student_email
       FROM enrollments e LEFT JOIN users s ON lower(s.email)=lower(e.email)
       WHERE lower(e.teacher)=lower(?) ORDER BY e.status,e.student_name`,
    ).all(teacher.email);
    const classes = db.prepare(
      `SELECT c.*,s.name student_name,s.avatar student_avatar,a.status attendance_status
       FROM class_sessions c LEFT JOIN users s ON lower(s.email)=lower(c.student_email)
       LEFT JOIN attendance a ON a.class_id=c.id AND lower(a.student_email)=lower(c.student_email)
       WHERE lower(c.teacher_email)=lower(?) ORDER BY c.starts_at DESC LIMIT 200`,
    ).all(u.email);
    const attendance = db.prepare(
      `SELECT a.*,c.starts_at,c.course,s.name student_name FROM attendance a
       JOIN class_sessions c ON c.id=a.class_id
       LEFT JOIN users s ON lower(s.email)=lower(a.student_email)
       WHERE lower(a.teacher_email)=lower(?) ORDER BY a.marked_at DESC LIMIT 200`,
    ).all(u.email);
    const notifications = db.prepare('SELECT * FROM notifications WHERE lower(user_email)=lower(?) ORDER BY id DESC LIMIT 20').all(u.email);
    const unreadMessages = db.prepare(
      "SELECT COUNT(*) n FROM chat_messages WHERE lower(teacher_email)=lower(?) AND sender_role='student' AND read_at IS NULL",
    ).get(u.email).n;
    const today = nowPK().date;

    return ok(ctx, {
      teacher: safeUser(teacher),
      enrollments,
      classes,
      todayClasses: classes.filter((c) => String(c.starts_at).slice(0, 10) === today),
      upcoming: classes.filter((c) => c.status === 'scheduled' && c.starts_at >= `${today} 00:00`).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      attendance,
      notifications,
      unreadNotifications: notifications.filter((n) => !n.read_at).length,
      unreadMessages,
      stats: {
        students: enrollments.filter((e) => ['Approved', 'Active'].includes(e.status)).length,
        totalStudents: enrollments.length,
        scheduled: classes.filter((c) => c.status === 'scheduled').length,
        completed: classes.filter((c) => c.status === 'completed').length,
        attendanceMarked: attendance.length,
      },
      academy: academy(),
    });
  },

  'GET /api/teacher/students/detail': (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const id = toInt(ctx.url.searchParams.get('id'), 0);
    const enrollment = db.prepare(
      `SELECT e.*,s.name account_name,s.avatar,s.account_status,s.phone FROM enrollments e
       LEFT JOIN users s ON lower(s.email)=lower(e.email)
       WHERE e.id=? AND lower(e.teacher)=lower(?)`,
    ).get(id, u.email);
    if (!enrollment) throw notFound('That student is not assigned to you');
    return ok(ctx, {
      enrollment,
      classes: db.prepare('SELECT * FROM class_sessions WHERE lower(student_email)=lower(?) AND lower(teacher_email)=lower(?) ORDER BY starts_at DESC').all(enrollment.email, u.email),
      attendance: db.prepare(
        `SELECT a.*,c.starts_at,c.course FROM attendance a JOIN class_sessions c ON c.id=a.class_id
         WHERE lower(a.student_email)=lower(?) ORDER BY c.starts_at DESC`,
      ).all(enrollment.email),
    });
  },

  'PATCH /api/teacher/enrollments': async (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const d = await ctx.body();
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=? AND lower(teacher)=lower(?)').get(toInt(d.id, 0), u.email);
    if (!enrollment) throw notFound('That student is not assigned to you');
    const fields = [];
    const values = [];
    if (d.progress !== undefined) { fields.push('progress=?'); values.push(clamp(d.progress, 0, 100)); }
    if (d.level !== undefined) { fields.push('level=?'); values.push(clean(d.level, 60)); }
    if (d.notes !== undefined) { fields.push('notes=?'); values.push(clean(d.notes, 2000)); }
    if (d.status !== undefined && ['Active', 'Completed'].includes(String(d.status))) { fields.push('status=?'); values.push(String(d.status)); }
    if (!fields.length) throw bad('Nothing to update');
    values.push(enrollment.id);
    db.prepare(`UPDATE enrollments SET ${fields.join(',')} WHERE id=?`).run(...values);
    log(u.email, 'enrollment_progress_updated', String(enrollment.id));
    if (d.progress !== undefined) {
      notify(enrollment.email, 'Learning progress updated', `Your teacher updated your ${enrollment.course} progress to ${clamp(d.progress, 0, 100)}%.`, 'info');
    }
    return ok(ctx, { enrollment: db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollment.id) });
  },

  'POST /api/teacher/attendance': async (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const d = await ctx.body();
    const status = String(d.status || '');
    if (!ATTENDANCE_STATUSES.includes(status)) throw bad('Attendance must be Present, Absent, Late or Leave');
    const session = db.prepare('SELECT * FROM class_sessions WHERE id=? AND lower(teacher_email)=lower(?)').get(toInt(d.classId, 0), u.email);
    if (!session) throw notFound('Class not found');
    db.prepare(
      `INSERT INTO attendance(class_id,student_email,teacher_email,status,notes) VALUES(?,?,?,?,?)
       ON CONFLICT(class_id,student_email) DO UPDATE SET status=excluded.status,notes=excluded.notes,marked_at=CURRENT_TIMESTAMP`,
    ).run(session.id, session.student_email, u.email, status, clean(d.notes, 500));
    if (session.status === 'scheduled') {
      db.prepare("UPDATE class_sessions SET status='completed' WHERE id=?").run(session.id);
    }
    const pct = recalcAttendance(session.student_email);
    notify(session.student_email, 'Attendance marked', `Your ${session.course} class on ${session.starts_at} was marked ${status}.`, 'attendance');
    log(u.email, 'attendance_marked', JSON.stringify({ class: session.id, status }));
    return ok(ctx, { ok: true, percentage: pct });
  },

  /** Teachers schedule classes for their own assigned students. */
  'POST /api/classes': async (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const d = await ctx.body();
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id=? AND lower(teacher)=lower(?)').get(toInt(d.enrollmentId, 0), u.email);
    if (!enrollment) throw notFound('That student is not assigned to you');
    const { startsAt, endsAt } = normaliseWindow(d);
    const { roomName } = await import('../util.js');
    const result = db.prepare(
      `INSERT INTO class_sessions(student_email,teacher_email,course,room_name,starts_at,ends_at,status,notes,topic)
       VALUES(?,?,?,?,?,?,'scheduled',?,?)`,
    ).run(enrollment.email, u.email, enrollment.course, roomName(enrollment.email, enrollment.course), startsAt, endsAt, clean(d.notes, 500), clean(d.topic, 160));
    notify(enrollment.email, 'New class scheduled', `Your ${enrollment.course} class is scheduled for ${startsAt} (Pakistan time).`, 'class');
    log(u.email, 'class_created', String(result.lastInsertRowid));
    return created(ctx, { class: db.prepare('SELECT * FROM class_sessions WHERE id=?').get(result.lastInsertRowid) });
  },

  'PATCH /api/teacher/classes': async (ctx) => {
    const u = requireUser(ctx, 'teacher');
    const d = await ctx.body();
    const session = db.prepare('SELECT * FROM class_sessions WHERE id=? AND lower(teacher_email)=lower(?)').get(toInt(d.id, 0), u.email);
    if (!session) throw notFound('Class not found');
    const fields = [];
    const values = [];
    if (d.status !== undefined) {
      const status = String(d.status);
      if (!['scheduled', 'live', 'completed', 'cancelled'].includes(status)) throw bad('Invalid class status');
      fields.push('status=?'); values.push(status);
    }
    if (d.notes !== undefined) { fields.push('notes=?'); values.push(clean(d.notes, 500)); }
    if (d.topic !== undefined) { fields.push('topic=?'); values.push(clean(d.topic, 160)); }
    if (!fields.length) throw bad('Nothing to update');
    values.push(session.id);
    db.prepare(`UPDATE class_sessions SET ${fields.join(',')} WHERE id=?`).run(...values);
    if (d.status === 'cancelled') notify(session.student_email, 'Class cancelled', `Your ${session.course} class on ${session.starts_at} was cancelled.`, 'warning');
    log(u.email, 'class_updated', JSON.stringify({ id: session.id, status: d.status }));
    return ok(ctx);
  },
};

export function normaliseWindow(d) {
  const startsAt = clean(d.startsAt, 25).replace('T', ' ');
  let endsAt = clean(d.endsAt, 25).replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(startsAt)) throw bad('Enter a valid class start date and time');
  if (!endsAt) {
    const [date, time] = startsAt.split(' ');
    const [h, m] = time.split(':').map(Number);
    const end = new Date(Date.UTC(2000, 0, 1, h, m + 30));
    endsAt = `${date} ${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(endsAt)) throw bad('Enter a valid class end time');
  if (endsAt <= startsAt) throw bad('The class end time must be after the start time');
  return { startsAt: startsAt.slice(0, 16), endsAt: endsAt.slice(0, 16) };
}

export { ATTENDANCE_STATUSES, recalcAttendance };
