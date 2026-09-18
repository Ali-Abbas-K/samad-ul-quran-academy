/* =============================================================================
   portal.js — pages shared by the student and teacher portals:
   class schedule, live classroom, messaging, attendance record, notifications.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, auth, esc, icon, badge, avatar, toast, setLoading, formValues, fmtDate,
  fmtDateTime, fmtDay, fmtTime, relTime, emptyState, errorState, skeletonRows,
  registerPage, qs, monthLabel, modal, closeModal,
} = window.SUQ;
const { donutChart, barChart } = window.SUQCharts;
const { initPortal, setUnreadChat } = window.SUQPortal;
const { tone } = window.SUQStudent;

/** Both portals share these pages; the signed-in role decides what is shown. */
function currentRole() {
  const role = auth.role || 'student';
  return role === 'teacher' ? 'teacher' : 'student';
}

/* Shared pages serve both portals; expose the live role to CSS so the
   sidebar can show the correct navigation without an inline script. */
if (document.body && !document.body.dataset.role) {
  document.body.dataset.role = currentRole();
}

function portalHome(role) {
  return role === 'teacher' ? 'teacher-dashboard.html' : 'student-dashboard.html';
}

/* ----------------------------------------------------------- classes ----- */

registerPage('classes', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const host = document.querySelector('#classes');
  host.innerHTML = skeletonRows(6);
  try {
    const { classes } = await api.get('/classes');
    const isTeacher = role === 'teacher';
    const statusSel = document.querySelector('#class-status');
    const search = document.querySelector('#class-search');
    const render = () => {
      const status = statusSel?.value || '';
      const term = (search?.value || '').toLowerCase().trim();
      const list = classes.filter((c) => (!status || c.status === status)
        && (!term || `${c.topic || ''} ${c.course || ''} ${c.student_name || ''} ${c.teacher_name || ''}`.toLowerCase().includes(term)));
      const groups = new Map();
      list.forEach((c) => {
        const key = String(c.starts_at || '').slice(0, 10);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      });
      host.innerHTML = list.length
        ? Array.from(groups.entries()).map(([day, items]) => `<section class="day-group">
            <h3 class="day-heading">${esc(fmtDate(`${day} 00:00`))}</h3>
            <ul class="list-rows">${items.map((c) => (isTeacher
              ? window.SUQTeacher.teacherClassRow(c)
              : window.SUQStudent.classRow(c, { who: c.teacher_name }))).join('')}</ul></section>`).join('')
        : emptyState('No classes to show', isTeacher
          ? 'Schedule a class from your dashboard, or clear the filters.'
          : 'Your teacher has not scheduled classes matching these filters yet.');
    };
    statusSel?.addEventListener('change', render);
    search?.addEventListener('input', render);
    render();
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* --------------------------------------------------------- classroom ---- */

registerPage('classroom', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const host = document.querySelector('#classroom');
  const id = qs('id');
  if (!id) { location.replace('classes.html'); return; }
  host.innerHTML = `<div class="meet-loading">${skeletonRows(2)}<p class="muted">Preparing your private classroom…</p></div>`;
  try {
    const d = await api.get(`/classes/join?id=${encodeURIComponent(id)}`);
    const c = d.class || {};
    host.innerHTML = `
      <div class="meet-head">
        <div><h1>${esc(c.topic || c.course || 'Qur\'an class')}</h1>
          <p class="tiny muted">${esc(fmtDateTime(c.starts_at))} (Pakistan time) ·
          ${esc(role === 'teacher' ? c.student_name || 'Student' : c.teacher_name || 'Teacher')} ·
          room <span class="mono">${esc(d.room)}</span></p></div>
        <div class="btn-row btn-row-tight">
          <a class="btn btn-outline btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">${icon('external', 'icon-xs')} Open in a new tab</a>
          <a class="btn btn-ghost btn-sm" href="classes.html">Leave</a>
        </div>
      </div>
      <div class="meet-frame-wrap">
        <iframe class="meet-frame" src="${esc(d.url)}" title="Live Qur'an classroom"
          allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
          allowfullscreen></iframe>
      </div>
      <div class="meet-notes">
        <div class="alert alert-info">${icon('info')}<div><strong>Classroom tips</strong>
          <p>Allow the browser to use your microphone and camera. If the video does not appear, open the classroom in a new tab. Both of you must use the same room link, which is generated for this enrollment only.</p></div></div>
        ${role === 'teacher' ? `<button type="button" class="btn btn-primary" data-mark-attendance="${esc(String(c.id || id))}" data-student="${esc(c.student_name || '')}">${icon('check')} Mark attendance for this class</button>` : ''}
      </div>`;
  } catch (err) {
    host.innerHTML = err.status === 403
      ? `<div class="alert alert-warning">${icon('alert')}<div><strong>Classroom locked</strong><p>${esc(err.message)}</p>
         <a class="btn btn-sm btn-gold mt-3" href="payments.html">Submit fee payment</a></div></div>`
      : errorState(err.message);
  }
});

/* --------------------------------------------------------------- chat --- */

let chatState = { with: '', timer: 0, contacts: [] };

registerPage('chat', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const listHost = document.querySelector('#chat-contacts');
  const threadHost = document.querySelector('#chat-thread');
  listHost.innerHTML = skeletonRows(4);

  const renderContacts = () => {
    listHost.innerHTML = chatState.contacts.length ? chatState.contacts.map((c) => `
      <button type="button" class="chat-contact${c.email === chatState.with ? ' is-active' : ''}" data-chat-with="${esc(c.email)}">
        ${avatar(c.name, c.avatar)}
        <span class="chat-contact-main"><strong>${esc(c.name || c.email)}</strong>
          <small>${esc(c.last_message ? c.last_message.slice(0, 46) : window.SUQPortal.roleLabel(c.role))}</small></span>
        ${Number(c.unread) ? `<span class="pill-count">${Number(c.unread)}</span>` : ''}
      </button>`).join('')
      : `<p class="muted tiny p-4">${role === 'teacher'
        ? 'Students assigned to you will appear here.'
        : 'Your assigned teacher will appear here once the academy approves your admission.'}</p>`;
  };

  const renderThread = async (email) => {
    chatState.with = email;
    renderContacts();
    threadHost.innerHTML = skeletonRows(4);
    try {
      const { messages } = await api.get(`/chat?with=${encodeURIComponent(email)}`);
      const contact = chatState.contacts.find((c) => c.email === email) || { name: email };
      threadHost.innerHTML = `
        <header class="chat-head">${avatar(contact.name, contact.avatar)}
          <div><strong>${esc(contact.name || email)}</strong>
          <span class="tiny muted">${esc(window.SUQPortal.roleLabel(contact.role))}</span></div></header>
        <div class="chat-scroll" id="chat-scroll">${messages.length ? messages.map((m) => `
          <div class="bubble ${m.sender_role === role ? 'is-me' : 'is-them'}">
            <p>${esc(m.message)}</p><time>${esc(relTime(m.created_at))}</time></div>`).join('')
          : `<p class="muted tiny ta-center">No messages yet. Send the first salaam.</p>`}</div>
        <form class="chat-form" id="chat-form">
          <label class="sr-only" for="chat-input">Message</label>
          <input class="input" id="chat-input" name="message" maxlength="1500" autocomplete="off" placeholder="Write a message…" required>
          <button class="btn btn-primary" type="submit">${icon('chat')} Send</button>
        </form>`;
      const scroll = document.querySelector('#chat-scroll');
      scroll.scrollTop = scroll.scrollHeight;
      document.querySelector('#chat-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const input = document.querySelector('#chat-input');
        const text = input.value.trim();
        if (!text) return;
        const btn = ev.currentTarget.querySelector('button');
        setLoading(btn, true);
        try {
          await api.post('/chat', { with: email, message: text });
          input.value = '';
          await renderThread(email);
        } catch (err) {
          if (err.status === 403) toast(err.message, 'warning');
          else toast(err.message, 'error');
        } finally {
          setLoading(btn, false);
        }
      });
      await loadContacts(false);
    } catch (err) {
      threadHost.innerHTML = err.status === 403
        ? `<div class="alert alert-warning">${icon('alert')}<div><strong>Messaging paused</strong><p>${esc(err.message)}</p>
           <a class="btn btn-sm btn-gold mt-3" href="payments.html">Submit fee payment</a></div></div>`
        : errorState(err.message);
    }
  };

  async function loadContacts(selectFirst = true) {
    try {
      const { contacts } = await api.get('/chat/contacts');
      chatState.contacts = contacts || [];
      setUnreadChat(chatState.contacts.reduce((sum, c) => sum + Number(c.unread || 0), 0));
      renderContacts();
      if (selectFirst) {
        const preset = qs('with');
        const target = chatState.contacts.find((c) => c.email === preset) || chatState.contacts[0];
        if (target) await renderThread(target.email);
        else {
          threadHost.innerHTML = emptyState('No conversation yet',
            role === 'teacher' ? 'Messaging opens once students are assigned to you.'
              : 'Messaging opens once the academy assigns your teacher.');
        }
      }
    } catch (err) {
      listHost.innerHTML = `<p class="muted tiny p-4">${esc(err.message)}</p>`;
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chat-with]');
    if (btn) renderThread(btn.dataset.chatWith);
  });

  await loadContacts(true);

  chatState.timer = setInterval(() => {
    if (document.visibilityState === 'visible' && chatState.with) {
      api.get('/chat/contacts').then(({ contacts }) => {
        chatState.contacts = contacts || [];
        setUnreadChat(chatState.contacts.reduce((sum, c) => sum + Number(c.unread || 0), 0));
        renderContacts();
      }).catch(() => {});
    }
  }, 20000);
  window.addEventListener('beforeunload', () => clearInterval(chatState.timer));
});

