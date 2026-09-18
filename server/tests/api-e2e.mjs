/**
 * End-to-end API test for the Samad-ul-Qur'an Academy server.
 *
 * Exercises the real lifecycle against a running server (no mocks):
 *   public site data → admission → approval → teacher assignment → class →
 *   attendance → chat → payment submission → admin verification → receipt →
 *   billing suspension timeline → reactivation → admin content & settings.
 *
 * Usage:  node tests/api-e2e.mjs [baseUrl]
 * Requires the server to be running and ADMIN_KEY available in the environment
 * (server/.env is read automatically when this is run from the server folder).
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || 'https://samad-ul-quran-academy-1.onrender.com').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function envValue(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = fs.readFileSync(path.join(ROOT, 'server', '.env'), 'utf8')
      .split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : '';
  } catch { return ''; }
}

const ADMIN_KEY = envValue('ADMIN_KEY');
const stamp = Date.now().toString(36);
const STUDENT = { email: `e2e.student.${stamp}@example.com`, password: 'StudentPass123' };
const TEACHER = { email: `e2e.teacher.${stamp}@example.com`, password: 'TeacherPass123' };

let pass = 0;
const failures = [];

async function api(method, endpoint, { body, token, adminKey } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminKey) headers['X-Admin-Key'] = ADMIN_KEY;
  const res = await fetch(BASE + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function check(name, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  ok   ${name}`); } else { failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

function group(title) { console.log(`\n${title}`); }

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const state = {};

/* ------------------------------------------------------------------ run --- */

group('1. Public website APIs');
{
  const health = await api('GET', '/api/health');
  check('health endpoint responds', health.status === 200 && health.data.ok !== false, JSON.stringify(health.data).slice(0, 120));

  const settings = await api('GET', '/api/public/settings');
  check('public settings expose academy name', settings.status === 200 && !!settings.data.academy?.name);
  check('public settings never leak the admin key', !JSON.stringify(settings.data).toLowerCase().includes('admin_key'));
  check('real IBAN is preserved', settings.data.academy?.iban === 'PK31NAYA1234503227589462', settings.data.academy?.iban);
  check('real account title is preserved', settings.data.academy?.accountTitle === 'Hafiz Muhammad Saqib');

  const courses = await api('GET', '/api/courses');
  check('six courses are published', courses.status === 200 && courses.data.courses?.length >= 6, String(courses.data.courses?.length));
  state.course = courses.data.courses?.find((c) => c.name === 'Tajweed') || courses.data.courses?.[0];
  check('course carries a fee', Number(state.course?.fee) > 0);

  const detail = await api('GET', `/api/courses/detail?slug=${encodeURIComponent(state.course.slug || '')}`);
  check('course detail resolves by slug', detail.status === 200 && !!detail.data.course);

  for (const endpoint of ['/api/public/stats', '/api/public/teachers', '/api/public/gallery', '/api/public/testimonials']) {
    const r = await api('GET', endpoint);
    check(`${endpoint} responds 200`, r.status === 200, String(r.status));
  }

  const contact = await api('POST', '/api/contact', { body: { name: 'E2E Visitor', email: `visitor.${stamp}@example.com`, message: 'Automated end-to-end contact form test message.' } });
  check('contact form accepts a message', contact.status === 201 || contact.status === 200, String(contact.status));

  const badContact = await api('POST', '/api/contact', { body: { name: '', email: 'not-an-email', message: 'x' } });
  check('contact form rejects invalid input', badContact.status === 400);
}

