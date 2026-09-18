/* =============================================================================
   portal-shell.js — shared chrome for the student, teacher and admin portals:
   session guard, topbar identity, notification bell, fee banner, sign-out.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, auth, esc, icon, avatar, relTime, toast, modal, closeModal, setLoading,
  formValues, clearFieldErrors, fieldError, money, monthLabel, emptyState, errorState,
} = window.SUQ;

const shell = {
  role: '',
  user: null,
  settings: null,
};

function roleLabel(role) {
  return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Teacher' : 'Student';
}

function paintIdentity(user) {
  shell.user = user;
  auth.update(user);
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user?.name || '—'; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = user?.email || ''; });
  document.querySelectorAll('[data-user-role]').forEach((el) => { el.textContent = roleLabel(user?.role || shell.role); });
  document.querySelectorAll('[data-user-avatar]').forEach((el) => {
    el.innerHTML = avatar(user?.name, user?.avatar, el.dataset.avatarSize || '');
  });

  /* Personalise the greeting once the account is known. The markup ships the
     plain greeting so the page never shows a name-shaped placeholder while the
     request is still in flight, and `data-greet-base` keeps this idempotent if
     paintIdentity runs again after a profile update. */
  const greet = document.querySelector('[data-greeting]');
  if (greet) {
    const base = greet.dataset.greetBase || (greet.dataset.greetBase = greet.textContent.trim());
    const first = String(user?.name || '').trim().split(/\s+/)[0] || '';
    greet.textContent = first ? `${base}, ${first}` : base;
  }
}

/* ------------------------------------------------------- notifications --- */

function notificationItem(n) {
  const tone = /suspend|overdue|reject/i.test(n.type || '') ? 'danger'
    : /verified|approved|paid/i.test(n.type || '') ? 'success'
      : /due|grace|reminder/i.test(n.type || '') ? 'warning' : 'info';
  return `<li class="notif${n.read ? '' : ' is-unread'}" data-notif="${n.id}">
    <span class="notif-dot notif-${tone}"></span>
    <div><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p>
    <span class="tiny muted">${esc(relTime(n.created_at))}</span></div>
    ${n.read ? '' : `<button type="button" class="copy-btn" data-notif-read="${n.id}">Mark read</button>`}</li>`;
}

async function loadNotifications() {
  const panel = document.querySelector('#notif-list');
  if (!panel) return;
  panel.innerHTML = '<li class="notif"><div class="skeleton skeleton-row"></div></li>';
  try {
    const { notifications, unread } = await api.get('/notifications');
    setUnread(unread);
    panel.innerHTML = notifications.length
      ? notifications.slice(0, 12).map(notificationItem).join('')
      : `<li class="notif-empty">${esc('No notifications yet.')}</li>`;
    const page = document.querySelector('#notifications-page');
    if (page) {
      page.innerHTML = notifications.length
        ? `<ul class="notif-list notif-page">${notifications.map(notificationItem).join('')}</ul>`
        : emptyState('No notifications', 'Fee reminders, admission decisions and class updates will appear here.');
    }
  } catch (err) {
    panel.innerHTML = `<li class="notif-empty">${esc(err.message)}</li>`;
  }
}

function setUnread(count) {
  const n = Number(count || 0);
  document.querySelectorAll('[data-unread-notifications]').forEach((el) => {
    el.textContent = n > 9 ? '9+' : String(n);
    el.hidden = n === 0;
  });
}

function setUnreadChat(count) {
  const n = Number(count || 0);
  document.querySelectorAll('[data-unread-messages]').forEach((el) => {
    el.textContent = n > 9 ? '9+' : String(n);
    el.hidden = n === 0;
  });
}

