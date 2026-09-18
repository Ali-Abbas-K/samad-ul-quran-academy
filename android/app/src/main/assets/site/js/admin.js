/* =============================================================================
   admin.js — administrator console: overview, students, teachers, admissions,
   classes, attendance, payments, finance, content, settings, audit trail.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, esc, money, icon, badge, avatar, toast, modal, closeModal, confirmDialog,
  setLoading, formValues, clearFieldErrors, fieldError, fmtDate, fmtDateTime, fmtDay,
  fmtTime, relTime, monthLabel, emptyState, errorState, skeletonRows, registerPage,
  pkNow, qs,
} = window.SUQ;
const { lineChart, barChart, donutChart, hBars } = window.SUQCharts;
const { initPortal, setUnread } = window.SUQPortal;

const A = { courses: [], teachers: [], currency: 'PKR' };

/* Audit rows store `details` as free text for some actions and as a JSON blob
   for others. Rendering the raw blob leaked things like
   `{"count":4,"title":"Academy announcement"}` into the console, so flatten
   any JSON into readable "Label: value" pairs before display. */
function auditDetails(raw, limit = 200) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return '';
  if (!/^[[{]/.test(text)) return text.slice(0, limit);
  let parsed;
  try { parsed = JSON.parse(text); } catch { return text.slice(0, limit); }
  const label = (k) => String(k).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const value = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.map(value).join(', ');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${label(k)}: ${value(x)}`).join(', ');
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return String(v);
  };
  const out = Array.isArray(parsed)
    ? parsed.map(value).join('; ')
    : Object.entries(parsed).map(([k, v]) => `${label(k)}: ${value(v)}`).join(' · ');
  return out.slice(0, limit);
}

function tone(status) {
  const s = String(status || '');
  if (/^(Verified|Approved|Active|Present|completed)$/i.test(s)) return 'success';
  if (/^(Pending|Late|grace|due|scheduled|upcoming)$/i.test(s)) return 'warning';
  if (/^(Rejected|Overdue|Absent|suspended|cancelled)$/i.test(s)) return 'danger';
  return 'info';
}

function toolbarValue(id) {
  const el = document.querySelector(id);
  return el ? el.value.trim() : '';
}

function qsParams(pairs) {
  const p = new URLSearchParams();
  Object.entries(pairs).forEach(([k, v]) => { if (v) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Loads reference lists (courses + teachers) once per page for the pickers. */
async function loadRefs() {
  if (A.teachers.length && A.courses.length) return A;
  try {
    const [tRes, cRes] = await Promise.all([api.get('/admin/teachers'), api.get('/courses')]);
    A.teachers = tRes.teachers || [];
    A.courses = cRes.courses || [];
    A.currency = cRes.currency || 'PKR';
  } catch (err) {
    toast(`Reference data could not be loaded: ${err.message}`, 'error');
  }
  return A;
}

function teacherOptions(selected) {
  return ['<option value="">Not assigned</option>']
    .concat(A.teachers.filter((t) => t.active).map((t) => `<option value="${esc(t.email)}"${t.email === selected ? ' selected' : ''}>${esc(t.name)} (${Number(t.students || 0)} students)</option>`))
    .join('');
}

function courseOptions(selected) {
  return ['<option value="">Choose a course</option>']
    .concat(A.courses.map((c) => `<option value="${esc(c.name)}"${c.name === selected ? ' selected' : ''}>${esc(c.name)} — ${esc(money(c.fee, A.currency))}</option>`))
    .join('');
}

/* ========================================================== overview ==== */

registerPage('admin', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#overview');
  host.innerHTML = skeletonRows(6);
  await renderOverview(host);
});

async function renderOverview(host) {
  try {
    const d = await api.get('/admin/overview');
    A.currency = d.settings?.currency || d.settings?.academy?.currency || 'PKR';
    const c = d.counts || {};
    const att = d.attendanceOverview || {};
    const trend = (d.revenueTrend || []).map((r) => ({ label: monthLabel(r.month).slice(0, 3), value: Number(r.total || 0) }));

    let configWarning = '';
    try {
      const { config } = await api.get('/admin/config-status');
      const missing = (config.settings || []).filter((s) => !s.configured);
      const gateways = (config.gateways || []).filter((g) => !g.configured);
      if (missing.length || gateways.length) {
        configWarning = `<div class="alert alert-warning">${icon('alert')}<div>
          <strong>Configuration still needed</strong>
          ${missing.length ? `<p>These details are not set yet, so they are hidden from students instead of being invented: ${missing.map((m) => esc(m.label)).join(', ')}.</p>` : ''}
          ${gateways.length ? `<p>Automatic ${gateways.map((g) => esc(g.label)).join(' and ')} checkout is not configured. The manual payment-proof workflow with your verification is used instead.</p>` : ''}
          <a class="btn btn-sm btn-outline mt-2" href="admin-settings.html">Open settings</a></div></div>`;
      }
    } catch { /* config status is advisory only */ }

    host.innerHTML = `
      ${configWarning}
      <div class="stat-grid">
        ${[
          { label: 'Active students', value: c.activeStudents, sub: `${Number(c.students || 0)} total · ${Number(c.suspendedStudents || 0)} suspended`, icon: 'users' },
          { label: 'Teachers', value: c.teachers, sub: `${Number(c.courses || 0)} courses offered`, icon: 'user' },
          { label: `${esc(d.monthLabel || '')} revenue`, value: money(c.monthlyRevenue, A.currency), sub: `${money(c.pendingAmount, A.currency)} awaiting verification`, icon: 'wallet' },
          { label: 'Pending payments', value: c.pendingPayments, sub: `${Number(c.admissions || 0)} admissions to review`, icon: 'clock' },
        ].map((s) => `<article class="stat-card"><span class="icon-badge">${icon(s.icon)}</span>
          <div><small>${s.label}</small><strong>${esc(String(s.value ?? 0))}</strong>
          <span class="tiny muted">${esc(s.sub)}</span></div></article>`).join('')}
      </div>

      <div class="panel-grid">
        <section class="panel panel-wide"><header class="panel-head"><h2>Verified revenue, last 12 months</h2>
          <a class="link-arrow" href="admin-finance.html">Finance ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body">${lineChart(trend, { currency: A.currency, title: 'Verified revenue by month' })}</div></section>

        <section class="panel"><header class="panel-head"><h2>Attendance this month</h2></header>
          <div class="panel-body">${donutChart([
            { label: 'Present', value: att.Present || 0, color: 'var(--green-600)' },
            { label: 'Late', value: att.Late || 0, color: 'var(--gold-600)' },
            { label: 'Leave', value: att.Leave || 0, color: 'var(--blue-500)' },
            { label: 'Absent', value: att.Absent || 0, color: 'var(--red-600)' },
          ], { centerValue: String(Object.values(att).reduce((a, b) => a + Number(b || 0), 0)), centerLabel: 'marked', emptyText: 'No attendance yet' })}</div></section>

        <section class="panel"><header class="panel-head"><h2>Pending admissions</h2>
          <a class="link-arrow" href="admin-admissions.html">All ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><ul class="list-rows">${(d.pendingAdmissions || []).slice(0, 6).map((e) => `<li class="list-row">
            <div class="row-main"><strong>${esc(e.student_name)}</strong>
              <span class="tiny muted">${esc(e.course)} · ${esc(e.timing || 'timing not set')} · ${esc(relTime(e.created_at))}</span></div>
            <div class="row-actions">
              <button type="button" class="btn btn-sm btn-primary" data-decide="approve" data-enrollment="${e.id}">Approve</button>
              <button type="button" class="btn btn-sm btn-ghost" data-decide="reject" data-enrollment="${e.id}">Reject</button>
            </div></li>`).join('') || `<li>${emptyState('No admissions waiting', 'New admission forms will appear here for review.')}</li>`}</ul></div></section>

        <section class="panel"><header class="panel-head"><h2>Payments to verify</h2>
          <a class="link-arrow" href="admin-payments.html">All ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><ul class="list-rows">${(d.pendingPaymentList || []).slice(0, 6).map((p) => `<li class="list-row">
            <div class="row-main"><strong>${esc(p.student_name || p.email)}</strong>
              <span class="tiny muted">${esc(money(p.amount, A.currency))} · ${esc(monthLabel(p.billing_month))} · ${esc(p.method_label || p.method)}</span></div>
            <button type="button" class="btn btn-sm btn-outline" data-open-payment="${p.id}">Review</button></li>`).join('')
            || `<li>${emptyState('Nothing to verify', 'Submitted fee payments will appear here.')}</li>`}</ul></div></section>

        <section class="panel"><header class="panel-head"><h2>Upcoming classes</h2>
          <a class="link-arrow" href="admin-classes.html">Timetable ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><ul class="list-rows">${(d.upcomingClasses || []).slice(0, 6).map((k) => `<li class="list-row">
            <span class="row-date"><strong>${esc(fmtDay(k.starts_at))}</strong><small>${esc(fmtTime(k.starts_at))}</small></span>
            <div class="row-main"><strong>${esc(k.student_name || '')}</strong>
              <span class="tiny muted">${esc(k.teacher_name || 'Unassigned')} · ${esc(k.course || '')}</span></div>
            <span class="badge badge-${tone(k.status)}">${esc(k.status)}</span></li>`).join('')
            || `<li>${emptyState('No classes scheduled', 'Scheduled classes appear here.')}</li>`}</ul></div></section>

        <section class="panel"><header class="panel-head"><h2>Recent activity</h2>
          <a class="link-arrow" href="admin-audit.html">Audit trail ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><ul class="timeline">${(d.recentActivity || []).slice(0, 10).map((l) => `<li>
            <span class="tl-dot"></span><div><strong>${esc(String(l.action || '').replace(/_/g, ' '))}</strong>
            <p class="tiny muted">${esc(l.actor || '')} · ${esc(relTime(l.created_at))}</p>
            ${auditDetails(l.details, 160) ? `<p class="tiny">${esc(auditDetails(l.details, 160))}</p>` : ''}</div></li>`).join('')
            || `<li class="muted tiny">No activity recorded yet.</li>`}</ul></div></section>
      </div>`;
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
}

/* ========================================================== students === */

registerPage('admin-students', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  await loadRefs();
  const host = document.querySelector('#students');
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const { students } = await api.get(`/admin/students${qsParams({ q: toolbarValue('#stu-q'), status: toolbarValue('#stu-status') })}`);
      host.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Student</th><th>Course</th><th>Teacher</th><th>Fee status</th><th>Account</th><th class="ta-right">Actions</th></tr></thead>
        <tbody>${students.length ? students.map((s) => `<tr>
          <td><div class="cell-user">${avatar(s.name, s.avatar)}<div><strong>${esc(s.name)}</strong>
            <span class="tiny muted">${esc(s.email)}${s.phone ? ` · ${esc(s.phone)}` : ''}</span></div></div></td>
          <td>${esc(s.course || '—')}<span class="tiny muted block">${esc(s.enrollment_status || '')}</span></td>
          <td>${esc(s.teacher_name || s.teacher || '—')}</td>
          <td>${badge(s.billing?.status || '—')}<span class="tiny muted block">${esc(money(s.billing?.remaining ?? 0, A.currency))} remaining</span></td>
          <td>${s.active ? badge('Active') : badge('Inactive')}${s.suspended ? badge('Suspended') : ''}</td>
          <td class="ta-right"><div class="row-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-student-view="${s.id}">Record</button>
            <button type="button" class="btn btn-sm btn-outline" data-student-edit="${s.id}">Edit</button>
            <button type="button" class="btn btn-sm btn-ghost" data-student-status="${s.id}" data-active="${s.active ? 1 : 0}">${s.active ? 'Suspend' : 'Activate'}</button>
            <button type="button" class="btn btn-sm btn-ghost" data-student-password="${s.id}" data-name="${esc(s.name)}">Password</button>
          </div></td></tr>`).join('')
          : `<tr><td colspan="6">${emptyState('No students found', 'Adjust the search, or add a student manually.')}</td></tr>`}
        </tbody></table></div>`;
      window.__students = students;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  document.querySelector('#stu-q')?.addEventListener('input', debounce(load, 350));
  document.querySelector('#stu-status')?.addEventListener('change', load);
  document.querySelector('[data-add-student]')?.addEventListener('click', () => openStudentForm(null, load));
  document.addEventListener('click', async (e) => {
    const view = e.target.closest('[data-student-view]');
    if (view) { openStudentRecord(view.dataset.studentView); return; }
    const edit = e.target.closest('[data-student-edit]');
    if (edit) {
      const s = (window.__students || []).find((x) => String(x.id) === edit.dataset.studentEdit);
      openStudentForm(s, load);
      return;
    }
    const st = e.target.closest('[data-student-status]');
    if (st) { await changeStudentStatus(st, load); return; }
    const pw = e.target.closest('[data-student-password]');
    if (pw) openResetPassword('student', pw.dataset.studentPassword, pw.dataset.name);
  });
  await load();
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function openStudentForm(student, reload) {
  const isNew = !student;
  modal({
    title: isNew ? 'Add a student' : 'Edit student',
    subtitle: isNew ? 'Creates the login account and, optionally, the first enrollment.' : esc(student.email),
    body: `<form id="stu-form" class="stack" novalidate>
      <div class="grid grid-cols-2">
        <div class="field"><label for="sf-name">Full name <span class="req">*</span></label>
          <input class="input" id="sf-name" name="name" required maxlength="120" value="${esc(student?.name || '')}"><span class="error-text"></span></div>
        <div class="field"><label for="sf-phone">Phone</label>
          <input class="input" id="sf-phone" name="phone" maxlength="40" value="${esc(student?.phone || '')}"></div>
      </div>
      ${isNew ? `<div class="grid grid-cols-2">
        <div class="field"><label for="sf-email">Email <span class="req">*</span></label>
          <input class="input" id="sf-email" name="email" type="email" required><span class="error-text"></span></div>
        <div class="field"><label for="sf-pass">Temporary password <span class="req">*</span></label>
          <div class="input-wrap"><input class="input" id="sf-pass" name="password" type="password" required minlength="8">
          <button type="button" class="password-toggle" aria-label="Show password">${icon('eye')}</button></div>
          <span class="help">At least 8 characters. Share it privately with the student.</span><span class="error-text"></span></div>
      </div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="sf-course">Course</label><select class="select" id="sf-course" name="course">${courseOptions('')}</select></div>
        <div class="field"><label for="sf-teacher">Assign teacher</label><select class="select" id="sf-teacher" name="teacherEmail">${teacherOptions('')}</select></div>
      </div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="sf-timing">Preferred timing</label>
          <input class="input" id="sf-timing" name="timing" maxlength="60" placeholder="e.g. 6:00 PM PKT"></div>
        <div class="field"><label for="sf-days">Class days</label>
          <input class="input" id="sf-days" name="days" maxlength="120" placeholder="Monday, Tuesday, Wednesday"></div>
      </div>
      <div class="field"><label for="sf-guardian">Guardian name</label>
        <input class="input" id="sf-guardian" name="guardianName" maxlength="120">
        <span class="help">Required for students under 18.</span></div>` : ''}
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-stu-save>${isNew ? 'Create student' : 'Save changes'}</button>`,
    onMount(box) {
      box.querySelector('[data-stu-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#stu-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.name?.trim()) { fieldError(form.elements.name, 'Name is required.'); return; }
        if (isNew) {
          if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.email || '')) { fieldError(form.elements.email, 'Enter a valid email.'); return; }
          if ((v.password || '').length < 8) { fieldError(form.elements.password, 'Use at least 8 characters.'); return; }
        }
        setLoading(ev.currentTarget, true);
        try {
          if (isNew) await api.post('/admin/students', v);
          else await api.patch('/admin/students', { id: student.id, name: v.name, phone: v.phone });
          closeModal();
          toast(isNew ? 'Student created.' : 'Student updated.', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

async function changeStudentStatus(btn, reload) {
  const isActive = btn.dataset.active === '1';
  const res = await confirmDialog({
    title: isActive ? 'Suspend this student?' : 'Activate this student?',
    message: isActive
      ? 'Suspension pauses classroom access and messaging. Nothing is deleted — enrollment, attendance, payments and course history all remain, and access returns as soon as the fee is verified.'
      : 'The student regains classroom and messaging access immediately.',
    confirmLabel: isActive ? 'Suspend student' : 'Activate student',
    tone: isActive ? 'danger' : 'primary',
    requireNote: isActive,
    notePlaceholder: 'Reason recorded in the audit trail',
  });
  if (!res.ok) return;
  try {
    await api.patch('/admin/students/status', {
      id: Number(btn.dataset.studentStatus),
      action: isActive ? 'suspend' : 'activate',
      reason: res.note,
    });
    toast(isActive ? 'Student suspended.' : 'Student activated.', 'success');
    reload();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openResetPassword(kind, id, name) {
  modal({
    title: 'Set a new password',
    subtitle: name || '',
    body: `<form id="rp-form" class="stack" novalidate>
      <div class="field"><label for="rp-pass">New password <span class="req">*</span></label>
        <div class="input-wrap"><input class="input" id="rp-pass" name="password" type="password" required minlength="8">
        <button type="button" class="password-toggle" aria-label="Show password">${icon('eye')}</button></div>
        <span class="help">At least 8 characters. Share it with the account holder privately and ask them to change it.</span>
        <span class="error-text"></span></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-rp-save>Update password</button>`,
    onMount(box) {
      box.querySelector('[data-rp-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#rp-form');
        const v = formValues(form);
        if ((v.password || '').length < 8) { fieldError(form.elements.password, 'Use at least 8 characters.'); return; }
        setLoading(ev.currentTarget, true);
        try {
          await api.post(`/admin/${kind === 'teacher' ? 'teachers' : 'students'}/password`, { id: Number(id), password: v.password });
          closeModal();
          toast('Password updated.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

async function openStudentRecord(id) {
  const box = modal({ title: 'Student record', wide: true, body: skeletonRows(5) });
  try {
    const d = await api.get(`/admin/students/detail?id=${encodeURIComponent(id)}`);
    const s = d.student || {};
    const b = d.billing || {};
    box.querySelector('.modal-body').innerHTML = `
      <div class="detail-head">${avatar(s.name, s.avatar, 'avatar-lg')}
        <div><h3>${esc(s.name || '')}</h3><p class="tiny muted">${esc(s.email || '')}${s.phone ? ` · ${esc(s.phone)}` : ''}</p>
        ${badge(s.active ? 'Active' : 'Inactive')} ${badge(b.status || '—')}</div></div>
      <dl class="kv kv-3 mt-4">
        <div><dt>Monthly fee</dt><dd>${esc(money(b.fee, A.currency))}</dd></div>
        <div><dt>Paid this month</dt><dd>${esc(money(b.paid, A.currency))}</dd></div>
        <div><dt>Remaining</dt><dd>${esc(money(b.remaining, A.currency))}</dd></div>
        <div><dt>Awaiting verification</dt><dd>${esc(money(b.pending, A.currency))}</dd></div>
        <div><dt>Arrears</dt><dd>${(b.arrears || []).map((m) => esc(m.label || monthLabel(m.month))).join(', ') || 'None'}</dd></div>
        <div><dt>Joined</dt><dd>${esc(fmtDate(s.created_at))}</dd></div>
      </dl>
      <div class="tabs" data-tabs="rec">
        ${['Enrollments', 'Classes', 'Attendance', 'Payments', 'History'].map((t, i) => `
          <button type="button" class="tab" data-tab="${t.toLowerCase()}" aria-selected="${i === 0}">${t}</button>`).join('')}
      </div>
      ${['enrollments', 'classes', 'attendance', 'payments', 'history'].map((key, i) => `
        <div data-tab-panel="${key}" data-scope="rec"${i === 0 ? '' : ' hidden'}>${recordPanel(key, d)}</div>`).join('')}`;
    box.querySelector('.modal').insertAdjacentHTML('beforeend', `<div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-modal-close>Close</button></div>`);
    // Tab wiring for dynamically injected tabs.
    box.querySelector('[data-tabs]').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      box.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      box.querySelectorAll('[data-tab-panel]').forEach((p) => { p.hidden = p.dataset.tabPanel !== tab.dataset.tab; });
    });
  } catch (err) {
    box.querySelector('.modal-body').innerHTML = errorState(err.message);
  }
}

function recordPanel(key, d) {
  if (key === 'enrollments') {
    return `<ul class="list-rows">${(d.enrollments || []).map((e) => `<li class="list-row">
      <div class="row-main"><strong>${esc(e.course)}</strong>
        <span class="tiny muted">${esc(e.teacher_name || e.teacher || 'Unassigned')} · ${esc(e.timing || '')} · ${esc(e.days || '')}</span></div>
      <span class="tiny muted">${Number(e.progress || 0)}%</span>${badge(e.status)}</li>`).join('')
      || '<li class="muted tiny">No enrollments.</li>'}</ul>`;
  }
  if (key === 'classes') {
    return `<ul class="list-rows">${(d.classes || []).slice(0, 20).map((c) => `<li class="list-row">
      <span class="row-date"><strong>${esc(fmtDay(c.starts_at))}</strong><small>${esc(fmtTime(c.starts_at))}</small></span>
      <div class="row-main"><strong>${esc(c.topic || 'Class')}</strong><span class="tiny muted">${esc(c.teacher_name || '')}</span></div>
      ${badge(c.status)}</li>`).join('') || '<li class="muted tiny">No classes recorded.</li>'}</ul>`;
  }
  if (key === 'attendance') {
    return `<ul class="list-rows">${(d.attendance || []).slice(0, 30).map((a) => `<li class="list-row">
      <span class="row-date"><strong>${esc(fmtDate(a.date || a.created_at))}</strong></span>
      <div class="row-main"><span class="tiny muted">${esc(a.notes || '')}</span></div>${badge(a.status)}</li>`).join('')
      || '<li class="muted tiny">No attendance marked.</li>'}</ul>`;
  }
  if (key === 'payments') {
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt</th></tr></thead>
      <tbody>${(d.payments || []).map((p) => `<tr><td>${esc(monthLabel(p.billing_month))}</td>
        <td>${esc(money(p.amount, A.currency))}</td><td>${esc(p.method_label || p.method)}</td>
        <td>${badge(p.status)}</td><td class="mono">${esc(p.receipt_no || '—')}</td></tr>`).join('')
        || `<tr><td colspan="5" class="muted tiny">No payments recorded.</td></tr>`}</tbody></table></div>`;
  }
  return `<ul class="timeline">${(d.history || []).slice(0, 40).map((h) => `<li><span class="tl-dot"></span>
    <div><strong>${esc(String(h.action || '').replace(/_/g, ' '))}</strong>
    <p class="tiny muted">${esc(h.actor || '')} · ${esc(fmtDateTime(h.created_at))}</p>
    ${auditDetails(h.details, 200) ? `<p class="tiny">${esc(auditDetails(h.details, 200))}</p>` : ''}</div></li>`).join('')
    || '<li class="muted tiny">No history recorded.</li>'}</ul>`;
}

/* ========================================================== teachers === */

registerPage('admin-teachers', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#teachers');
  const load = async () => {
    host.innerHTML = skeletonRows(5);
    try {
      const { teachers } = await api.get(`/admin/teachers${qsParams({ q: toolbarValue('#tea-q') })}`);
      A.teachers = teachers;
      host.innerHTML = teachers.length ? `<div class="grid grid-cols-3">${teachers.map((t) => `
        <article class="panel student-card">
          <div class="student-card-head">${avatar(t.name, t.avatar, 'avatar-lg')}
            <div><strong>${esc(t.name)}</strong><span class="tiny muted">${esc(t.email)}</span>
            ${t.active ? badge('Active') : badge('Inactive')}</div></div>
          <dl class="kv kv-tight">
            <div><dt>Qualification</dt><dd>${esc(t.qualification || '—')}</dd></div>
            <div><dt>Experience</dt><dd>${esc(t.experience || '—')}</dd></div>
            <div><dt>Students</dt><dd>${Number(t.students || 0)}</dd></div>
            <div><dt>Classes</dt><dd>${Number(t.classes || 0)}</dd></div>
          </dl>
          ${t.specialities ? `<ul class="chip-row">${String(t.specialities).split(',').filter(Boolean).map((s) => `<li class="chip">${esc(s.trim())}</li>`).join('')}</ul>` : ''}
          <div class="btn-row btn-row-tight">
            <button type="button" class="btn btn-sm btn-outline" data-teacher-edit="${t.id}">Edit</button>
            <button type="button" class="btn btn-sm btn-ghost" data-teacher-status="${t.id}" data-active="${t.active ? 1 : 0}">${t.active ? 'Deactivate' : 'Activate'}</button>
            <button type="button" class="btn btn-sm btn-ghost" data-teacher-password="${t.id}" data-name="${esc(t.name)}">Password</button>
          </div></article>`).join('')}</div>`
        : emptyState('No teachers yet', 'Add the academy\'s teachers so students can be assigned to them.',
          '<button type="button" class="btn btn-primary mt-4" data-add-teacher>Add a teacher</button>');
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  document.querySelector('#tea-q')?.addEventListener('input', debounce(load, 350));
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-add-teacher]')) { openTeacherForm(null, load); return; }
    const edit = e.target.closest('[data-teacher-edit]');
    if (edit) { openTeacherForm(A.teachers.find((t) => String(t.id) === edit.dataset.teacherEdit), load); return; }
    const st = e.target.closest('[data-teacher-status]');
    if (st) {
      const isActive = st.dataset.active === '1';
      const res = await confirmDialog({
        title: isActive ? 'Deactivate this teacher?' : 'Activate this teacher?',
        message: isActive
          ? 'A deactivated teacher cannot sign in. Reassign their students first — the academy blocks deactivation while students are still assigned. No records are deleted.'
          : 'The teacher regains access to their portal immediately.',
        confirmLabel: isActive ? 'Deactivate' : 'Activate',
        tone: isActive ? 'danger' : 'primary',
      });
      if (!res.ok) return;
      try {
        await api.patch('/admin/teachers/status', { id: Number(st.dataset.teacherStatus), active: !isActive });
        toast('Teacher updated.', 'success');
        load();
      } catch (err) {
        toast(err.status === 409 ? err.message : err.message, err.status === 409 ? 'warning' : 'error');
      }
      return;
    }
    const pw = e.target.closest('[data-teacher-password]');
    if (pw) openResetPassword('teacher', pw.dataset.teacherPassword, pw.dataset.name);
  });
  await load();
});

function openTeacherForm(teacher, reload) {
  const isNew = !teacher;
  modal({
    title: isNew ? 'Add a teacher' : 'Edit teacher',
    subtitle: isNew ? 'Creates the teacher portal account.' : esc(teacher.email),
    body: `<form id="tea-form" class="stack" novalidate>
      <div class="grid grid-cols-2">
        <div class="field"><label for="tf-name">Full name <span class="req">*</span></label>
          <input class="input" id="tf-name" name="name" required maxlength="120" value="${esc(teacher?.name || '')}"><span class="error-text"></span></div>
        <div class="field"><label for="tf-phone">Phone</label>
          <input class="input" id="tf-phone" name="phone" maxlength="40" value="${esc(teacher?.phone || '')}"></div>
      </div>
      ${isNew ? `<div class="grid grid-cols-2">
        <div class="field"><label for="tf-email">Email <span class="req">*</span></label>
          <input class="input" id="tf-email" name="email" type="email" required><span class="error-text"></span></div>
        <div class="field"><label for="tf-pass">Temporary password <span class="req">*</span></label>
          <div class="input-wrap"><input class="input" id="tf-pass" name="password" type="password" required minlength="8">
          <button type="button" class="password-toggle" aria-label="Show password">${icon('eye')}</button></div>
          <span class="error-text"></span></div></div>` : ''}
      <div class="grid grid-cols-2">
        <div class="field"><label for="tf-qual">Qualification</label>
          <input class="input" id="tf-qual" name="qualification" maxlength="200" value="${esc(teacher?.qualification || '')}" placeholder="e.g. Hafiz-e-Qur'an, Qari"></div>
        <div class="field"><label for="tf-exp">Experience</label>
          <input class="input" id="tf-exp" name="experience" maxlength="100" value="${esc(teacher?.experience || '')}" placeholder="e.g. 8 years"></div>
      </div>
      <div class="field"><label for="tf-spec">Specialities</label>
        <input class="input" id="tf-spec" name="specialities" maxlength="300" value="${esc(teacher?.specialities || '')}" placeholder="Tajweed, Hifz, Noorani Qaida">
        <span class="help">Comma separated. Shown on the public teachers page.</span></div>
      <div class="field"><label for="tf-bio">Biography</label>
        <textarea class="textarea" id="tf-bio" name="bio" rows="4" maxlength="1200">${esc(teacher?.bio || '')}</textarea></div>
      <div class="field"><label>Profile photo</label>
        <label class="file-drop" data-value=""><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <span class="icon-badge">${icon('upload')}</span><span data-drop-label>Choose a photo (under 700 KB)</span></label>
        <div class="file-preview"></div></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-tea-save>${isNew ? 'Create teacher' : 'Save changes'}</button>`,
    onMount(box) {
      box.querySelector('[data-tea-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#tea-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.name?.trim()) { fieldError(form.elements.name, 'Name is required.'); return; }
        if (isNew && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.email || '')) { fieldError(form.elements.email, 'Enter a valid email.'); return; }
        if (isNew && (v.password || '').length < 8) { fieldError(form.elements.password, 'Use at least 8 characters.'); return; }
        const image = box.querySelector('.file-drop')?.dataset.value || '';
        if (image) v.avatar = image;
        setLoading(ev.currentTarget, true);
        try {
          if (isNew) await api.post('/admin/teachers', v);
          else await api.patch('/admin/teachers', { id: teacher.id, ...v });
          closeModal();
          toast(isNew ? 'Teacher created.' : 'Teacher updated.', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ======================================================== admissions === */

registerPage('admin-admissions', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  await loadRefs();
  const host = document.querySelector('#admissions');
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const { enrollments } = await api.get(`/admin/enrollments${qsParams({
        status: toolbarValue('#adm-status'), q: toolbarValue('#adm-q'), course: toolbarValue('#adm-course'),
      })}`);
      window.__enrollments = enrollments;
      host.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Applicant</th><th>Course</th><th>Schedule</th><th>Teacher</th><th>Status</th><th class="ta-right">Actions</th></tr></thead>
        <tbody>${enrollments.length ? enrollments.map((e) => `<tr>
          <td><div class="cell-user">${avatar(e.student_name)}<div><strong>${esc(e.student_name)}</strong>
            <span class="tiny muted">${esc(e.email)}</span>
            ${e.guardian_name ? `<span class="tiny muted block">Guardian: ${esc(e.guardian_name)}</span>` : ''}</div></div></td>
          <td>${esc(e.course)}<span class="tiny muted block">${esc(e.level || '')}</span></td>
          <td>${esc(e.timing || '—')}<span class="tiny muted block">${esc(e.days || '')}</span>
            <span class="tiny muted block">${esc(relTime(e.created_at))}</span></td>
          <td>${esc(e.teacher_name || e.teacher || '—')}</td>
          <td>${badge(e.status)}</td>
          <td class="ta-right"><div class="row-actions">
            ${e.status === 'Pending' ? `
              <button type="button" class="btn btn-sm btn-primary" data-decide="approve" data-enrollment="${e.id}">Approve</button>
              <button type="button" class="btn btn-sm btn-ghost" data-decide="reject" data-enrollment="${e.id}">Reject</button>` : ''}
            <button type="button" class="btn btn-sm btn-outline" data-assign="${e.id}">Assign</button>
            <button type="button" class="btn btn-sm btn-ghost" data-enroll-edit="${e.id}">Edit</button>
          </div></td></tr>`).join('')
          : `<tr><td colspan="6">${emptyState('No admission records', 'Admission forms submitted on the website appear here.')}</td></tr>`}
      </tbody></table></div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  const courseSel = document.querySelector('#adm-course');
  if (courseSel) courseSel.innerHTML = '<option value="">All courses</option>' + A.courses.map((c) => `<option>${esc(c.name)}</option>`).join('');
  document.querySelector('#adm-q')?.addEventListener('input', debounce(load, 350));
  document.querySelector('#adm-status')?.addEventListener('change', load);
  courseSel?.addEventListener('change', load);
  window.__reloadAdmissions = load;
  await load();
});

/** Approve / reject works from both the overview and the admissions page. */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-decide]');
  if (!btn) return;
  const approve = btn.dataset.decide === 'approve';
  const id = Number(btn.dataset.enrollment);
  await loadRefs();
  if (approve) {
    modal({
      title: 'Approve admission',
      subtitle: 'Assign a teacher now so classes can be scheduled.',
      body: `<form id="apv-form" class="stack" novalidate>
        <div class="field"><label for="ap-teacher">Teacher</label>
          <select class="select" id="ap-teacher" name="teacherEmail">${teacherOptions('')}</select>
          <span class="help">You can assign or change the teacher later.</span></div>
        <p class="tiny muted">Approving activates the monthly fee schedule: due on day 5, grace to day 8, suspension on day 9 if unverified.</p>
      </form>`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
        <button type="button" class="btn btn-primary" data-apv-save>Approve admission</button>`,
      onMount(box) {
        box.querySelector('[data-apv-save]').addEventListener('click', async (ev) => {
          const v = formValues(box.querySelector('#apv-form'));
          setLoading(ev.currentTarget, true);
          try {
            await api.post('/admin/enrollments/decision', { id, decision: 'approve', teacherEmail: v.teacherEmail });
            closeModal();
            toast('Admission approved and the student notified.', 'success');
            refreshAdminPage();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(ev.currentTarget, false);
          }
        });
      },
    });
    return;
  }
  const res = await confirmDialog({
    title: 'Reject this admission?',
    message: 'The applicant is notified with your reason. The record is kept for your files — nothing is deleted.',
    confirmLabel: 'Reject admission',
    tone: 'danger',
    requireNote: true,
    notePlaceholder: 'Reason shared with the applicant',
  });
  if (!res.ok) return;
  try {
    await api.post('/admin/enrollments/decision', { id, decision: 'reject', reason: res.note });
    toast('Admission rejected and the applicant notified.', 'success');
    refreshAdminPage();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.addEventListener('click', async (e) => {
  const assign = e.target.closest('[data-assign]');
  if (assign) {
    await loadRefs();
    const en = (window.__enrollments || []).find((x) => String(x.id) === assign.dataset.assign) || {};
    modal({
      title: 'Assign teacher',
      subtitle: en.student_name ? `${en.student_name} · ${en.course || ''}` : '',
      body: `<form id="asg-form" class="stack" novalidate>
        <div class="field"><label for="as-teacher">Teacher <span class="req">*</span></label>
          <select class="select" id="as-teacher" name="teacherEmail" required>${teacherOptions(en.teacher || '')}</select>
          <span class="error-text"></span></div>
        <div class="field"><label for="as-status">Enrollment status</label>
          <select class="select" id="as-status" name="status">
            ${['Approved', 'Active', 'Completed', 'Pending', 'Rejected'].map((s) => `<option${en.status === s ? ' selected' : ''}>${s}</option>`).join('')}
          </select></div>
      </form>`,
      footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
        <button type="button" class="btn btn-primary" data-asg-save>Save assignment</button>`,
      onMount(box) {
        box.querySelector('[data-asg-save]').addEventListener('click', async (ev) => {
          const form = box.querySelector('#asg-form');
          const v = formValues(form);
          if (!v.teacherEmail) { fieldError(form.elements.teacherEmail, 'Choose a teacher.'); return; }
          setLoading(ev.currentTarget, true);
          try {
            await api.post('/admin/enrollments/assign', { enrollmentId: Number(assign.dataset.assign), teacherEmail: v.teacherEmail, status: v.status });
            closeModal();
            toast('Teacher assigned and both sides notified.', 'success');
            refreshAdminPage();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(ev.currentTarget, false);
          }
        });
      },
    });
    return;
  }
  const edit = e.target.closest('[data-enroll-edit]');
  if (!edit) return;
  await loadRefs();
  const en = (window.__enrollments || []).find((x) => String(x.id) === edit.dataset.enrollEdit) || {};
  modal({
    title: 'Edit enrollment',
    wide: true,
    body: `<form id="enr-form" class="stack" novalidate>
      <div class="grid grid-cols-2">
        <div class="field"><label for="en-name">Student name</label>
          <input class="input" id="en-name" name="student_name" maxlength="120" value="${esc(en.student_name || '')}"></div>
        <div class="field"><label for="en-guardian">Guardian name</label>
          <input class="input" id="en-guardian" name="guardian_name" maxlength="120" value="${esc(en.guardian_name || '')}"></div>
      </div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="en-course">Course</label><select class="select" id="en-course" name="course">${courseOptions(en.course)}</select></div>
        <div class="field"><label for="en-teacher">Teacher</label><select class="select" id="en-teacher" name="teacher">${teacherOptions(en.teacher || '')}</select></div>
      </div>
      <div class="grid grid-cols-3">
        <div class="field"><label for="en-status">Status</label><select class="select" id="en-status" name="status">
          ${['Pending', 'Approved', 'Active', 'Completed', 'Rejected'].map((s) => `<option${en.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label for="en-level">Level</label><input class="input" id="en-level" name="level" maxlength="60" value="${esc(en.level || '')}"></div>
        <div class="field"><label for="en-progress">Progress (%)</label>
          <input class="input" id="en-progress" name="progress" type="number" min="0" max="100" value="${Number(en.progress || 0)}"></div>
      </div>
      <div class="grid grid-cols-3">
        <div class="field"><label for="en-timing">Timing</label><input class="input" id="en-timing" name="timing" maxlength="60" value="${esc(en.timing || '')}"></div>
        <div class="field"><label for="en-days">Days</label><input class="input" id="en-days" name="days" maxlength="120" value="${esc(en.days || '')}"></div>
        <div class="field"><label for="en-tz">Timezone</label><input class="input" id="en-tz" name="timezone" maxlength="60" value="${esc(en.timezone || '')}"></div>
      </div>
      <div class="field"><label for="en-notes">Internal notes</label>
        <textarea class="textarea" id="en-notes" name="notes" rows="3" maxlength="1500">${esc(en.notes || '')}</textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-enr-save>Save enrollment</button>`,
    onMount(box) {
      box.querySelector('[data-enr-save]').addEventListener('click', async (ev) => {
        const v = formValues(box.querySelector('#enr-form'));
        setLoading(ev.currentTarget, true);
        try {
          await api.patch('/admin/enrollments', { id: Number(edit.dataset.enrollEdit), ...v, progress: Number(v.progress) });
          closeModal();
          toast('Enrollment updated.', 'success');
          refreshAdminPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
});

function refreshAdminPage() {
  const page = document.body.dataset.page;
  if (page === 'admin') {
    const host = document.querySelector('#overview');
    host.innerHTML = skeletonRows(6);
    renderOverview(host);
  } else if (typeof window.__reloadAdmissions === 'function' && page === 'admin-admissions') {
    window.__reloadAdmissions();
  } else if (typeof window.__reload === 'function') {
    window.__reload();
  } else {
    location.reload();
  }
}

/* =========================================================== classes === */

registerPage('admin-classes', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  await loadRefs();
  const host = document.querySelector('#classes');
  const teacherSel = document.querySelector('#cl-teacher');
  if (teacherSel) teacherSel.innerHTML = '<option value="">All teachers</option>' + A.teachers.map((t) => `<option value="${esc(t.email)}">${esc(t.name)}</option>`).join('');
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const { classes } = await api.get(`/admin/classes${qsParams({
        status: toolbarValue('#cl-status'), teacher: toolbarValue('#cl-teacher'),
        date: toolbarValue('#cl-date'), q: toolbarValue('#cl-q'),
      })}`);
      window.__classes = classes;
      host.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Student</th><th>Teacher</th><th>Topic</th><th>Status</th><th class="ta-right">Actions</th></tr></thead>
        <tbody>${classes.length ? classes.map((c) => `<tr>
          <td>${esc(fmtDay(c.starts_at))}<span class="tiny muted block">${esc(fmtTime(c.starts_at))}</span></td>
          <td>${esc(c.student_name || '—')}<span class="tiny muted block">${esc(c.course || '')}</span></td>
          <td>${esc(c.teacher_name || '—')}</td>
          <td>${esc(c.topic || '—')}</td>
          <td>${badge(c.status)}</td>
          <td class="ta-right"><div class="row-actions">
            <button type="button" class="btn btn-sm btn-outline" data-class-edit="${c.id}">Edit</button>
            ${c.status !== 'cancelled' ? `<button type="button" class="btn btn-sm btn-ghost" data-class-cancel="${c.id}">Cancel</button>` : ''}
          </div></td></tr>`).join('')
          : `<tr><td colspan="6">${emptyState('No classes found', 'Adjust the filters or schedule a class.')}</td></tr>`}
      </tbody></table></div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  ['#cl-status', '#cl-teacher', '#cl-date'].forEach((s) => document.querySelector(s)?.addEventListener('change', load));
  document.querySelector('#cl-q')?.addEventListener('input', debounce(load, 350));
  document.querySelector('[data-add-class]')?.addEventListener('click', () => openAdminClassForm(null, load));
  document.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-class-edit]');
    if (edit) { openAdminClassForm((window.__classes || []).find((c) => String(c.id) === edit.dataset.classEdit), load); return; }
    const cancel = e.target.closest('[data-class-cancel]');
    if (!cancel) return;
    const res = await confirmDialog({
      title: 'Cancel this class?',
      message: 'The class is marked cancelled and both the student and teacher are notified. The record stays in the timetable history.',
      confirmLabel: 'Cancel class',
      tone: 'danger',
    });
    if (!res.ok) return;
    try {
      await api.del(`/admin/classes?id=${encodeURIComponent(cancel.dataset.classCancel)}`);
      toast('Class cancelled.', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  await load();
});

async function openAdminClassForm(cls, reload) {
  const isNew = !cls;
  let enrollments = window.__enrollList;
  if (!enrollments) {
    try {
      const res = await api.get('/admin/enrollments?status=Active');
      const res2 = await api.get('/admin/enrollments?status=Approved');
      enrollments = [...(res.enrollments || []), ...(res2.enrollments || [])];
      window.__enrollList = enrollments;
    } catch { enrollments = []; }
  }
  const stamp = String(cls?.starts_at || '').replace(' ', 'T');
  modal({
    title: isNew ? 'Schedule a class' : 'Edit class',
    subtitle: 'All times are Pakistan Standard Time.',
    body: `<form id="acl-form" class="stack" novalidate>
      ${isNew ? `<div class="field"><label for="ac-enroll">Student enrollment <span class="req">*</span></label>
        <select class="select" id="ac-enroll" name="enrollmentId" required>
          ${enrollments.map((e) => `<option value="${e.id}">${esc(e.student_name)} — ${esc(e.course)} (${esc(e.teacher_name || 'unassigned')})</option>`).join('')
            || '<option value="">No active enrollments</option>'}
        </select><span class="error-text"></span></div>` : ''}
      <div class="field"><label for="ac-teacher">Teacher</label>
        <select class="select" id="ac-teacher" name="teacherEmail">${teacherOptions(cls?.teacher || '')}</select></div>
      <div class="grid grid-cols-3">
        <div class="field"><label for="ac-date">Date</label>
          <input class="input" id="ac-date" name="date" type="date" value="${esc(stamp.slice(0, 10) || pkNow().date)}"></div>
        <div class="field"><label for="ac-time">Start</label>
          <input class="input" id="ac-time" name="time" type="time" value="${esc(stamp.slice(11, 16) || '18:00')}"></div>
        <div class="field"><label for="ac-dur">Minutes</label>
          <input class="input" id="ac-dur" name="duration" type="number" min="10" max="180" step="5" value="30"></div>
      </div>
      ${isNew ? '' : `<div class="field"><label for="ac-status">Status</label>
        <select class="select" id="ac-status" name="status">
          ${['scheduled', 'live', 'completed', 'cancelled'].map((s) => `<option${cls.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select></div>`}
      <div class="field"><label for="ac-topic">Topic</label>
        <input class="input" id="ac-topic" name="topic" maxlength="200" value="${esc(cls?.topic || '')}"></div>
      <div class="field"><label for="ac-notes">Notes</label>
        <textarea class="textarea" id="ac-notes" name="notes" rows="3" maxlength="800">${esc(cls?.notes || '')}</textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-acl-save>${isNew ? 'Schedule class' : 'Save class'}</button>`,
    onMount(box) {
      box.querySelector('[data-acl-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#acl-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (isNew && !v.enrollmentId) { fieldError(form.elements.enrollmentId, 'Choose an enrollment.'); return; }
        const startsAt = `${v.date} ${v.time}`;
        const end = new Date(`${v.date}T${v.time}:00Z`);
        end.setUTCMinutes(end.getUTCMinutes() + (Number(v.duration) || 30));
        const endsAt = `${end.toISOString().slice(0, 10)} ${end.toISOString().slice(11, 16)}`;
        setLoading(ev.currentTarget, true);
        try {
          if (isNew) {
            await api.post('/admin/classes', {
              enrollmentId: Number(v.enrollmentId), teacherEmail: v.teacherEmail, startsAt, endsAt, topic: v.topic, notes: v.notes,
            });
          } else {
            await api.patch('/admin/classes', {
              id: cls.id, startsAt, endsAt, status: v.status, teacherEmail: v.teacherEmail, topic: v.topic, notes: v.notes,
            });
          }
          closeModal();
          toast(isNew ? 'Class scheduled.' : 'Class updated.', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ======================================================== attendance == */

registerPage('admin-attendance', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  await loadRefs();
  const host = document.querySelector('#attendance');
  const teacherSel = document.querySelector('#at-teacher');
  if (teacherSel) teacherSel.innerHTML = '<option value="">All teachers</option>' + A.teachers.map((t) => `<option value="${esc(t.email)}">${esc(t.name)}</option>`).join('');
  const monthInput = document.querySelector('#at-month');
  if (monthInput && !monthInput.value) monthInput.value = pkNow().monthKey;
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const d = await api.get(`/admin/attendance${qsParams({
        q: toolbarValue('#at-q'), teacher: toolbarValue('#at-teacher'),
        status: toolbarValue('#at-status'), month: toolbarValue('#at-month'),
      })}`);
      const rows = d.attendance || [];
      const summary = rows.reduce((acc, a) => (acc[a.status] = (acc[a.status] || 0) + 1, acc), {});
      host.innerHTML = `
        <div class="panel-grid">
          <section class="panel"><header class="panel-head"><h2>Status mix</h2></header>
            <div class="panel-body">${donutChart([
              { label: 'Present', value: summary.Present || 0, color: 'var(--green-600)' },
              { label: 'Late', value: summary.Late || 0, color: 'var(--gold-600)' },
              { label: 'Leave', value: summary.Leave || 0, color: 'var(--blue-500)' },
              { label: 'Absent', value: summary.Absent || 0, color: 'var(--red-600)' },
            ], { centerValue: String(rows.length), centerLabel: 'records', emptyText: 'No attendance in this period' })}</div></section>
          <section class="panel"><header class="panel-head"><h2>By student</h2></header>
            <div class="panel-body">${hBars((d.byStudent || []).slice(0, 10).map((s) => ({
              label: s.student_name || s.student_email, value: Number(s.percentage ?? 0), meta: `${Number(s.attended || 0)}/${Number(s.total || 0)}`,
            })))}</div></section>
          <section class="panel"><header class="panel-head"><h2>By teacher</h2></header>
            <div class="panel-body">${hBars((d.byTeacher || []).map((t) => ({
              label: t.teacher_name || t.teacher_email, value: Number(t.percentage ?? 0), meta: `${Number(t.total || 0)} marked`,
            })))}</div></section>
          <section class="panel panel-wide"><header class="panel-head"><h2>Attendance records</h2>
            <span class="tiny muted">${rows.length} record${rows.length === 1 ? '' : 's'}</span></header>
            <div class="panel-body"><div class="table-wrap"><table class="table">
              <thead><tr><th>Date</th><th>Student</th><th>Teacher</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>${rows.length ? rows.map((a) => `<tr><td>${esc(fmtDate(a.date || a.created_at))}</td>
                <td>${esc(a.student_name || a.student_email || '—')}</td>
                <td>${esc(a.teacher_name || a.teacher_email || '—')}</td>
                <td>${badge(a.status)}</td><td>${esc(a.notes || '—')}</td></tr>`).join('')
                : `<tr><td colspan="5">${emptyState('No attendance records', 'Nothing was marked for these filters.')}</td></tr>`}
            </tbody></table></div></div></section>
        </div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  ['#at-teacher', '#at-status', '#at-month'].forEach((s) => document.querySelector(s)?.addEventListener('change', load));
  document.querySelector('#at-q')?.addEventListener('input', debounce(load, 350));
  await load();
});

/* ========================================================== payments == */

registerPage('admin-payments', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#payments');
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const d = await api.get(`/admin/payments${qsParams({
        status: toolbarValue('#pm-status'), method: toolbarValue('#pm-method'),
        month: toolbarValue('#pm-month'), q: toolbarValue('#pm-q'),
      })}`);
      window.__payments = d.payments || [];
      const methodSel = document.querySelector('#pm-method');
      if (methodSel && methodSel.options.length <= 1) {
        methodSel.innerHTML = '<option value="">All methods</option>'
          + (d.methods || []).map((m) => `<option value="${esc(m.code)}">${esc(m.name)}</option>`).join('');
      }
      host.innerHTML = `
        <div class="stat-grid stat-grid-3">
          <article class="stat-card"><span class="icon-badge">${icon('checkCircle')}</span>
            <div><small>Verified</small><strong>${esc(money(d.totals?.verified, A.currency))}</strong></div></article>
          <article class="stat-card"><span class="icon-badge">${icon('clock')}</span>
            <div><small>Pending</small><strong>${esc(money(d.totals?.pending, A.currency))}</strong></div></article>
          <article class="stat-card"><span class="icon-badge">${icon('alert')}</span>
            <div><small>Rejected</small><strong>${esc(money(d.totals?.rejected, A.currency))}</strong></div></article>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Student</th><th>Month</th><th>Amount</th><th>Method</th><th>Reference</th><th>Submitted</th><th>Status</th><th class="ta-right">Actions</th></tr></thead>
          <tbody>${d.payments.length ? d.payments.map((p) => `<tr>
            <td><strong>${esc(p.student_name || p.email)}</strong><span class="tiny muted block">${esc(p.email)}</span></td>
            <td>${esc(monthLabel(p.billing_month))}</td>
            <td>${esc(money(p.amount, A.currency))}</td>
            <td>${esc(p.method_label || p.method)}</td>
            <td class="mono">${esc(p.reference || '—')}</td>
            <td>${esc(fmtDate(p.created_at))}</td>
            <td>${badge(p.status)}${p.receipt_no ? `<span class="tiny muted block mono">${esc(p.receipt_no)}</span>` : ''}</td>
            <td class="ta-right"><button type="button" class="btn btn-sm btn-outline" data-open-payment="${p.id}">Review</button></td>
          </tr>`).join('')
            : `<tr><td colspan="8">${emptyState('No payments found', 'Adjust the filters, or record a cash payment.')}</td></tr>`}
        </tbody></table></div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  ['#pm-status', '#pm-method', '#pm-month'].forEach((s) => document.querySelector(s)?.addEventListener('change', load));
  document.querySelector('#pm-q')?.addEventListener('input', debounce(load, 350));
  document.querySelector('[data-add-payment]')?.addEventListener('click', () => openCashPaymentForm(load));
  await load();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-open-payment]');
  if (btn) openPaymentReview(btn.dataset.openPayment);
});

async function openPaymentReview(id) {
  const box = modal({ title: 'Verify payment', wide: true, body: skeletonRows(4) });
  try {
    const { payment: p } = await api.get(`/admin/payments/proof?id=${encodeURIComponent(id)}`);
    const locked = p.status === 'Verified';
    box.querySelector('.modal-body').innerHTML = `
      <div class="review-grid">
        <div>
          <dl class="kv">
            <div><dt>Student</dt><dd>${esc(p.student_name || p.email)}<span class="tiny muted block">${esc(p.email)}</span></dd></div>
            <div><dt>Course</dt><dd>${esc(p.course || '—')}</dd></div>
            <div><dt>Billing month</dt><dd>${esc(monthLabel(p.billing_month))}</dd></div>
            <div><dt>Amount submitted</dt><dd>${esc(money(p.amount, A.currency))}</dd></div>
            <div><dt>Method</dt><dd>${esc(p.method_label || p.method)}</dd></div>
            <div><dt>Reference</dt><dd class="mono">${esc(p.reference || '—')}</dd></div>
            <div><dt>Payment date</dt><dd>${esc(fmtDate(p.payment_date))}</dd></div>
            <div><dt>Submitted</dt><dd>${esc(fmtDateTime(p.created_at))}</dd></div>
            <div><dt>Status</dt><dd>${badge(p.status)}</dd></div>
            ${p.receipt_no ? `<div><dt>Receipt</dt><dd class="mono">${esc(p.receipt_no)}</dd></div>` : ''}
            ${p.student_note ? `<div><dt>Student note</dt><dd>${esc(p.student_note)}</dd></div>` : ''}
            ${p.admin_note ? `<div><dt>Office note</dt><dd>${esc(p.admin_note)}</dd></div>` : ''}
          </dl>
          ${locked ? `<div class="alert alert-success mt-4">${icon('checkCircle')}<div>This payment is verified and cannot be reversed. Record a correction as a separate entry if needed.</div></div>` : `
          <form id="ver-form" class="stack mt-4">
            <div class="grid grid-cols-2">
              <div class="field"><label for="vf-amount">Amount received (${esc(A.currency)})</label>
                <input class="input" id="vf-amount" name="receivedAmount" type="number" min="0" step="1" value="${Number(p.amount || 0)}"></div>
              <div class="field"><label for="vf-date">Date received</label>
                <input class="input" id="vf-date" name="receivedDate" type="date" value="${esc(String(p.payment_date || pkNow().date).slice(0, 10))}"></div>
            </div>
            <div class="field"><label for="vf-note">Office note</label>
              <textarea class="textarea" id="vf-note" name="note" rows="2" maxlength="500" placeholder="Required when rejecting"></textarea>
              <span class="error-text">A note is required when rejecting a payment.</span></div>
          </form>`}
        </div>
        <div class="proof-pane">
          <h4>Payment proof</h4>
          ${p.proof ? `<a href="${esc(p.proof)}" target="_blank" rel="noopener"><img src="${esc(p.proof)}" alt="Payment proof submitted by the student"></a>
            <p class="tiny muted mt-2">Open the image in a new tab to zoom.</p>`
            : `<p class="muted tiny">${esc(p.method === 'cash' ? 'Cash payments are recorded without a screenshot.' : 'No screenshot was attached.')}</p>`}
        </div>
      </div>`;
    box.querySelector('.modal').insertAdjacentHTML('beforeend', `<div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-modal-close>Close</button>
      ${locked ? '' : `<button type="button" class="btn btn-danger" data-verify="rejected">Reject</button>
        <button type="button" class="btn btn-primary" data-verify="verified">Verify payment</button>`}</div>`);
    if (!locked) {
      box.querySelectorAll('[data-verify]').forEach((b) => b.addEventListener('click', async (ev) => {
        const status = ev.currentTarget.dataset.verify;
        const form = box.querySelector('#ver-form');
        const v = formValues(form);
        if (status === 'rejected' && !v.note.trim()) {
          form.querySelector('.field:last-child').classList.add('has-error');
          return;
        }
        if (status === 'verified') {
          const ok = await confirmDialog({
            title: 'Verify this payment?',
            message: `Verification is final and cannot be reversed. ${money(v.receivedAmount || p.amount, A.currency)} will be recorded as received for ${monthLabel(p.billing_month)}, a receipt number is issued, and a suspended student is reactivated automatically once the month is settled.`,
            confirmLabel: 'Verify payment',
          });
          if (!ok.ok) return;
        }
        setLoading(ev.currentTarget, true);
        try {
          const res = await api.post('/admin/payments/verify', {
            id: p.id, status, note: v.note,
            receivedAmount: v.receivedAmount ? Number(v.receivedAmount) : undefined,
            receivedDate: v.receivedDate || undefined,
          });
          closeModal();
          toast(status === 'verified' ? `Payment verified. Receipt ${res.receipt_no || ''}` : 'Payment rejected and the student notified.',
            status === 'verified' ? 'success' : 'warning');
          refreshAdminPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      }));
    }
  } catch (err) {
    box.querySelector('.modal-body').innerHTML = errorState(err.message);
  }
}

function openCashPaymentForm(reload) {
  modal({
    title: 'Record a cash payment',
    subtitle: 'Recorded as Pending until you verify it, so the audit trail stays honest.',
    body: `<form id="cash-form" class="stack" novalidate>
      <div class="field"><label for="cf-email">Student email <span class="req">*</span></label>
        <input class="input" id="cf-email" name="studentEmail" type="email" required><span class="error-text"></span></div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="cf-amount">Amount (${esc(A.currency)}) <span class="req">*</span></label>
          <input class="input" id="cf-amount" name="amount" type="number" min="0" step="1" required><span class="error-text"></span></div>
        <div class="field"><label for="cf-month">Billing month <span class="req">*</span></label>
          <input class="input" id="cf-month" name="billingMonth" type="month" value="${esc(pkNow().monthKey)}" required></div>
      </div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="cf-date">Payment date</label>
          <input class="input" id="cf-date" name="paymentDate" type="date" max="${esc(pkNow().date)}" value="${esc(pkNow().date)}"></div>
        <div class="field"><label for="cf-ref">Reference / voucher</label>
          <input class="input" id="cf-ref" name="reference" maxlength="80"></div>
      </div>
      <div class="field"><label for="cf-note">Note</label>
        <textarea class="textarea" id="cf-note" name="note" rows="2" maxlength="500"></textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-cash-save>Record payment</button>`,
    onMount(box) {
      box.querySelector('[data-cash-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#cash-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v.studentEmail || '')) { fieldError(form.elements.studentEmail, 'Enter the student\'s email.'); return; }
        if (!Number(v.amount)) { fieldError(form.elements.amount, 'Enter the amount received.'); return; }
        setLoading(ev.currentTarget, true);
        try {
          await api.post('/admin/payments', v);
          closeModal();
          toast('Cash payment recorded as pending. Verify it to issue the receipt.', 'success');
          reload();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* =========================================================== finance == */

registerPage('admin-finance', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#finance');
  const monthInput = document.querySelector('#fi-month');
  if (monthInput && !monthInput.value) monthInput.value = pkNow().monthKey;
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const d = await api.get(`/admin/finance${qsParams({ month: toolbarValue('#fi-month') })}`);
      const t = d.totals || {};
      const delta = Number(t.previousVerified) ? Math.round(((Number(t.verified) - Number(t.previousVerified)) / Number(t.previousVerified)) * 100) : null;
      host.innerHTML = `
        <div class="stat-grid">
          <article class="stat-card"><span class="icon-badge">${icon('wallet')}</span>
            <div><small>Verified revenue · ${esc(d.monthLabel || '')}</small><strong>${esc(money(t.verified, A.currency))}</strong>
            <span class="tiny muted">${delta === null ? `Previous month ${money(t.previousVerified, A.currency)}` : `${delta >= 0 ? '+' : ''}${delta}% vs ${monthLabel(d.previousMonth)}`}</span></div></article>
          <article class="stat-card"><span class="icon-badge">${icon('clock')}</span>
            <div><small>Awaiting verification</small><strong>${esc(money(t.pending, A.currency))}</strong>
            <span class="tiny muted">${Number(t.submissions || 0)} submission${Number(t.submissions) === 1 ? '' : 's'}</span></div></article>
          <article class="stat-card"><span class="icon-badge">${icon('alert')}</span>
            <div><small>Outstanding fees</small><strong>${esc(money(t.outstanding, A.currency))}</strong>
            <span class="tiny muted">${Number(t.outstandingStudents || 0)} student${Number(t.outstandingStudents) === 1 ? '' : 's'}</span></div></article>
          <article class="stat-card"><span class="icon-badge">${icon('shield')}</span>
            <div><small>Suspended accounts</small><strong>${Number(t.suspendedStudents || 0)}</strong>
            <span class="tiny muted">Reactivated automatically on verification</span></div></article>
        </div>

        <div class="panel-grid">
          <section class="panel panel-wide"><header class="panel-head"><h2>Verified revenue trend</h2>
            <button type="button" class="btn btn-sm btn-outline" data-run-billing>${icon('refresh', 'icon-xs')} Run billing check</button></header>
            <div class="panel-body">${lineChart((d.trend || []).map((r) => ({ label: monthLabel(r.month).slice(0, 3), value: Number(r.total || 0) })), { currency: A.currency })}</div></section>
          <section class="panel"><header class="panel-head"><h2>By payment method</h2></header>
            <div class="panel-body">${donutChart((d.byMethod || []).map((m, i) => ({
              label: m.method_label || m.method, value: Number(m.total || 0),
              color: ['var(--green-600)', 'var(--gold-600)', 'var(--blue-500)', 'var(--green-800)'][i % 4],
            })), { currency: A.currency, centerValue: window.SUQCharts.shortNum(t.verified), centerLabel: A.currency, emptyText: 'No verified payments this month' })}</div></section>
          <section class="panel"><header class="panel-head"><h2>By course</h2></header>
            <div class="panel-body">${hBars((d.byCourse || []).map((c) => ({ label: c.course, value: Number(c.total || 0), meta: `${Number(c.count || 0)} payments` })), { currency: A.currency })}</div></section>
          <section class="panel panel-wide"><header class="panel-head"><h2>Overdue students</h2>
            <span class="tiny muted">Due day ${Number(d.rules?.dueDay || 5)} · grace to ${Number(d.rules?.graceEndDay || 8)} · suspension day ${Number(d.rules?.suspendDay || 9)}</span></header>
            <div class="panel-body"><div class="table-wrap"><table class="table">
              <thead><tr><th>Student</th><th>Course</th><th>Fee</th><th>Paid</th><th>Remaining</th><th>Status</th><th class="ta-right"></th></tr></thead>
              <tbody>${(d.overdue || []).length ? d.overdue.map((s) => `<tr>
                <td><strong>${esc(s.student_name || s.name || s.email)}</strong><span class="tiny muted block">${esc(s.email)}</span></td>
                <td>${esc(s.course || '—')}</td><td>${esc(money(s.fee, A.currency))}</td>
                <td>${esc(money(s.paid, A.currency))}</td><td>${esc(money(s.remaining, A.currency))}</td>
                <td>${badge(s.status || 'Overdue')}</td>
                <td class="ta-right"><button type="button" class="btn btn-sm btn-ghost" data-remind="${esc(s.email)}">Send reminder</button></td></tr>`).join('')
                : `<tr><td colspan="7">${emptyState('No overdue fees', 'Every active student is settled for this month.')}</td></tr>`}
            </tbody></table></div></div></section>
          <section class="panel panel-wide"><header class="panel-head"><h2>Payments this month</h2></header>
            <div class="panel-body"><div class="table-wrap"><table class="table">
              <thead><tr><th>Student</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt</th><th class="ta-right"></th></tr></thead>
              <tbody>${(d.payments || []).length ? d.payments.map((p) => `<tr>
                <td>${esc(p.student_name || p.email)}</td><td>${esc(money(p.amount, A.currency))}</td>
                <td>${esc(p.method_label || p.method)}</td><td>${badge(p.status)}</td>
                <td class="mono">${esc(p.receipt_no || '—')}</td>
                <td class="ta-right"><button type="button" class="btn btn-sm btn-ghost" data-open-payment="${p.id}">Review</button></td></tr>`).join('')
                : `<tr><td colspan="6" class="muted tiny">No payments recorded for this month.</td></tr>`}
            </tbody></table></div></div></section>
        </div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  monthInput?.addEventListener('change', load);
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-run-billing]')) {
      const btn = e.target.closest('[data-run-billing]');
      const ok = await confirmDialog({
        title: 'Run the billing check now?',
        message: 'This applies today\'s fee rules: due reminders, grace warnings and suspension of unverified accounts for the current month. It never deletes records and is safe to run more than once a day.',
        confirmLabel: 'Run billing check',
      });
      if (!ok.ok) return;
      setLoading(btn, true);
      try {
        const res = await api.post('/admin/billing/run', {});
        const s = res.summary || {};
        toast(`Billing check complete. ${Number(s.reminders || 0)} reminders, ${Number(s.suspended || 0)} suspensions, ${Number(s.reactivated || 0)} reactivations.`, 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(btn, false);
      }
    }
    const rem = e.target.closest('[data-remind]');
    if (rem) openNotificationForm(rem.dataset.remind);
  });
  await load();
});

/* =========================================================== content == */

registerPage('admin-content', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  await loadRefs();
  await Promise.all([renderCourses(), renderGallery(), renderTestimonials()]);
  document.querySelector('[data-add-course]')?.addEventListener('click', () => openCourseForm(null));
  document.querySelector('[data-add-gallery]')?.addEventListener('click', () => openGalleryForm());
  document.querySelector('[data-add-testimonial]')?.addEventListener('click', () => openTestimonialForm(null));
  document.addEventListener('click', async (e) => {
    const ce = e.target.closest('[data-course-edit]');
    if (ce) { openCourseForm(A.courses.find((c) => String(c.id) === ce.dataset.courseEdit)); return; }
    const ca = e.target.closest('[data-course-active]');
    if (ca) {
      try {
        await api.patch('/admin/courses', { id: Number(ca.dataset.courseActive), active: ca.dataset.active !== '1' });
        toast('Course updated.', 'success');
        A.courses = [];
        await loadRefs();
        renderCourses();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const gd = e.target.closest('[data-gallery-delete]');
    if (gd) {
      const ok = await confirmDialog({ title: 'Remove this photograph?', message: 'It is removed from the public gallery. The image file itself is not used anywhere else.', confirmLabel: 'Remove', tone: 'danger' });
      if (!ok.ok) return;
      try { await api.del(`/admin/gallery?id=${gd.dataset.galleryDelete}`); toast('Photograph removed.', 'success'); renderGallery(); }
      catch (err) { toast(err.message, 'error'); }
      return;
    }
    const td = e.target.closest('[data-testimonial-delete]');
    if (td) {
      const ok = await confirmDialog({ title: 'Remove this testimonial?', message: 'It disappears from the public website.', confirmLabel: 'Remove', tone: 'danger' });
      if (!ok.ok) return;
      try { await api.del(`/admin/testimonials?id=${td.dataset.testimonialDelete}`); toast('Testimonial removed.', 'success'); renderTestimonials(); }
      catch (err) { toast(err.message, 'error'); }
      return;
    }
    const te = e.target.closest('[data-testimonial-edit]');
    if (te) openTestimonialForm((window.__testimonials || []).find((t) => String(t.id) === te.dataset.testimonialEdit));
  });
});

async function renderCourses() {
  const host = document.querySelector('#courses-admin');
  if (!host) return;
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Course</th><th>Fee</th><th>Schedule</th><th>Level</th><th>Students</th><th>Visible</th><th class="ta-right">Actions</th></tr></thead>
    <tbody>${A.courses.map((c) => `<tr>
      <td><strong>${esc(c.name)}</strong><span class="tiny muted block">${esc(String(c.description || '').slice(0, 80))}</span></td>
      <td>${esc(money(c.fee, A.currency))}</td><td>${esc(c.duration || '—')}</td><td>${esc(c.level || '—')}</td>
      <td>${Number(c.students || 0)}</td>
      <td>${c.active === 0 ? badge('Hidden') : badge('Published')}</td>
      <td class="ta-right"><div class="row-actions">
        <button type="button" class="btn btn-sm btn-outline" data-course-edit="${c.id}">Edit</button>
        <button type="button" class="btn btn-sm btn-ghost" data-course-active="${c.id}" data-active="${c.active === 0 ? 0 : 1}">${c.active === 0 ? 'Publish' : 'Hide'}</button>
      </div></td></tr>`).join('') || `<tr><td colspan="7">${emptyState('No courses', 'Add the academy\'s courses so families can enroll.')}</td></tr>`}
  </tbody></table></div>`;
}

function openCourseForm(course) {
  const isNew = !course;
  modal({
    title: isNew ? 'Add a course' : 'Edit course',
    body: `<form id="crs-form" class="stack" novalidate>
      <div class="field"><label for="cf-name">Course name <span class="req">*</span></label>
        <input class="input" id="cf-name" name="name" required maxlength="120" value="${esc(course?.name || '')}"><span class="error-text"></span></div>
      <div class="field"><label for="cf-desc">Description</label>
        <textarea class="textarea" id="cf-desc" name="description" rows="4" maxlength="2000">${esc(course?.description || '')}</textarea></div>
      <div class="grid grid-cols-3">
        <div class="field"><label for="cf-fee">Monthly fee (${esc(A.currency)}) <span class="req">*</span></label>
          <input class="input" id="cf-fee" name="fee" type="number" min="0" step="1" required value="${Number(course?.fee || 0)}"><span class="error-text"></span></div>
        <div class="field"><label for="cf-dur">Schedule</label>
          <input class="input" id="cf-dur" name="duration" maxlength="60" value="${esc(course?.duration || 'Monthly')}"></div>
        <div class="field"><label for="cf-level">Level</label>
          <input class="input" id="cf-level" name="level" maxlength="60" value="${esc(course?.level || 'All levels')}"></div>
      </div>
      <div class="field"><label>Course image</label>
        <label class="file-drop" data-value=""><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <span class="icon-badge">${icon('upload')}</span><span data-drop-label>Upload an image (under 700 KB)</span></label>
        <div class="file-preview"></div>
        <span class="help">Leave empty to keep the bundled photograph for this course.</span></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-crs-save>${isNew ? 'Add course' : 'Save course'}</button>`,
    onMount(box) {
      box.querySelector('[data-crs-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#crs-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.name?.trim()) { fieldError(form.elements.name, 'Course name is required.'); return; }
        if (!Number.isFinite(Number(v.fee)) || Number(v.fee) < 0) { fieldError(form.elements.fee, 'Enter a valid fee.'); return; }
        const image = box.querySelector('.file-drop')?.dataset.value || '';
        setLoading(ev.currentTarget, true);
        try {
          await api.patch('/admin/courses', {
            id: isNew ? undefined : course.id, name: v.name, description: v.description,
            fee: Number(v.fee), duration: v.duration, level: v.level, image: image || undefined,
          });
          closeModal();
          toast(isNew ? 'Course added.' : 'Course updated.', 'success');
          A.courses = [];
          await loadRefs();
          renderCourses();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

async function renderGallery() {
  const host = document.querySelector('#gallery-admin');
  if (!host) return;
  host.innerHTML = skeletonRows(3);
  try {
    const { items } = await api.get('/admin/gallery');
    host.innerHTML = items.length ? `<div class="grid grid-cols-4">${items.map((g) => `
      <figure class="admin-tile"><img src="${esc(g.image)}" alt="${esc(g.title || '')}" loading="lazy">
        <figcaption><strong>${esc(g.title || 'Untitled')}</strong>
          <span class="tiny muted">${esc(g.caption || '')}</span>
          <button type="button" class="btn btn-sm btn-ghost" data-gallery-delete="${g.id}">${icon('trash', 'icon-xs')} Remove</button>
        </figcaption></figure>`).join('')}</div>`
      : emptyState('No photographs', 'Upload photographs of classes, certificates and events for the public gallery.');
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
}

function openGalleryForm() {
  modal({
    title: 'Add a gallery photograph',
    body: `<form id="gal-form" class="stack" novalidate>
      <div class="field"><label for="gf-title">Title</label>
        <input class="input" id="gf-title" name="title" maxlength="120"></div>
      <div class="field"><label for="gf-cap">Caption</label>
        <input class="input" id="gf-cap" name="caption" maxlength="300"></div>
      <div class="field"><label>Photograph <span class="req">*</span></label>
        <label class="file-drop" data-value=""><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <span class="icon-badge">${icon('upload')}</span><span data-drop-label>Choose an image (under 700 KB)</span></label>
        <div class="file-preview"></div><span class="error-text">Choose an image to upload.</span></div>
      <div class="field"><label for="gf-sort">Sort order</label>
        <input class="input" id="gf-sort" name="sortOrder" type="number" value="0"></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-gal-save>Add photograph</button>`,
    onMount(box) {
      box.querySelector('[data-gal-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#gal-form');
        const v = formValues(form);
        const image = box.querySelector('.file-drop')?.dataset.value || '';
        if (!image) { box.querySelector('.file-drop').closest('.field').classList.add('has-error'); return; }
        setLoading(ev.currentTarget, true);
        try {
          await api.post('/admin/gallery', { ...v, image, sortOrder: Number(v.sortOrder) });
          closeModal();
          toast('Photograph added to the gallery.', 'success');
          renderGallery();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

async function renderTestimonials() {
  const host = document.querySelector('#testimonials-admin');
  if (!host) return;
  host.innerHTML = skeletonRows(3);
  try {
    const { items } = await api.get('/admin/testimonials');
    window.__testimonials = items;
    host.innerHTML = items.length ? `<ul class="list-rows">${items.map((t) => `<li class="list-row">
      <div class="row-main"><strong>${esc(t.name)}</strong>
        <span class="tiny muted">${esc(t.role || '')} · rating ${Number(t.rating || 5)}/5</span>
        <p class="tiny">${esc(String(t.body).slice(0, 160))}</p></div>
      <div class="row-actions">
        <button type="button" class="btn btn-sm btn-outline" data-testimonial-edit="${t.id}">Edit</button>
        <button type="button" class="btn btn-sm btn-ghost" data-testimonial-delete="${t.id}">Remove</button></div></li>`).join('')}</ul>`
      : emptyState('No testimonials', 'Add feedback you have received from parents and students, with their permission.');
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
}

function openTestimonialForm(t) {
  const isNew = !t;
  modal({
    title: isNew ? 'Add a testimonial' : 'Edit testimonial',
    body: `<form id="tst-form" class="stack" novalidate>
      <div class="grid grid-cols-2">
        <div class="field"><label for="tf2-name">Name <span class="req">*</span></label>
          <input class="input" id="tf2-name" name="name" required maxlength="120" value="${esc(t?.name || '')}"><span class="error-text"></span></div>
        <div class="field"><label for="tf2-role">Role</label>
          <input class="input" id="tf2-role" name="role" maxlength="120" value="${esc(t?.role || '')}" placeholder="Parent, Hifz student…"></div>
      </div>
      <div class="field"><label for="tf2-body">Testimonial <span class="req">*</span></label>
        <textarea class="textarea" id="tf2-body" name="body" rows="4" required maxlength="1200">${esc(t?.body || '')}</textarea><span class="error-text"></span></div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="tf2-rating">Rating</label>
          <input class="input" id="tf2-rating" name="rating" type="number" min="1" max="5" value="${Number(t?.rating || 5)}"></div>
        <div class="field"><label for="tf2-sort">Sort order</label>
          <input class="input" id="tf2-sort" name="sortOrder" type="number" value="${Number(t?.sort_order || 0)}"></div>
      </div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-tst-save>${isNew ? 'Add testimonial' : 'Save'}</button>`,
    onMount(box) {
      box.querySelector('[data-tst-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#tst-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.name?.trim()) { fieldError(form.elements.name, 'Name is required.'); return; }
        if (!v.body?.trim()) { fieldError(form.elements.body, 'Write the testimonial text.'); return; }
        setLoading(ev.currentTarget, true);
        try {
          const payload = { ...v, rating: Number(v.rating), sortOrder: Number(v.sortOrder) };
          if (isNew) await api.post('/admin/testimonials', payload);
          else await api.patch('/admin/testimonials', { id: t.id, ...payload });
          closeModal();
          toast('Testimonial saved.', 'success');
          renderTestimonials();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ================================================ messages & notices == */

registerPage('admin-messages', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#messages');
  host.innerHTML = skeletonRows(5);
  try {
    const { messages } = await api.get('/admin/messages');
    const search = document.querySelector('#msg-q');
    const render = () => {
      const term = (search?.value || '').toLowerCase().trim();
      const list = messages.filter((m) => !term || `${m.name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(term));
      host.innerHTML = list.length ? `<ul class="list-rows">${list.map((m) => `<li class="list-row list-row-stack">
        <div class="row-main"><strong>${esc(m.name)}</strong>
          <span class="tiny muted">${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ''} · ${esc(fmtDateTime(m.created_at))}</span>
          ${m.subject ? `<span class="tiny"><strong>${esc(m.subject)}</strong></span>` : ''}
          <p>${esc(m.message)}</p></div>
        <div class="row-actions">
          <a class="btn btn-sm btn-outline" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(`Re: ${m.subject || 'Your enquiry'}`)}">${icon('mail', 'icon-xs')} Reply by email</a>
          ${m.phone ? `<a class="btn btn-sm btn-ghost" href="https://wa.me/${esc(String(m.phone).replace(/[^\d]/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div></li>`).join('')}</ul>`
        : emptyState('No messages', 'Enquiries sent through the contact form appear here.');
    };
    search?.addEventListener('input', render);
    render();
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

registerPage('admin-notifications', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#notifications-admin');
  const load = async () => {
    host.innerHTML = skeletonRows(5);
    try {
      const { notifications } = await api.get('/admin/notifications');
      host.innerHTML = notifications.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Sent</th><th>Recipient</th><th>Title</th><th>Message</th><th>Type</th><th>Read</th></tr></thead>
        <tbody>${notifications.map((n) => `<tr><td>${esc(fmtDateTime(n.created_at))}</td>
          <td>${esc(n.user_email)}</td><td>${esc(n.title)}</td>
          <td>${esc(String(n.body).slice(0, 120))}</td><td>${esc(n.type || '')}</td>
          <td>${n.read ? badge('Read') : badge('Unread')}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No notifications sent yet', 'Fee reminders are sent automatically; you can also send announcements.');
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  document.querySelector('[data-send-notification]')?.addEventListener('click', () => openNotificationForm(''));
  await load();
});

function openNotificationForm(email) {
  modal({
    title: email ? 'Send a message to this student' : 'Send an announcement',
    body: `<form id="not-form" class="stack" novalidate>
      <div class="field"><label for="nf-aud">Audience</label>
        <select class="select" id="nf-aud" name="role">
          <option value="">Everyone (students and teachers)</option>
          <option value="student">Students only</option>
          <option value="teacher">Teachers only</option>
        </select></div>
      <div class="field"><label for="nf-email">Or a single email address</label>
        <input class="input" id="nf-email" name="email" type="email" value="${esc(email || '')}" placeholder="student@example.com">
        <span class="help">When filled in, only this person receives it.</span></div>
      <div class="field"><label for="nf-title">Title <span class="req">*</span></label>
        <input class="input" id="nf-title" name="title" required maxlength="160" value="${email ? 'Fee reminder' : ''}"><span class="error-text"></span></div>
      <div class="field"><label for="nf-body">Message <span class="req">*</span></label>
        <textarea class="textarea" id="nf-body" name="body" rows="5" required maxlength="2000">${email ? 'Assalam-u-alaikum. This is a gentle reminder that this month\'s fee is still outstanding. Please submit your payment from the student portal and the academy will verify it promptly. Jazak Allahu khairan.' : ''}</textarea>
        <span class="error-text"></span></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-not-save>Send</button>`,
    onMount(box) {
      box.querySelector('[data-not-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#not-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.title?.trim()) { fieldError(form.elements.title, 'Enter a title.'); return; }
        if (!v.body?.trim()) { fieldError(form.elements.body, 'Write the message.'); return; }
        setLoading(ev.currentTarget, true);
        try {
          const res = await api.post('/admin/notifications', { ...v, type: 'announcement' });
          closeModal();
          toast(`Sent to ${Number(res.count || 0)} recipient${Number(res.count) === 1 ? '' : 's'}.`, 'success');
          if (typeof window.__reload === 'function') window.__reload();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ========================================================== settings == */

const SETTING_GROUPS = [
  {
    title: 'Academy identity',
    help: 'Shown across the website, receipts and notifications.',
    fields: [
      ['academy_name', 'Academy name', 'text'],
      ['academy_tagline', 'Tagline', 'text'],
      ['academy_email', 'Contact email', 'email'],
      ['academy_phone', 'Phone number', 'text'],
      ['academy_whatsapp', 'WhatsApp number', 'text'],
      ['academy_address', 'Address', 'text'],
      ['currency', 'Currency code', 'text'],
    ],
  },
  {
    title: 'Bank transfer',
    help: 'Students see these details on the payment page. Leave a field empty and it stays hidden rather than being guessed.',
    fields: [
      ['bank_name', 'Bank name', 'text'],
      ['academy_account_title', 'Account title', 'text'],
      ['academy_iban', 'IBAN', 'text'],
      ['bank_account_number', 'Account number', 'text'],
    ],
  },
  {
    title: 'Mobile wallets',
    help: 'Easypaisa and JazzCash numbers used for the manual payment-proof workflow.',
    fields: [
      ['easypaisa_account', 'Easypaisa number', 'text'],
      ['easypaisa_account_title', 'Easypaisa account title', 'text'],
      ['jazzcash_account', 'JazzCash number', 'text'],
      ['jazzcash_account_title', 'JazzCash account title', 'text'],
    ],
  },
  {
    title: 'Billing rules (Pakistan time)',
    help: 'Fees are due on the due day, a grace period runs to the grace end day, and unverified accounts are suspended on the suspension day. Records are never deleted.',
    fields: [
      ['due_day', 'Due day', 'number'],
      ['grace_end_day', 'Grace period ends', 'number'],
      ['suspend_day', 'Suspension day', 'number'],
    ],
  },
  {
    title: 'Social media',
    help: 'Only links you enter are shown in the footer. Nothing is invented.',
    fields: [
      ['facebook_url', 'Facebook URL', 'url'],
      ['instagram_url', 'Instagram URL', 'url'],
      ['youtube_url', 'YouTube URL', 'url'],
      ['tiktok_url', 'TikTok URL', 'url'],
    ],
  },
];

registerPage('admin-settings', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#settings');
  host.innerHTML = skeletonRows(6);
  const load = async () => {
    try {
      const d = await api.get('/admin/settings');
      const s = d.settings || {};
      host.innerHTML = `
        <form id="set-form" class="stack">
          ${SETTING_GROUPS.map((g) => `<section class="panel">
            <header class="panel-head"><h2>${esc(g.title)}</h2></header>
            <div class="panel-body">
              <p class="muted tiny">${esc(g.help)}</p>
              <div class="grid grid-cols-2 mt-4">
                ${g.fields.map(([key, label, type]) => `<div class="field">
                  <label for="set-${key}">${esc(label)}</label>
                  <input class="input" id="set-${key}" name="${key}" type="${type}"
                    ${type === 'number' ? 'min="1" max="28"' : ''} value="${esc(s[key] ?? '')}"
                    ${type === 'url' ? 'placeholder="https://…"' : ''}>
                  ${s[key] ? '' : '<span class="help">Not set — hidden from the website.</span>'}
                </div>`).join('')}
              </div>
            </div></section>`).join('')}
          <div class="sticky-actions">
            <button type="submit" class="btn btn-primary">${icon('check', 'icon-xs')} Save settings</button>
            <span class="tiny muted">The administrator key and JWT secret live in <span class="mono">server/.env</span> and can never be edited from this screen.</span>
          </div>
        </form>

        <section class="panel">
          <header class="panel-head"><h2>Payment methods</h2></header>
          <div class="panel-body"><div class="stack">
            ${(d.paymentMethods || []).map((m) => `<form class="method-row" data-method="${esc(m.code)}">
              <div class="method-row-head"><strong>${esc(m.name)}</strong>
                <label class="switch"><input type="checkbox" name="enabled"${m.enabled ? ' checked' : ''}><span></span>
                <span class="tiny">${m.enabled ? 'Enabled' : 'Disabled'}</span></label></div>
              <div class="grid grid-cols-2">
                <div class="field"><label for="mth-${esc(m.code)}-acct">Account detail shown to students</label>
                  <input class="input" id="mth-${esc(m.code)}-acct" name="accountDetail" maxlength="300" value="${esc(m.account_detail || '')}"></div>
                <div class="field"><label for="mth-${esc(m.code)}-ins">Instructions</label>
                  <input class="input" id="mth-${esc(m.code)}-ins" name="instructions" maxlength="1000" value="${esc(m.instructions || '')}"></div>
              </div>
              <button type="submit" class="btn btn-sm btn-outline">Save ${esc(m.name)}</button>
            </form>`).join('')}
          </div></div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Integration status</h2></header>
          <div class="panel-body">${configPanel(d.config)}</div>
        </section>`;

      document.querySelector('#set-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.currentTarget.querySelector('[type=submit]');
        const v = formValues(e.currentTarget);
        setLoading(btn, true);
        try {
          await api.patch('/admin/settings', v);
          toast('Settings saved.', 'success');
          await load();
          await window.SUQ.applyPublicSettings();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(btn, false);
        }
      });
      host.querySelectorAll('.method-row').forEach((form) => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = form.querySelector('[type=submit]');
          const v = formValues(form);
          setLoading(btn, true);
          try {
            await api.patch('/admin/payment-methods', { code: form.dataset.method, ...v });
            toast('Payment method updated.', 'success');
            await load();
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            setLoading(btn, false);
          }
        });
      });
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  await load();
});

function configPanel(config) {
  if (!config) return '<p class="muted tiny">Status unavailable.</p>';
  const row = (label, ok, note) => `<li class="config-row">
    <span class="icon-badge ${ok ? 'is-ok' : 'is-missing'}">${icon(ok ? 'checkCircle' : 'alert')}</span>
    <div><strong>${esc(label)}</strong>${note ? `<p class="tiny muted">${esc(note)}</p>` : ''}</div>
    <span class="badge badge-${ok ? 'success' : 'warning'}">${ok ? 'Configured' : 'Not set'}</span></li>`;
  return `<ul class="config-list">
    ${(config.settings || []).map((s) => row(s.label, s.configured, s.configured ? '' : `Add it in ${s.where}`)).join('')}
    ${(config.gateways || []).map((g) => row(g.label, g.configured,
      g.configured ? 'Merchant credentials found in the server environment.'
        : `Missing environment variables: ${(g.missing || []).join(', ')}. Fallback in use: ${g.fallback}.`)).join('')}
    ${(config.secrets || []).map((s) => row(s.key, s.configured, `Set in ${s.where}`)).join('')}
  </ul>`;
}

/* ============================================================= audit == */

registerPage('admin-audit', async () => {
  const me = await initPortal('admin');
  if (!me) return;
  const host = document.querySelector('#audit');
  const load = async () => {
    host.innerHTML = skeletonRows(6);
    try {
      const d = await api.get(`/admin/audit${qsParams({ q: toolbarValue('#au-q'), action: toolbarValue('#au-action') })}`);
      const sel = document.querySelector('#au-action');
      if (sel && sel.options.length <= 1) {
        sel.innerHTML = '<option value="">All actions</option>' + (d.actions || []).map((a) => `<option value="${esc(a)}">${esc(a.replace(/_/g, ' '))}</option>`).join('');
      }
      host.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${(d.logs || []).length ? d.logs.map((l) => `<tr>
          <td>${esc(fmtDateTime(l.created_at))}</td><td>${esc(l.actor || '')}</td>
          <td><span class="badge badge-info">${esc(String(l.action).replace(/_/g, ' '))}</span></td>
          <td class="tiny">${esc(auditDetails(l.details, 220))}</td></tr>`).join('')
          : `<tr><td colspan="4">${emptyState('No audit entries', 'Administrator actions are recorded here automatically.')}</td></tr>`}
      </tbody></table></div>`;
    } catch (err) {
      host.innerHTML = errorState(err.message);
    }
  };
  window.__reload = load;
  document.querySelector('#au-q')?.addEventListener('input', debounce(load, 350));
  document.querySelector('#au-action')?.addEventListener('change', load);
  await load();
});

window.SUQAdmin = { loadRefs, openPaymentReview, openNotificationForm, refreshAdminPage };
})();