/* --------------------------------------------------------- attendance -- */

registerPage('attendance', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const host = document.querySelector('#attendance');
  host.innerHTML = skeletonRows(6);
  try {
    const d = role === 'teacher' ? await api.get('/teacher/dashboard') : await api.get('/student/dashboard');
    const records = d.attendance || [];
    const summary = records.reduce((acc, a) => (acc[a.status] = (acc[a.status] || 0) + 1, acc), {});
    const attended = (summary.Present || 0) + (summary.Late || 0);
    const pct = records.length ? Math.round((attended / records.length) * 100) : 0;
    const months = {};
    records.forEach((a) => {
      const key = String(a.date || a.created_at || '').slice(0, 7);
      if (!key) return;
      months[key] = months[key] || { attended: 0, total: 0 };
      months[key].total += 1;
      if (a.status === 'Present' || a.status === 'Late') months[key].attended += 1;
    });
    const trend = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([k, v]) => ({ label: monthLabel(k).split(' ')[0].slice(0, 3), value: Math.round((v.attended / v.total) * 100) }));

    host.innerHTML = `
      <div class="panel-grid">
        <section class="panel"><header class="panel-head"><h2>Attendance summary</h2></header>
          <div class="panel-body">${donutChart([
            { label: 'Present', value: summary.Present || 0, color: 'var(--green-600)' },
            { label: 'Late', value: summary.Late || 0, color: 'var(--gold-600)' },
            { label: 'Leave', value: summary.Leave || 0, color: 'var(--blue-500)' },
            { label: 'Absent', value: summary.Absent || 0, color: 'var(--red-600)' },
          ], { centerValue: `${pct}%`, centerLabel: 'attended', emptyText: 'No attendance marked yet' })}</div></section>
        <section class="panel"><header class="panel-head"><h2>Monthly attendance rate</h2></header>
          <div class="panel-body">${trend.length ? barChart(trend, { height: 220, title: 'Monthly attendance rate' })
            : '<p class="muted tiny">Attendance history will appear once classes are marked.</p>'}</div></section>
        <section class="panel panel-wide"><header class="panel-head"><h2>Attendance record</h2>
          <span class="tiny muted">${records.length} record${records.length === 1 ? '' : 's'}</span></header>
          <div class="panel-body"><div class="table-wrap"><table class="table">
            <thead><tr><th>Date</th>${role === 'teacher' ? '<th>Student</th>' : ''}<th>Class</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>${records.length ? records.map((a) => `<tr>
              <td>${esc(fmtDate(a.date || a.created_at))}</td>
              ${role === 'teacher' ? `<td>${esc(a.student_name || a.student_email || '—')}</td>` : ''}
              <td>${esc(a.topic || a.course || '—')}</td>
              <td>${badge(a.status)}</td>
              <td>${esc(a.notes || '—')}</td></tr>`).join('')
              : `<tr><td colspan="5">${emptyState('No attendance yet', 'Records appear after your teacher marks a class.')}</td></tr>`}
          </tbody></table></div></div></section>
      </div>`;
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* ------------------------------------------------------ notifications -- */

registerPage('notifications', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const back = document.querySelector('[data-portal-home]');
  if (back) back.href = portalHome(role);
});