function initDropdowns() {
  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest('[data-dropdown]');
    const panels = Array.from(document.querySelectorAll('.dropdown-panel'));
    if (trigger) {
      const id = trigger.dataset.dropdown;
      const panel = document.getElementById(id);
      const willOpen = panel && panel.hidden;
      panels.forEach((p) => { p.hidden = true; });
      document.querySelectorAll('[data-dropdown]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
      if (panel && willOpen) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        if (id === 'notif-panel') loadNotifications();
      }
      return;
    }
    if (!e.target.closest('.dropdown-panel')) panels.forEach((p) => { p.hidden = true; });
  });

  document.addEventListener('click', async (e) => {
    const one = e.target.closest('[data-notif-read]');
    const all = e.target.closest('[data-notif-read-all]');
    if (!one && !all) return;
    try {
      await api.patch('/notifications/read', all ? { all: true } : { id: Number(one.dataset.notifRead) });
      await loadNotifications();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ---------------------------------------------------------- fee banner --- */

const BILLING_COPY = {
  paid: { tone: 'success', title: 'Fee settled', text: (b) => `${b.monthLabel} fee of ${money(b.fee)} is verified. Jazak Allahu khairan.` },
  upcoming: { tone: 'info', title: 'Fee upcoming', text: (b) => `${b.monthLabel} fee of ${money(b.fee)} is due on day ${b.dueDay}.` },
  due: { tone: 'warning', title: 'Fee due today', text: (b) => `${b.monthLabel} fee of ${money(b.remaining)} is due today. A grace period runs to day ${b.graceEndDay}.` },
  grace: { tone: 'warning', title: 'Grace period', text: (b) => `${b.monthLabel} fee of ${money(b.remaining)} is unpaid. Final grace day is ${b.graceEndDay}; accounts are suspended on day ${b.suspendDay}.` },
  suspended: { tone: 'danger', title: 'Account suspended', text: (b) => `${b.monthLabel} fee of ${money(b.remaining)} is unverified, so classes and messaging are paused. Submit your payment and the academy will reactivate your account as soon as it is verified. Nothing has been deleted.` },
  inactive: { tone: 'info', title: 'No active enrollment', text: () => 'You do not have an active enrollment yet. Once the academy approves your admission, your monthly fee schedule will appear here.' },
};

function renderFeeBanner(billing) {
  const host = document.querySelector('[data-fee-banner]');
  if (!host || !billing) return;
  const copy = BILLING_COPY[billing.status] || BILLING_COPY.info;
  if (!copy) { host.hidden = true; return; }
  const showPay = ['due', 'grace', 'suspended'].includes(billing.status) || (billing.status === 'upcoming' && billing.remaining > 0);
  const arrears = Array.isArray(billing.arrears) ? billing.arrears : [];
  host.hidden = false;
  host.className = `fee-banner fee-${copy.tone}`;
  host.innerHTML = `<span class="icon-badge">${icon(copy.tone === 'success' ? 'checkCircle' : copy.tone === 'danger' ? 'alert' : 'wallet')}</span>
    <div><strong>${esc(copy.title)}</strong><p>${esc(copy.text(billing))}</p>
    ${billing.pending > 0 ? `<p class="tiny">${esc(money(billing.pending))} is submitted and awaiting the academy's verification.</p>` : ''}
    ${arrears.length ? `<p class="tiny">Earlier unpaid months: ${arrears.map((m) => esc(m.label || monthLabel(m.month))).join(', ')}.</p>` : ''}</div>
    ${showPay ? '<a class="btn btn-sm btn-gold" href="payments.html">Submit payment</a>' : ''}`;
}

/* -------------------------------------------------------- profile modal -- */

function openProfileModal() {
  const u = shell.user || {};
  const isTeacher = (u.role || shell.role) === 'teacher';
  modal({
    title: 'My profile',
    subtitle: 'Update the details the academy has on record.',
    body: `<form id="profile-form" class="stack" novalidate>
      <div class="field"><label for="pf-name">Full name <span class="req">*</span></label>
        <input class="input" id="pf-name" name="name" value="${esc(u.name || '')}" required maxlength="120">
        <span class="error-text"></span></div>
      <div class="field"><label for="pf-email">Email</label>
        <input class="input" id="pf-email" value="${esc(u.email || '')}" disabled>
        <span class="help">Contact the academy if your email address needs to change.</span></div>
      <div class="field"><label for="pf-phone">Phone</label>
        <input class="input" id="pf-phone" name="phone" value="${esc(u.phone || '')}" maxlength="40">
        <span class="error-text"></span></div>
      ${isTeacher ? `
      <div class="grid grid-cols-2">
        <div class="field"><label for="pf-qual">Qualification</label>
          <input class="input" id="pf-qual" name="qualification" value="${esc(u.qualification || '')}" maxlength="200"></div>
        <div class="field"><label for="pf-exp">Experience</label>
          <input class="input" id="pf-exp" name="experience" value="${esc(u.experience || '')}" maxlength="100" placeholder="e.g. 6 years"></div>
      </div>
      <div class="field"><label for="pf-spec">Specialities</label>
        <input class="input" id="pf-spec" name="specialities" value="${esc(u.specialities || '')}" maxlength="300" placeholder="Tajweed, Hifz, Qira'at">
        <span class="help">Separate each speciality with a comma.</span></div>
      <div class="field"><label for="pf-bio">Short biography</label>
        <textarea class="textarea" id="pf-bio" name="bio" maxlength="1200" rows="4">${esc(u.bio || '')}</textarea></div>` : ''}
      <div class="field"><label>Profile photo</label>
        <label class="file-drop" data-value=""><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <span class="icon-badge">${icon('upload')}</span>
          <span data-drop-label data-drop-label-default="Choose a photo">Choose a photo (PNG, JPG or WEBP, under 700 KB)</span></label>
        <div class="file-preview"></div></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-profile-save>Save changes</button>`,
    onMount(box) {
      box.querySelector('[data-profile-save]').addEventListener('click', async (e) => {
        const form = box.querySelector('#profile-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.name?.trim()) { fieldError(form.elements.name, 'Your name is required.'); return; }
        const image = box.querySelector('.file-drop')?.dataset.value || '';
        if (image) v.avatar = image;
        setLoading(e.currentTarget, true);
        try {
          const res = await api.patch('/profile', v);
          paintIdentity(res.user);
          closeModal();
          toast('Profile updated.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(e.currentTarget, false);
        }
      });
    },
  });
}

function openPasswordModal() {
  modal({
    title: 'Change password',
    body: `<form id="pw-form" class="stack" novalidate>
      <div class="field"><label for="pw-cur">Current password <span class="req">*</span></label>
        <div class="input-wrap"><input class="input" id="pw-cur" name="currentPassword" type="password" required autocomplete="current-password">
        <button type="button" class="password-toggle" aria-label="Show password">${icon('eye')}</button></div>
        <span class="error-text"></span></div>
      <div class="field"><label for="pw-new">New password <span class="req">*</span></label>
        <div class="input-wrap"><input class="input" id="pw-new" name="newPassword" type="password" required minlength="8" autocomplete="new-password">
        <button type="button" class="password-toggle" aria-label="Show password">${icon('eye')}</button></div>
        <span class="help">At least 8 characters.</span><span class="error-text"></span></div>
      <div class="field"><label for="pw-new2">Repeat new password <span class="req">*</span></label>
        <input class="input" id="pw-new2" name="repeat" type="password" required autocomplete="new-password">
        <span class="error-text"></span></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-pw-save>Update password</button>`,
    onMount(box) {
      box.querySelector('[data-pw-save]').addEventListener('click', async (e) => {
        const form = box.querySelector('#pw-form');
        clearFieldErrors(form);
        const v = formValues(form);
        if (!v.currentPassword) { fieldError(form.elements.currentPassword, 'Enter your current password.'); return; }
        if ((v.newPassword || '').length < 8) { fieldError(form.elements.newPassword, 'Use at least 8 characters.'); return; }
        if (v.newPassword !== v.repeat) { fieldError(form.elements.repeat, 'The two passwords do not match.'); return; }
        setLoading(e.currentTarget, true);
        try {
          await api.post('/profile/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
          closeModal();
          toast('Password updated.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(e.currentTarget, false);
        }
      });
    },
  });
}

function initProfileActions() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-profile]')) { e.preventDefault(); openProfileModal(); }
    if (e.target.closest('[data-open-password]')) { e.preventDefault(); openPasswordModal(); }
  });
}

/* ------------------------------------------------------------- startup --- */

/**
 * Guards the page, loads the signed-in identity and paints shared chrome.
 * Returns { user, billing } or null when the visitor was redirected to login.
 */
async function initPortal(role) {
  shell.role = role;
  if (!window.SUQ.requireRole(role)) return null;
  initDropdowns();
  initProfileActions();
  try {
    const me = await api.get('/me');
    paintIdentity(me.user);
    if (me.billing) renderFeeBanner(me.billing);
    shell.billing = me.billing || null;
    loadNotifications();
    return me;
  } catch (err) {
    if (err.status === 401) return null;
    toast(err.message, 'error');
    return null;
  }
}

window.SUQPortal = {
  shell, initPortal, paintIdentity, loadNotifications, setUnread, setUnreadChat,
  renderFeeBanner, openProfileModal, openPasswordModal, roleLabel, notificationItem,
};
})();