group('2. Authentication and authorisation');
{
  const noAuth = await api('GET', '/api/student/dashboard');
  check('student dashboard requires a session', noAuth.status === 401);

  const noAdmin = await api('GET', '/api/admin/overview');
  check('admin overview requires the admin key', noAdmin.status === 401);

  const wrongKey = await api('POST', '/api/auth/admin', { body: { key: 'definitely-wrong-key' } });
  check('wrong admin key is rejected', wrongKey.status === 401);

  const admin = await api('POST', '/api/auth/admin', { body: { key: ADMIN_KEY } });
  check('admin key exchanges for a token', admin.status === 200 && !!admin.data.token);
  state.adminToken = admin.data.token;

  const register = await api('POST', '/api/auth/register', { body: { email: STUDENT.email, password: STUDENT.password } });
  check('public self-registration stays disabled', register.status === 403);
}

group('3. Teacher account (admin created)');
{
  const create = await api('POST', '/api/admin/teachers', {
    token: state.adminToken,
    body: {
      name: 'Qari E2E Tester', email: TEACHER.email, password: TEACHER.password,
      phone: '03001234567', qualification: 'Sanad in Hifz & Tajweed', experience: '8 years',
      specialities: 'Tajweed, Hifz', bio: 'Automated test teacher profile.',
    },
  });
  check('admin can create a teacher', create.status === 201, JSON.stringify(create.data).slice(0, 140));

  const weak = await api('POST', '/api/admin/teachers', { token: state.adminToken, body: { name: 'Weak', email: `weak.${stamp}@example.com`, password: 'short' } });
  check('weak teacher password is rejected', weak.status === 400);

  const login = await api('POST', '/api/auth/login', { body: { email: TEACHER.email, password: TEACHER.password, role: 'teacher' } });
  check('teacher can sign in', login.status === 200 && !!login.data.token);
  state.teacherToken = login.data.token;

  const wrongRole = await api('POST', '/api/auth/login', { body: { email: TEACHER.email, password: TEACHER.password, role: 'student' } });
  check('teacher cannot use the student login', wrongRole.status === 403);

  const crossRole = await api('GET', '/api/admin/students', { token: state.teacherToken });
  check('teacher token cannot reach admin APIs', crossRole.status === 401);

  const teachers = await api('GET', '/api/public/teachers');
  check('new teacher appears on the public site', teachers.data.teachers?.some((t) => t.email === TEACHER.email || t.name === 'Qari E2E Tester'));
}

group('4. Admission workflow');
{
  const apply = await api('POST', '/api/enrollments', {
    body: {
      studentName: 'E2E Student', guardianName: 'E2E Guardian', guardianPhone: '03007654321',
      age: 12, gender: 'Male', country: 'Pakistan', whatsapp: '03009876543',
      email: STUDENT.email, password: STUDENT.password, course: state.course.name,
      timing: '18:00', days: ['Monday', 'Wednesday', 'Friday'], timezone: 'Asia/Karachi',
      message: 'Automated admission request.',
    },
  });
  check('admission request is accepted', apply.status === 201, JSON.stringify(apply.data).slice(0, 140));
  state.enrollmentId = apply.data.enrollment?.id;
  check('admission starts as Pending', apply.data.enrollment?.status === 'Pending');

  const duplicate = await api('POST', '/api/enrollments', {
    body: { studentName: 'E2E Student', email: STUDENT.email, course: state.course.name, timing: '18:00', days: ['Monday'] },
  });
  check('duplicate admission is blocked', duplicate.status === 409);

  const login = await api('POST', '/api/auth/login', { body: { email: STUDENT.email, password: STUDENT.password, role: 'student' } });
  check('student can sign in immediately', login.status === 200 && !!login.data.token);
  state.studentToken = login.data.token;

  const earlyPay = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: new Date().toISOString().slice(0, 10), reference: `EARLY${stamp}`, proof: tinyPng } });
  check('payment is blocked before approval', earlyPay.status === 400);

  const pending = await api('GET', '/api/admin/enrollments?status=Pending', { token: state.adminToken });
  check('admission appears in the admin queue', pending.data.enrollments?.some((e) => e.id === state.enrollmentId));

  const rejectNoReason = await api('POST', '/api/admin/enrollments/decision', { token: state.adminToken, body: { id: state.enrollmentId, decision: 'reject' } });
  check('rejection requires a reason', rejectNoReason.status === 400);

  const approve = await api('POST', '/api/admin/enrollments/decision', { token: state.adminToken, body: { id: state.enrollmentId, decision: 'approve', teacherEmail: TEACHER.email } });
  check('admission can be approved with a teacher', approve.status === 200 && approve.data.enrollment?.status === 'Approved', JSON.stringify(approve.data).slice(0, 140));
  check('teacher is recorded on the enrollment', approve.data.enrollment?.teacher === TEACHER.email);

  const notes = await api('GET', '/api/notifications', { token: state.studentToken });
  check('student was notified about the approval', notes.data.notifications?.some((n) => /approved/i.test(n.title)));
}