/* ------------------------------------------------------------ profile -- */

registerPage('profile', async () => {
  const role = currentRole();
  const me = await initPortal(role);
  if (!me) return;
  const host = document.querySelector('#profile');
  const u = me.user || {};
  host.innerHTML = `
    <section class="panel">
      <header class="panel-head"><h2>My details</h2>
        <button type="button" class="btn btn-sm btn-primary" data-open-profile>${icon('edit', 'icon-xs')} Edit profile</button></header>
      <div class="panel-body">
        <div class="detail-head">${avatar(u.name, u.avatar, 'avatar-xl')}
          <div><h3>${esc(u.name || '')}</h3><p class="tiny muted">${esc(u.email || '')}</p>
          ${badge(window.SUQPortal.roleLabel(u.role))}</div></div>
        <dl class="kv kv-3 mt-4">
          <div><dt>Phone</dt><dd>${esc(u.phone || '—')}</dd></div>
          <div><dt>Member since</dt><dd>${esc(fmtDate(u.created_at))}</dd></div>
          <div><dt>Account status</dt><dd>${esc(u.active ? 'Active' : 'Inactive')}</dd></div>
          ${role === 'teacher' ? `
            <div><dt>Qualification</dt><dd>${esc(u.qualification || '—')}</dd></div>
            <div><dt>Experience</dt><dd>${esc(u.experience || '—')}</dd></div>
            <div><dt>Specialities</dt><dd>${esc(u.specialities || '—')}</dd></div>` : ''}
        </dl>
        ${role === 'teacher' && u.bio ? `<p class="mt-4">${esc(u.bio)}</p>` : ''}
      </div>
    </section>
    <section class="panel">
      <header class="panel-head"><h2>Security</h2></header>
      <div class="panel-body">
        <p class="muted">Change your password regularly and never share it. The academy never asks for your password.</p>
        <button type="button" class="btn btn-outline mt-3" data-open-password>${icon('key', 'icon-xs')} Change password</button>
      </div>
    </section>`;
  if (me.billing) window.SUQPortal.renderFeeBanner(me.billing);
});
})();
