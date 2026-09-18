/* =============================================================================
   teacher.js — teacher portal: dashboard, assigned students, scheduling,
   attendance marking, progress updates.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, esc, icon, badge, avatar, toast, modal, closeModal, setLoading,
  formValues, clearFieldErrors, fieldError, fmtDate, fmtDateTime, fmtDay, fmtTime,
  emptyState, errorState, skeletonRows, registerPage, pkNow, monthLabel, money,
} = window.SUQ;
const { donutChart, barChart } = window.SUQCharts;
const { initPortal, setUnread, setUnreadChat } = window.SUQPortal;
const { classRow, tone } = window.SUQStudent;

let cache = { enrollments: [], classes: [] };

/* --------------------------------------------------------- dashboard ----- */

registerPage('teacher-dashboard', async () => {
  const me = await initPortal('teacher');
  if (!me) return;
  const host = document.querySelector('#dash');
  host.innerHTML = skeletonRows(5);
  await renderTeacherDashboard(host);
});

async function renderTeacherDashboard(host) {
  try {
    const d = await api.get('/teacher/dashboard');
    cache.enrollments = d.enrollments || [];
    cache.classes = d.classes || [];
    setUnread(d.unreadNotifications);
    setUnreadChat(d.unreadMessages);
    const att = (d.attendance || []).reduce((acc, a) => (acc[a.status] = (acc[a.status] || 0) + 1, acc), {});
    const attended = (att.Present || 0) + (att.Late || 0);
    const marked = Object.values(att).reduce((a, b) => a + b, 0);
    const byStudent = {};
    (d.attendance || []).forEach((a) => {
      const key = a.student_name || a.student_email || '—';
      byStudent[key] = byStudent[key] || { attended: 0, total: 0 };
      byStudent[key].total += 1;
      if (a.status === 'Present' || a.status === 'Late') byStudent[key].attended += 1;
    });

    host.innerHTML = `
      <div class="stat-grid">
        <article class="stat-card"><span class="icon-badge">${icon('users')}</span>
          <div><small>Active students</small><strong>${Number(d.stats?.students || 0)}</strong>
          <span class="tiny muted">${Number(d.stats?.totalStudents || 0)} assigned in total</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('calendar')}</span>
          <div><small>Classes today</small><strong>${(d.todayClasses || []).length}</strong>
          <span class="tiny muted">${Number(d.stats?.scheduled || 0)} scheduled overall</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('checkCircle')}</span>
          <div><small>Classes completed</small><strong>${Number(d.stats?.completed || 0)}</strong>
          <span class="tiny muted">${Number(d.stats?.attendanceMarked || 0)} attendance records</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('chart')}</span>
          <div><small>Attendance rate</small><strong>${marked ? Math.round((attended / marked) * 100) : 0}%</strong>
          <span class="tiny muted">Present and Late count as attended</span></div></article>
      </div>

      <div class="panel-grid">
        <section class="panel panel-wide">
          <header class="panel-head"><h2>Today's classes</h2>
            <button type="button" class="btn btn-sm btn-primary" data-schedule-class>${icon('plus', 'icon-xs')} Schedule a class</button></header>
          <div class="panel-body">
            <ul class="list-rows">${(d.todayClasses || []).map((c) => teacherClassRow(c)).join('')
              || `<li>${emptyState('No classes today', 'Schedule a class for one of your students, or check the upcoming list below.')}</li>`}</ul>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Upcoming</h2>
            <a class="link-arrow" href="classes.html">All classes ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><ul class="list-rows">${(d.upcoming || []).slice(0, 6).map((c) => teacherClassRow(c)).join('')
            || `<li>${emptyState('Nothing scheduled', 'Upcoming classes will appear here.')}</li>`}</ul></div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Attendance mix</h2></header>
          <div class="panel-body">${donutChart([
            { label: 'Present', value: att.Present || 0, color: 'var(--green-600)' },
            { label: 'Late', value: att.Late || 0, color: 'var(--gold-600)' },
            { label: 'Leave', value: att.Leave || 0, color: 'var(--blue-500)' },
            { label: 'Absent', value: att.Absent || 0, color: 'var(--red-600)' },
          ], { centerValue: String(marked), centerLabel: 'marked', emptyText: 'No attendance marked yet' })}</div>
        </section>

        <section class="panel panel-wide">
          <header class="panel-head"><h2>My students</h2>
            <a class="link-arrow" href="teacher-students.html">Manage students ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body"><div class="table-wrap"><table class="table">
            <thead><tr><th>Student</th><th>Course</th><th>Timing</th><th>Progress</th><th>Attendance</th><th>Status</th><th class="ta-right">Actions</th></tr></thead>
            <tbody>${(d.enrollments || []).map((e) => {
              const s = byStudent[e.student_name] || { attended: 0, total: 0 };
              const pct = s.total ? Math.round((s.attended / s.total) * 100) : Number(e.attendance || 0);
              return `<tr>
                <td><div class="cell-user">${avatar(e.student_name, e.avatar)}<div><strong>${esc(e.student_name)}</strong>
                  <span class="tiny muted">${esc(e.email)}</span></div></div></td>
                <td>${esc(e.course)}</td>
                <td>${esc(e.timing || '—')}<span class="tiny muted block">${esc(e.days || '')}</span></td>
                <td><div class="progress"><span style="width:${Math.max(0, Math.min(100, Number(e.progress || 0)))}%"></span></div>
                  <span class="tiny muted">${Number(e.progress || 0)}%</span></td>
                <td>${pct}%</td>
                <td>${badge(e.status)}</td>
                <td class="ta-right"><div class="row-actions">
                  <button type="button" class="btn btn-sm btn-ghost" data-student-detail="${e.id}">View</button>
                  <button type="button" class="btn btn-sm btn-outline" data-edit-progress="${e.id}">Progress</button>
                </div></td></tr>`;
            }).join('') || `<tr><td colspan="7">${emptyState('No students assigned yet', 'The academy administrator assigns students to teachers. You will be notified when a student is assigned to you.')}</td></tr>`}
          </tbody></table></div></div>
        </section>
      </div>`;
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
}

function teacherClassRow(c) {
  const canJoin = c.status === 'scheduled' || c.status === 'live';
  const canMark = c.status === 'completed' || c.status === 'live' || c.status === 'scheduled';
  return `<li class="list-row">
    <span class="row-date"><strong>${esc(fmtDay(c.starts_at))}</strong><small>${esc(fmtTime(c.starts_at))}</small></span>
    <div class="row-main"><strong>${esc(c.student_name || 'Student')}</strong>
      <span class="tiny muted">${esc(c.topic || c.course || '')}</span></div>
    <span class="badge badge-${tone(c.status)}">${esc(c.status)}</span>
    <div class="row-actions">
      ${canJoin ? `<button type="button" class="btn btn-sm btn-primary" data-join-class="${c.id}">${icon('video', 'icon-xs')} Start</button>` : ''}
      ${canMark ? `<button type="button" class="btn btn-sm btn-outline" data-mark-attendance="${c.id}" data-student="${esc(c.student_name || '')}">Attendance</button>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-edit-class="${c.id}">Edit</button>
    </div></li>`;
}

/* --------------------------------------------------- students page ------- */

registerPage('teacher-students', async () => {
  const me = await initPortal('teacher');
  if (!me) return;
  const host = document.querySelector('#students');
  host.innerHTML = skeletonRows(6);
  try {
    const d = await api.get('/teacher/dashboard');
    cache.enrollments = d.enrollments || [];
    const search = document.querySelector('#student-search');
    const statusSel = document.querySelector('#student-status');
    const render = () => {
      const term = (search?.value || '').toLowerCase().trim();
      const status = statusSel?.value || '';
      const list = cache.enrollments.filter((e) => (!term || `${e.student_name} ${e.email} ${e.course}`.toLowerCase().includes(term))
        && (!status || e.status === status));
      host.innerHTML = list.length ? `<div class="grid grid-cols-3">${list.map((e) => `
        <article class="panel student-card">
          <div class="student-card-head">${avatar(e.student_name, e.avatar, 'avatar-lg')}
            <div><strong>${esc(e.student_name)}</strong><span class="tiny muted">${esc(e.email)}</span>
            ${badge(e.status)}</div></div>
          <dl class="kv kv-tight">
            <div><dt>Course</dt><dd>${esc(e.course)}</dd></div>
            <div><dt>Level</dt><dd>${esc(e.level || '—')}</dd></div>
            <div><dt>Timing</dt><dd>${esc(e.timing || '—')}</dd></div>
            <div><dt>Days</dt><dd>${esc(e.days || '—')}</dd></div>
          </dl>
          <div class="progress"><span style="width:${Math.max(0, Math.min(100, Number(e.progress || 0)))}%"></span></div>
          <p class="tiny muted">Progress ${Number(e.progress || 0)}%</p>
          <div class="btn-row btn-row-tight">
            <button type="button" class="btn btn-sm btn-primary" data-student-detail="${e.id}">Open record</button>
            <button type="button" class="btn btn-sm btn-outline" data-schedule-for="${e.id}">Schedule</button>
            <a class="btn btn-sm btn-ghost" href="chat.html?with=${encodeURIComponent(e.email)}">Message</a>
          </div>
        </article>`).join('')}</div>`
        : emptyState('No students match', 'Adjust the search or status filter to see your assigned students.');
    };
    search?.addEventListener('input', render);
    statusSel?.addEventListener('change', render);
    render();
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* ------------------------------------------------------ student detail --- */

async function openStudentDetail(id) {
  const box = modal({ title: 'Student record', wide: true, body: `<div class="stack">${skeletonRows(5)}</div>` });
  try {
    const d = await api.get(`/teacher/students/detail?id=${encodeURIComponent(id)}`);
    const e = d.enrollment || d.student || {};
    const att = (d.attendance || []);
    const summary = att.reduce((acc, a) => (acc[a.status] = (acc[a.status] || 0) + 1, acc), {});
    const attended = (summary.Present || 0) + (summary.Late || 0);
    box.querySelector('.modal-body').innerHTML = `
      <div class="detail-head">${avatar(e.student_name || d.student?.name, d.student?.avatar, 'avatar-lg')}
        <div><h3>${esc(e.student_name || d.student?.name || 'Student')}</h3>
          <p class="tiny muted">${esc(d.student?.email || e.email || '')}${d.student?.phone ? ` · ${esc(d.student.phone)}` : ''}</p>
          ${badge(e.status || 'Active')}</div></div>
      <dl class="kv kv-3 mt-4">
        <div><dt>Course</dt><dd>${esc(e.course || '—')}</dd></div>
        <div><dt>Level</dt><dd>${esc(e.level || '—')}</dd></div>
        <div><dt>Timing</dt><dd>${esc(e.timing || '—')}</dd></div>
        <div><dt>Days</dt><dd>${esc(e.days || '—')}</dd></div>
        <div><dt>Guardian</dt><dd>${esc(e.guardian_name || '—')}</dd></div>
        <div><dt>Attendance</dt><dd>${att.length ? Math.round((attended / att.length) * 100) : 0}% of ${att.length}</dd></div>
      </dl>
      ${e.notes ? `<div class="alert alert-info mt-4">${icon('info')}<div><strong>Teacher notes</strong><p>${esc(e.notes)}</p></div></div>` : ''}
      <h4 class="mt-5">Recent classes</h4>
      <ul class="list-rows">${(d.classes || []).slice(0, 8).map((c) => `<li class="list-row">
        <span class="row-date"><strong>${esc(fmtDay(c.starts_at))}</strong><small>${esc(fmtTime(c.starts_at))}</small></span>
        <div class="row-main"><strong>${esc(c.topic || 'Class')}</strong>
          <span class="tiny muted">${esc(c.notes || '')}</span></div>
        <span class="badge badge-${tone(c.status)}">${esc(c.status)}</span></li>`).join('')
        || `<li class="muted tiny">No classes recorded yet.</li>`}</ul>
      <h4 class="mt-5">Attendance history</h4>
      <ul class="list-rows">${att.slice(0, 10).map((a) => `<li class="list-row">
        <span class="row-date"><strong>${esc(fmtDate(a.date || a.created_at))}</strong></span>
        <div class="row-main"><span class="tiny muted">${esc(a.notes || '')}</span></div>
        ${badge(a.status)}</li>`).join('') || `<li class="muted tiny">No attendance marked yet.</li>`}`;
    box.querySelector('.modal').insertAdjacentHTML('beforeend', `<div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-modal-close>Close</button>
      <button type="button" class="btn btn-outline" data-schedule-for="${esc(String(e.id || id))}">Schedule class</button>
      <button type="button" class="btn btn-primary" data-edit-progress="${esc(String(e.id || id))}">Update progress</button></div>`);
  } catch (err) {
    box.querySelector('.modal-body').innerHTML = errorState(err.message);
  }
}

/* ------------------------------------------------------ progress edit --- */

function openProgressModal(enrollmentId) {
  const e = cache.enrollments.find((x) => String(x.id) === String(enrollmentId)) || {};
  modal({
    title: 'Update student progress',
    subtitle: e.student_name ? `${e.student_name} · ${e.course || ''}` : '',
    body: `<form id="prog-form" class="stack" novalidate>
      <div class="field"><label for="pg-progress">Progress (%)</label>
        <input class="input" id="pg-progress" name="progress" type="number" min="0" max="100" value="${Number(e.progress || 0)}">
        <span class="help">Share of the course syllabus completed.</span></div>
      <div class="field"><label for="pg-level">Level</label>
        <input class="input" id="pg-level" name="level" maxlength="60" value="${esc(e.level || '')}" placeholder="e.g. Para 5, Beginner"></div>
      <div class="field"><label for="pg-status">Enrollment status</label>
        <select class="select" id="pg-status" name="status">
          <option value="Active"${e.status === 'Active' ? ' selected' : ''}>Active</option>
          <option value="Completed"${e.status === 'Completed' ? ' selected' : ''}>Completed</option>
        </select>
        <span class="help">Marking a course completed keeps every record intact.</span></div>
      <div class="field"><label for="pg-notes">Teacher notes</label>
        <textarea class="textarea" id="pg-notes" name="notes" rows="4" maxlength="1500">${esc(e.notes || '')}</textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-prog-save>Save</button>`,
    onMount(box) {
      box.querySelector('[data-prog-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#prog-form');
        const v = formValues(form);
        setLoading(ev.currentTarget, true);
        try {
          await api.patch('/teacher/enrollments', {
            id: Number(enrollmentId),
            progress: Number(v.progress),
            level: v.level,
            notes: v.notes,
            status: v.status,
          });
          closeModal();
          toast('Progress saved.', 'success');
          reloadPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* --------------------------------------------------- schedule a class --- */

function openScheduleModal(enrollmentId) {
  const options = cache.enrollments.filter((e) => e.status === 'Active' || e.status === 'Approved');
  const list = options.length ? options : cache.enrollments;
  modal({
    title: 'Schedule a class',
    subtitle: 'Times are Pakistan Standard Time (Asia/Karachi).',
    body: `<form id="sched-form" class="stack" novalidate>
      <div class="field"><label for="sc-student">Student <span class="req">*</span></label>
        <select class="select" id="sc-student" name="enrollmentId" required>
          ${list.map((e) => `<option value="${e.id}"${String(e.id) === String(enrollmentId) ? ' selected' : ''}>${esc(e.student_name)} — ${esc(e.course)}</option>`).join('')
            || '<option value="">No students assigned</option>'}
        </select><span class="error-text"></span></div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="sc-date">Date <span class="req">*</span></label>
          <input class="input" id="sc-date" name="date" type="date" value="${esc(pkNow().date)}" required><span class="error-text"></span></div>
        <div class="field"><label for="sc-time">Start time <span class="req">*</span></label>
          <input class="input" id="sc-time" name="time" type="time" value="${esc(pkNow().time)}" required><span class="error-text"></span></div>
      </div>
      <div class="field"><label for="sc-dur">Duration (minutes)</label>
        <input class="input" id="sc-dur" name="duration" type="number" min="10" max="180" step="5" value="30"></div>
      <div class="field"><label for="sc-topic">Topic</label>
        <input class="input" id="sc-topic" name="topic" maxlength="200" placeholder="e.g. Surah Al-Mulk, verses 1–10"></div>
      <div class="field"><label for="sc-notes">Notes</label>
        <textarea class="textarea" id="sc-notes" name="notes" rows="3" maxlength="800"></textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-sched-save>Schedule class</button>`,
    onMount(box) {
      box.querySelector('[data-sched-save]').addEventListener('click', async (ev) => {
        const form = box.querySelector('#sched-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.enrollmentId) { fieldError(form.elements.enrollmentId, 'Choose a student.'); return; }
        if (!v.date || !v.time) { toast('Choose the date and start time.', 'warning'); return; }
        const startsAt = `${v.date} ${v.time}`;
        const end = new Date(`${v.date}T${v.time}:00Z`);
        end.setUTCMinutes(end.getUTCMinutes() + (Number(v.duration) || 30));
        const endsAt = `${end.toISOString().slice(0, 10)} ${end.toISOString().slice(11, 16)}`;
        setLoading(ev.currentTarget, true);
        try {
          await api.post('/classes', {
            enrollmentId: Number(v.enrollmentId), startsAt, endsAt, topic: v.topic, notes: v.notes,
          });
          closeModal();
          toast('Class scheduled and the student has been notified.', 'success');
          reloadPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* -------------------------------------------------- attendance marking -- */

function openAttendanceModal(classId, studentName) {
  modal({
    title: 'Mark attendance',
    subtitle: studentName ? `${studentName} · class #${classId}` : `Class #${classId}`,
    body: `<form id="att-form" class="stack" novalidate>
      <div class="field"><label>Attendance status <span class="req">*</span></label>
        <div class="segmented" role="radiogroup" aria-label="Attendance status">
          ${['Present', 'Late', 'Leave', 'Absent'].map((s, i) => `<label class="seg">
            <input type="radio" name="status" value="${s}"${i === 0 ? ' checked' : ''}><span>${s}</span></label>`).join('')}
        </div></div>
      <div class="field"><label for="at-notes">Notes</label>
        <textarea class="textarea" id="at-notes" name="notes" rows="3" maxlength="500" placeholder="Recitation quality, homework, punctuality…"></textarea></div>
      <p class="tiny muted">Marking attendance also closes the class as completed. Present and Late both count as attended.</p>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-att-save>Save attendance</button>`,
    onMount(box) {
      box.querySelector('[data-att-save]').addEventListener('click', async (ev) => {
        const v = formValues(box.querySelector('#att-form'));
        setLoading(ev.currentTarget, true);
        try {
          const res = await api.post('/teacher/attendance', { classId: Number(classId), status: v.status, notes: v.notes });
          closeModal();
          toast(`Attendance saved. Student attendance is now ${res.percentage}%.`, 'success');
          reloadPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ------------------------------------------------------- edit a class --- */

function openClassEditModal(classId) {
  const c = (cache.classes || []).find((x) => String(x.id) === String(classId)) || {};
  const stamp = String(c.starts_at || '').replace(' ', 'T');
  modal({
    title: 'Update class',
    body: `<form id="cls-form" class="stack" novalidate>
      <div class="grid grid-cols-2">
        <div class="field"><label for="ce-date">Date</label>
          <input class="input" id="ce-date" name="date" type="date" value="${esc(stamp.slice(0, 10) || pkNow().date)}"></div>
        <div class="field"><label for="ce-time">Start time</label>
          <input class="input" id="ce-time" name="time" type="time" value="${esc(stamp.slice(11, 16) || pkNow().time)}"></div>
      </div>
      <div class="field"><label for="ce-status">Status</label>
        <select class="select" id="ce-status" name="status">
          ${['scheduled', 'live', 'completed', 'cancelled'].map((s) => `<option value="${s}"${c.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select></div>
      <div class="field"><label for="ce-topic">Topic</label>
        <input class="input" id="ce-topic" name="topic" maxlength="200" value="${esc(c.topic || '')}"></div>
      <div class="field"><label for="ce-notes">Notes</label>
        <textarea class="textarea" id="ce-notes" name="notes" rows="3" maxlength="800">${esc(c.notes || '')}</textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-cls-save>Save</button>`,
    onMount(box) {
      box.querySelector('[data-cls-save]').addEventListener('click', async (ev) => {
        const v = formValues(box.querySelector('#cls-form'));
        setLoading(ev.currentTarget, true);
        try {
          await api.patch('/teacher/classes', {
            id: Number(classId), status: v.status, topic: v.topic, notes: v.notes,
          });
          closeModal();
          toast('Class updated.', 'success');
          reloadPage();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(ev.currentTarget, false);
        }
      });
    },
  });
}

/* ------------------------------------------------------------ wiring ---- */

function reloadPage() {
  const page = document.body.dataset.page;
  if (page === 'teacher-dashboard') {
    const host = document.querySelector('#dash');
    host.innerHTML = skeletonRows(5);
    renderTeacherDashboard(host);
  } else {
    location.reload();
  }
}

document.addEventListener('click', (e) => {
  const detail = e.target.closest('[data-student-detail]');
  if (detail) { openStudentDetail(detail.dataset.studentDetail); return; }
  const prog = e.target.closest('[data-edit-progress]');
  if (prog) { closeModal(); openProgressModal(prog.dataset.editProgress); return; }
  const sched = e.target.closest('[data-schedule-for]');
  if (sched) { closeModal(); openScheduleModal(sched.dataset.scheduleFor); return; }
  if (e.target.closest('[data-schedule-class]')) { openScheduleModal(''); return; }
  const att = e.target.closest('[data-mark-attendance]');
  if (att) { openAttendanceModal(att.dataset.markAttendance, att.dataset.student); return; }
  const cls = e.target.closest('[data-edit-class]');
  if (cls) { openClassEditModal(cls.dataset.editClass); }
});

window.SUQTeacher = { cache, openScheduleModal, openAttendanceModal, openClassEditModal, teacherClassRow };
})();