group('5. Classes, attendance and classroom access');
{
  const dash = await api('GET', '/api/teacher/dashboard', { token: state.teacherToken });
  check('teacher dashboard lists the new student', dash.status === 200 && dash.data.enrollments?.some((s) => s.email === STUDENT.email), JSON.stringify(dash.data).slice(0, 160));
  check('teacher dashboard counts assigned students', Number(dash.data.stats?.students) >= 1, JSON.stringify(dash.data.stats || {}));

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const schedule = await api('POST', '/api/classes', { token: state.teacherToken, body: { enrollmentId: state.enrollmentId, startsAt: `${tomorrow}T18:00`, endsAt: `${tomorrow}T19:00`, topic: 'Makharij revision' } });
  check('teacher can schedule a class', schedule.status === 201, JSON.stringify(schedule.data).slice(0, 140));
  state.classId = schedule.data.class?.id;
  check('class room name is generated server-side', /^SamadUlQuran-/.test(schedule.data.class?.room_name || ''));

  const badWindow = await api('POST', '/api/classes', { token: state.teacherToken, body: { enrollmentId: state.enrollmentId, startsAt: `${tomorrow}T18:00`, endsAt: `${tomorrow}T17:00` } });
  check('invalid class window is rejected', badWindow.status === 400);

  const join = await api('GET', `/api/classes/join?id=${state.classId}`, { token: state.studentToken });
  check('student can join their own class', join.status === 200 && /meet\.jit\.si/.test(join.data.url || ''), JSON.stringify(join.data).slice(0, 140));
  check('join returns the same room for both roles', join.data.room === schedule.data.class?.room_name);

  const foreign = await api('GET', '/api/classes/join?id=999999', { token: state.studentToken });
  check('joining an unknown class 404s', foreign.status === 404);

  const attendance = await api('POST', '/api/teacher/attendance', { token: state.teacherToken, body: { classId: state.classId, status: 'Present', notes: 'Attentive.' } });
  check('teacher can mark attendance', attendance.status === 200 && attendance.data.percentage === 100, JSON.stringify(attendance.data).slice(0, 120));

  const badStatus = await api('POST', '/api/teacher/attendance', { token: state.teacherToken, body: { classId: state.classId, status: 'Maybe' } });
  check('invalid attendance status is rejected', badStatus.status === 400);

  const studentAttendance = await api('GET', '/api/student/attendance', { token: state.studentToken });
  check('student sees their attendance record', studentAttendance.data.attendance?.length === 1 && studentAttendance.data.summary?.percentage === 100);
}

group('6. Messaging');
{
  const contacts = await api('GET', '/api/chat/contacts', { token: state.studentToken });
  check('student sees their assigned teacher as a contact', contacts.data.contacts?.some((c) => c.email === TEACHER.email));

  const send = await api('POST', '/api/chat', { token: state.studentToken, body: { with: TEACHER.email, message: 'Assalam-u-alaikum, I have a question about tomorrow\'s lesson.' } });
  check('student can message their teacher', send.status === 201, JSON.stringify(send.data).slice(0, 120));

  const reply = await api('POST', '/api/chat', { token: state.teacherToken, body: { with: STUDENT.email, message: 'Wa alaikum assalam, please revise Surah Al-Fatiha.' } });
  check('teacher can reply', reply.status === 201);

  const thread = await api('GET', `/api/chat?with=${encodeURIComponent(TEACHER.email)}`, { token: state.studentToken });
  check('conversation contains both messages', thread.data.messages?.length === 2);

  const outsider = await api('POST', '/api/chat', { token: state.studentToken, body: { with: 'someone.else@example.com', message: 'hello' } });
  check('messaging an unrelated user is blocked', outsider.status === 403);
}

group('7. Payments and verification');
{
  const options = await api('GET', '/api/student/payments', { token: state.studentToken });
  check('payment page lists enabled methods', options.data.methods?.length >= 1, JSON.stringify(options.data.methods || []).slice(0, 140));
  check('payment page shows the course fee', Number(options.data.fee) === Number(state.course.fee));
  check('current month is payable', options.data.payableMonths?.length >= 1);
  state.month = options.data.payableMonths?.[0]?.month;

  const today = new Date().toISOString().slice(0, 10);
  const wrongAmount = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: 1, paymentDate: today, reference: `WRONG${stamp}`, proof: tinyPng, billingMonth: state.month } });
  check('wrong fee amount is rejected', wrongAmount.status === 400);

  const noProof = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: today, reference: `NOPROOF${stamp}`, billingMonth: state.month } });
  check('bank transfer without proof is rejected', noProof.status === 400);

  const future = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: new Date(Date.now() + 172_800_000).toISOString().slice(0, 10), reference: `FUTURE${stamp}`, proof: tinyPng, billingMonth: state.month } });
  check('future payment date is rejected', future.status === 400);

  const submit = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: today, reference: `E2E${stamp}`, proof: tinyPng, billingMonth: state.month, note: 'Automated test transfer.' } });
  check('valid payment submission is accepted', submit.status === 201, JSON.stringify(submit.data).slice(0, 140));
  state.paymentId = submit.data.payment?.id;
  check('submitted payment starts as pending', submit.data.payment?.status === 'pending');

  const dup = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: today, reference: `E2E${stamp}`, proof: tinyPng, billingMonth: state.month } });
  check('a second submission for a pending month is blocked', dup.status === 409 || dup.status === 400, `${dup.status} ${JSON.stringify(dup.data).slice(0, 120)}`);

  const early = await api('GET', `/api/student/receipt?id=${state.paymentId}`, { token: state.studentToken });
  check('no receipt exists before verification', early.status === 404);

  const list = await api('GET', '/api/admin/payments?status=pending', { token: state.adminToken });
  const row = list.data.payments?.find((p) => p.id === state.paymentId);
  check('pending payment reaches the admin queue', !!row);
  check('payment list omits heavy proof data but flags it', row?.proof === undefined && !!row?.has_proof);

  const proof = await api('GET', `/api/admin/payments/proof?id=${state.paymentId}`, { token: state.adminToken });
  check('admin can open the payment proof', proof.status === 200 && String(proof.data.payment?.proof || '').startsWith('data:image/'));

  const rejectNoNote = await api('POST', '/api/admin/payments/verify', { token: state.adminToken, body: { id: state.paymentId, status: 'rejected' } });
  check('rejecting a payment requires a note', rejectNoNote.status === 400);

  const verify = await api('POST', '/api/admin/payments/verify', { token: state.adminToken, body: { id: state.paymentId, status: 'verified', note: 'Matched bank statement.' } });
  check('admin can verify the payment', verify.status === 200 && /^SUQ-\d{6}-\d{6}$/.test(verify.data.receipt_no || ''), verify.data.receipt_no);
  state.receiptNo = verify.data.receipt_no;

  const receipt = await api('GET', `/api/student/receipt?id=${state.paymentId}`, { token: state.studentToken });
  check('student can download the receipt after verification', receipt.status === 200 && receipt.data.receipt?.receipt_no === state.receiptNo);
  check('receipt never includes the proof blob', receipt.data.receipt?.proof === undefined);
  check('receipt shows the real IBAN', receipt.data.academy?.iban === 'PK31NAYA1234503227589462');

  const reverse = await api('POST', '/api/admin/payments/verify', { token: state.adminToken, body: { id: state.paymentId, status: 'pending' } });
  check('verified payments cannot be silently reversed', reverse.status === 409);

  const me = await api('GET', '/api/me', { token: state.studentToken });
  check('billing status flips to paid', me.data.billing?.status === 'paid', JSON.stringify(me.data.billing || {}).slice(0, 160));

  const repeat = await api('POST', '/api/payments', { token: state.studentToken, body: { method: 'bank', amount: state.course.fee, paymentDate: today, reference: `AGAIN${stamp}`, proof: tinyPng, billingMonth: state.month } });
  check('paying an already settled month is blocked', repeat.status === 400);
}

group('8. Billing lifecycle (due → grace → suspension → reactivation)');
{
  const settings = await api('GET', '/api/admin/settings', { token: state.adminToken });
  state.originalDays = {
    due_day: settings.data.settings?.due_day,
    grace_end_day: settings.data.settings?.grace_end_day,
    suspend_day: settings.data.settings?.suspend_day,
  };
  check('billing rules are stored server-side', String(state.originalDays.due_day) === '5' && String(state.originalDays.suspend_day) === '9', JSON.stringify(state.originalDays));

  const badOrder = await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: { due_day: 20, grace_end_day: 8, suspend_day: 9 } });
  check('illogical billing days are rejected', badOrder.status === 400, JSON.stringify(badOrder.data).slice(0, 120));

  // Simulate "today is past the suspension day" by moving the rule days behind today.
  const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', day: 'numeric' }).format(new Date()));
  if (day >= 4) {
    await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: { due_day: 1, grace_end_day: 2, suspend_day: 3 } });

    // A settled month must never suspend the student.
    let run = await api('POST', '/api/admin/billing/run', { token: state.adminToken });
    check('billing pass runs', run.status === 200, JSON.stringify(run.data).slice(0, 120));
    let student = (await api('GET', `/api/admin/students?q=${encodeURIComponent(STUDENT.email)}`, { token: state.adminToken })).data.students?.[0];
    check('a paid student is never suspended', student?.account_status === 'active', student?.account_status);
    state.studentId = student?.id;

    // Now make the month unpaid by rejecting the verified payment at database level is not allowed;
    // instead test suspension on a second, unpaid student.
    const other = { email: `e2e.unpaid.${stamp}@example.com`, password: 'UnpaidPass123' };
    const created = await api('POST', '/api/admin/students', {
      token: state.adminToken,
      body: { name: 'E2E Unpaid Student', email: other.email, password: other.password, phone: '03005551234', course: state.course.name, teacherEmail: TEACHER.email, timing: '17:00', days: 'Tuesday, Thursday' },
    });
    check('admin can create a student with an enrollment', created.status === 201, JSON.stringify(created.data).slice(0, 140));

    run = await api('POST', '/api/admin/billing/run', { token: state.adminToken });
    check('billing pass suspends the unpaid student', (run.data.summary?.suspended || 0) >= 1, JSON.stringify(run.data.summary));

    const otherLogin = await api('POST', '/api/auth/login', { body: { email: other.email, password: other.password, role: 'student' } });
    check('a suspended student can still sign in', otherLogin.status === 200);
    const otherToken = otherLogin.data.token;

    const otherMe = await api('GET', '/api/me', { token: otherToken });
    check('suspended state is reported to the student', otherMe.data.user?.account_status === 'suspended' && otherMe.data.billing?.status === 'suspended', JSON.stringify(otherMe.data.billing || {}).slice(0, 140));

    const otherEnrollment = (await api('GET', '/api/teacher/dashboard', { token: state.teacherToken }))
      .data.enrollments?.find((e) => String(e.email).toLowerCase() === other.email);
    check('admin-created student is assigned to the teacher', !!otherEnrollment);
    const otherClass = await api('POST', '/api/classes', { token: state.teacherToken, body: { enrollmentId: otherEnrollment?.id, startsAt: `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T17:00` } });
    if (otherClass.status === 201) {
      const blocked = await api('GET', `/api/classes/join?id=${otherClass.data.class.id}`, { token: otherToken });
      check('suspended student is blocked from the classroom', blocked.status === 403, JSON.stringify(blocked.data).slice(0, 160));
      const chatBlocked = await api('POST', '/api/chat', { token: otherToken, body: { with: TEACHER.email, message: 'test' } });
      check('suspended student is blocked from chat', chatBlocked.status === 403);
    } else {
      check('scheduling for the suspended student succeeded', false, JSON.stringify(otherClass.data).slice(0, 160));
    }

    const canStillPay = await api('GET', '/api/student/payments', { token: otherToken });
    check('suspended student can still open the payment page', canStillPay.status === 200 && canStillPay.data.payableMonths?.length >= 1);

    const payment = await api('POST', '/api/payments', {
      token: otherToken,
      body: { method: 'easypaisa', amount: state.course.fee, paymentDate: new Date().toISOString().slice(0, 10), reference: `SUSP${stamp}`, proof: tinyPng },
    });
    check('suspended student can submit a payment', payment.status === 201, JSON.stringify(payment.data).slice(0, 140));

    const stillSuspended = (await api('GET', `/api/admin/students?q=${encodeURIComponent(other.email)}`, { token: state.adminToken })).data.students?.[0];
    check('submitting a payment alone does not reactivate', stillSuspended?.account_status === 'suspended');

    const verified = await api('POST', '/api/admin/payments/verify', { token: state.adminToken, body: { id: payment.data.payment.id, status: 'verified', note: 'Easypaisa confirmed.' } });
    check('verification succeeds', verified.status === 200 && !!verified.data.receipt_no);

    const reactivated = (await api('GET', `/api/admin/students?q=${encodeURIComponent(other.email)}`, { token: state.adminToken })).data.students?.[0];
    check('verification reactivates the account automatically', reactivated?.account_status === 'active', reactivated?.account_status);

    const history = await api('GET', `/api/admin/students/detail?id=${reactivated?.id}`, { token: state.adminToken });
    check('history survives suspension (enrollment intact)', history.data.enrollments?.length >= 1);
    check('history survives suspension (payment intact)', history.data.payments?.length >= 1);

    // restore configured rules
    await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: state.originalDays });
    const restored = await api('GET', '/api/admin/settings', { token: state.adminToken });
    check('billing days are restored after the test', String(restored.data.settings?.suspend_day) === '9');
  } else {
    console.log('  --   suspension simulation skipped (early in the month)');
  }
}

group('9. Admin console: content, settings, finance, audit');
{
  const overview = await api('GET', '/api/admin/overview', { adminKey: true });
  check('overview works with the X-Admin-Key header too', overview.status === 200 && overview.data.counts?.students >= 1);
  check('overview reports pending payments count', typeof overview.data.counts?.pendingPayments === 'number');
  check('overview includes a revenue trend', Array.isArray(overview.data.revenueTrend));

  const badIban = await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: { academy_iban: 'PK00WRONG0000000000000000' } });
  check('invalid IBAN is rejected by checksum', badIban.status === 400, JSON.stringify(badIban.data).slice(0, 120));

  // Capture the real values first so the test never leaves invented business
  // details (a fake bank or a fake social URL) behind in the live settings.
  const beforeSettings = await api('GET', '/api/admin/settings', { token: state.adminToken });
  const originalBusiness = {
    bank_name: beforeSettings.data.settings?.bank_name ?? '',
    facebook_url: beforeSettings.data.settings?.facebook_url ?? '',
  };
  const goodSettings = await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: { bank_name: 'Test Bank Ltd', facebook_url: 'https://facebook.com/example-academy' } });
  check('admin can save configurable business info', goodSettings.status === 200 && goodSettings.data.settings?.bank_name === 'Test Bank Ltd');
  const restoredBusiness = await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: originalBusiness });
  check('test settings are rolled back, leaving no invented business details',
    restoredBusiness.status === 200
    && (restoredBusiness.data.settings?.bank_name ?? '') === originalBusiness.bank_name
    && (restoredBusiness.data.settings?.facebook_url ?? '') === originalBusiness.facebook_url);

  const secretAttempt = await api('PATCH', '/api/admin/settings', { token: state.adminToken, body: { admin_key: 'hijack' } });
  check('admin key cannot be written through settings', secretAttempt.status === 200 && secretAttempt.data.settings?.admin_key === undefined);

  const config = await api('GET', '/api/admin/config-status', { token: state.adminToken });
  check('config status reports required credentials', Array.isArray(config.data.config?.settings) && Array.isArray(config.data.config?.gateways));
  check('unconfigured gateways are reported, not faked', config.data.config?.gateways?.every((g) => g.configured === false || Array.isArray(g.missing)));

  const gallery = await api('POST', '/api/admin/gallery', { token: state.adminToken, body: { title: 'E2E Gallery Item', caption: 'Uploaded by the test suite', image: 'assets/img/gallery-1.webp' } });
  check('admin can add a gallery item', gallery.status === 201, JSON.stringify(gallery.data).slice(0, 120));
  const publicGallery = await api('GET', '/api/public/gallery');
  check('gallery item appears publicly', publicGallery.data.items?.some((g) => g.title === 'E2E Gallery Item'));
  const galleryPatch = await api('PATCH', '/api/admin/gallery', { token: state.adminToken, body: { id: gallery.data.item.id, title: 'E2E Gallery Renamed' } });
  check('admin can edit a gallery item', galleryPatch.status === 200);
  const galleryDelete = await api('DELETE', `/api/admin/gallery?id=${gallery.data.item.id}`, { token: state.adminToken });
  check('admin can delete a gallery item', galleryDelete.status === 200);

  const testimonial = await api('POST', '/api/admin/testimonials', { token: state.adminToken, body: { name: 'E2E Parent', role: 'Parent of a Hifz student', body: 'The academy is excellent, alhamdulillah.', rating: 5 } });
  check('admin can add a testimonial', testimonial.status === 201);
  const publicTestimonials = await api('GET', '/api/public/testimonials');
  check('testimonial appears publicly', publicTestimonials.data.items?.some((t) => t.name === 'E2E Parent'));
  await api('DELETE', `/api/admin/testimonials?id=${testimonial.data.item.id}`, { token: state.adminToken });

  const course = await api('PATCH', '/api/admin/courses', { token: state.adminToken, body: { id: state.course.id, description: 'Updated by the automated test suite.' } });
  check('admin can edit a course', course.status === 200);
  const badFee = await api('PATCH', '/api/admin/courses', { token: state.adminToken, body: { id: state.course.id, fee: -100 } });
  check('negative course fee is rejected', badFee.status === 400);

  const methods = await api('PATCH', '/api/admin/payment-methods', { token: state.adminToken, body: { code: 'jazzcash', enabled: 1, instructions: 'Send to the JazzCash number shown above.' } });
  check('admin can configure a payment method', methods.status === 200);

  const notice = await api('POST', '/api/admin/notifications', { token: state.adminToken, body: { title: 'Academy announcement', body: 'Classes resume after Eid, in sha Allah.', role: 'student' } });
  check('admin can broadcast a notification', notice.status === 200 && notice.data.count >= 1);
  const studentNotes = await api('GET', '/api/notifications', { token: state.studentToken });
  check('broadcast reaches the student', studentNotes.data.notifications?.some((n) => n.title === 'Academy announcement'));

  const finance = await api('GET', '/api/admin/finance', { token: state.adminToken });
  check('finance dashboard reports verified revenue', Number(finance.data.totals?.verified) >= Number(state.course.fee), JSON.stringify(finance.data.totals || {}).slice(0, 160));
  check('finance dashboard breaks revenue down by method', Array.isArray(finance.data.byMethod) && finance.data.byMethod.length >= 1);

  const attendanceReport = await api('GET', '/api/admin/attendance', { token: state.adminToken });
  check('attendance report aggregates per student', attendanceReport.data.byStudent?.some((r) => r.student_email === STUDENT.email));

  const chatOversight = await api('GET', `/api/admin/chat?student=${encodeURIComponent(STUDENT.email)}&teacher=${encodeURIComponent(TEACHER.email)}`, { token: state.adminToken });
  check('admin can review a conversation', chatOversight.data.messages?.length === 2);

  const audit = await api('GET', '/api/admin/audit', { token: state.adminToken });
  check('audit log records the payment verification', audit.data.logs?.some((l) => l.action === 'payment_verified'));
  check('audit log records the admission approval', audit.data.logs?.some((l) => l.action === 'enrollment_approved'));

  const messages = await api('GET', '/api/admin/messages', { token: state.adminToken });
  check('contact form submissions are visible to admin', messages.data.messages?.some((m) => m.name === 'E2E Visitor'));

  const suspend = await api('PATCH', '/api/admin/students/status', { token: state.adminToken, body: { id: state.studentId, action: 'suspend', reason: 'Manual test suspension.' } });
  check('admin can suspend a student manually', suspend.status === 200 && suspend.data.student?.account_status === 'suspended');
  const reactivate = await api('PATCH', '/api/admin/students/status', { token: state.adminToken, body: { id: state.studentId, action: 'activate' } });
  check('admin can reactivate a student', reactivate.status === 200 && reactivate.data.student?.account_status === 'active');

  const teacherWithStudents = await api('GET', '/api/admin/teachers', { token: state.adminToken });
  const t = teacherWithStudents.data.teachers?.find((x) => x.email === TEACHER.email);
  check('teacher list shows assigned student counts', Number(t?.students) >= 1);
  const deactivate = await api('PATCH', '/api/admin/teachers/status', { token: state.adminToken, body: { id: t?.id, active: 0 } });
  check('teacher with active students cannot be deactivated', deactivate.status === 409, JSON.stringify(deactivate.data).slice(0, 140));

  const unknown = await api('GET', '/api/admin/does-not-exist', { token: state.adminToken });
  check('unknown API endpoints return a clean 404', unknown.status === 404 && !!unknown.data.error);
}

group('10. Static site delivery and security headers');
{
  const res = await fetch(`${BASE}/`);
  const csp = res.headers.get('content-security-policy') || '';
  check('site root is served', res.status === 200 || res.status === 404, String(res.status));
  check('CSP blocks inline scripts', /script-src 'self'/.test(csp) && !/unsafe-inline'[^;]*script/.test(csp), csp.slice(0, 120));
  check('nosniff header is present', res.headers.get('x-content-type-options') === 'nosniff');
  check('Jitsi is the only allowed frame source', /frame-src https:\/\/meet\.jit\.si/.test(csp));

  const traversal = await fetch(`${BASE}/../server/.env`);
  check('path traversal is refused', traversal.status !== 200 || !(await traversal.text()).includes('ADMIN_KEY'));
}

console.log(`\n${'-'.repeat(60)}`);
console.log(`${pass} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  • ${f}`);
  process.exit(1);
}
console.log('All end-to-end checks passed.');
