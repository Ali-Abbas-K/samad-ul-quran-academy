/* =============================================================================
   site.js — public website behaviour (home, courses, gallery, teachers,
   admission form, contact form, login screens).
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, auth, esc, money, icon, badge, avatar, toast, modal, closeModal,
  setLoading, fieldError, clearFieldErrors, formValues, skeletonCards, emptyState,
  errorState, mount, qs, registerPage, slugify, fmtDate,
} = window.SUQ;

const DAY_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const COURSE_FALLBACK_IMAGES = {
  'noorani-qaida': 'assets/img/course-noorani-qaida',
  'nazra-quran': 'assets/img/course-nazra',
  'nazra-e-quran': 'assets/img/course-nazra',
  'hifz-ul-quran': 'assets/img/course-hifz',
  'tajweed-course': 'assets/img/course-tajweed',
  tajweed: 'assets/img/course-tajweed',
  'namaz-duas': 'assets/img/course-namaz',
  namaz: 'assets/img/course-namaz',
  'islamic-studies': 'assets/img/course-islamic-studies',
};

/** Picks the admin-uploaded image when present, otherwise a bundled photograph. */
function courseImage(course) {
  if (course.image && String(course.image).trim()) return String(course.image);
  const key = slugify(course.slug || course.name);
  const base = COURSE_FALLBACK_IMAGES[key]
    || Object.entries(COURSE_FALLBACK_IMAGES).find(([k]) => key.includes(k.split('-')[0]))?.[1]
    || 'assets/img/course-nazra';
  return `${base}.webp`;
}

function courseHref(course) {
  return `course.html?slug=${encodeURIComponent(course.slug || slugify(course.name))}`;
}

function courseCard(course, currency) {
  return `<article class="course-card reveal">
    <a class="course-media" href="${courseHref(course)}" aria-label="${esc(course.name)}">
      <img src="${esc(courseImage(course))}" alt="${esc(course.name)} class at Samad-ul-Qur'an Academy" loading="lazy" width="600" height="400">
      <span class="course-fee">${esc(money(course.fee, currency))}<small>/month</small></span>
    </a>
    <div class="course-body">
      <div class="course-meta">
        <span>${icon('clock')} ${esc(course.duration || 'Monthly')}</span>
        <span>${icon('certificate')} ${esc(course.level || 'All levels')}</span>
      </div>
      <h3><a href="${courseHref(course)}">${esc(course.name)}</a></h3>
      <p>${esc(course.description || '')}</p>
      <div class="course-foot">
        <a class="btn btn-sm btn-primary" href="admissions.html?course=${encodeURIComponent(course.name)}">Enroll now</a>
        <a class="link-arrow" href="${courseHref(course)}">Course details ${icon('external', 'icon-xs')}</a>
      </div>
    </div>
  </article>`;
}

function starRow(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 5));
  return `<span class="stars" aria-label="${n} out of 5">${Array.from({ length: 5 }, (_, i) => `<span class="star${i < n ? ' is-on' : ''}">${icon('star')}</span>`).join('')}</span>`;
}

/* ------------------------------------------------------------ home -------- */

registerPage('home', async () => {
  loadStats();
  loadCourses('#home-courses', 6);
  loadTestimonials('#home-testimonials');
  loadGalleryStrip('#home-gallery');
  loadTeacherStrip('#home-teachers');
});

async function loadStats() {
  const host = document.querySelector('[data-stats]');
  if (!host) return;
  try {
    const { stats } = await api.get('/public/stats', { token: null });
    const items = [
      { key: 'students', label: 'Students enrolled', icon: 'users' },
      { key: 'teachers', label: 'Qualified teachers', icon: 'user' },
      { key: 'courses', label: 'Courses offered', icon: 'book' },
      { key: 'classes', label: 'Classes delivered', icon: 'video' },
    ];
    /* Only show counters the academy can actually stand behind. A freshly
       installed academy has no students and no delivered classes yet, and
       "0 students enrolled" on the homepage is worse than saying nothing.
       Numbers are never padded or invented — a pill is either the real figure
       or absent. */
    const shown = items.filter((it) => Number(stats[it.key] || 0) > 0);
    /* A single counter reads as a broken four-column band rather than a proof
       point, so the whole strip stands down until at least two figures are
       real. `data-stats-count` lets the stylesheet centre a partial row. */
    if (shown.length < 2) {
      host.closest('[data-stats-section]')?.setAttribute('hidden', '');
      return;
    }
    host.dataset.statsCount = String(shown.length);
    host.innerHTML = shown.map((it) => `<div class="stat-pill reveal">
      <span class="icon-badge">${icon(it.icon)}</span>
      <strong data-count-to="${Number(stats[it.key])}">${Number(stats[it.key])}</strong>
      <span>${esc(it.label)}</span></div>`).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    countUp(host);
  } catch {
    host.closest('[data-stats-section]')?.setAttribute('hidden', '');
  }
}

/** Counts a real value up from zero once, respecting reduced-motion. */
function countUp(scope) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  scope.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = Number(el.dataset.countTo) || 0;
    if (target <= 0) return;
    const started = performance.now();
    const dur = 900;
    const tick = (now) => {
      const p = Math.min(1, (now - started) / dur);
      el.textContent = String(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function loadCourses(selector, limit) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = skeletonCards(limit || 6);
  try {
    const { courses, currency } = await api.get('/courses', { token: null });
    const list = limit ? courses.slice(0, limit) : courses;
    if (!list.length) {
      host.innerHTML = emptyState('Courses are being prepared', 'The academy has not published its course list yet. Please check back soon or contact us on WhatsApp.');
      return;
    }
    host.innerHTML = list.map((c) => courseCard(c, currency)).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  } catch (err) {
    host.innerHTML = errorState(err.message, 'reload-courses');
  }
}

async function loadTestimonials(selector) {
  const host = document.querySelector(selector);
  if (!host) return;
  try {
    const { items } = await api.get('/public/testimonials', { token: null });
    if (!items.length) {
      host.closest('[data-section]')?.setAttribute('hidden', '');
      return;
    }
    host.innerHTML = items.map((t) => `<figure class="testimonial reveal">
      ${starRow(t.rating)}
      <blockquote>${esc(t.body)}</blockquote>
      <figcaption>${avatar(t.name)}<span><strong>${esc(t.name)}</strong>${t.role ? `<small>${esc(t.role)}</small>` : ''}</span></figcaption>
    </figure>`).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  } catch {
    host.closest('[data-section]')?.setAttribute('hidden', '');
  }
}

async function loadGalleryStrip(selector) {
  const host = document.querySelector(selector);
  if (!host) return;
  try {
    const { items } = await api.get('/public/gallery', { token: null });
    if (!items.length) { host.closest('[data-section]')?.setAttribute('hidden', ''); return; }
    host.innerHTML = items.slice(0, 6).map((g, i) => `
      <button type="button" class="gallery-tile reveal" data-lightbox="${i}" data-src="${esc(g.image)}" data-title="${esc(g.title || '')}" data-caption="${esc(g.caption || '')}">
        <img src="${esc(g.image)}" alt="${esc(g.title || 'Academy photograph')}" loading="lazy" width="600" height="400">
        ${g.title ? `<span class="gallery-cap">${esc(g.title)}</span>` : ''}
      </button>`).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    bindLightbox(host);
  } catch {
    host.closest('[data-section]')?.setAttribute('hidden', '');
  }
}

async function loadTeacherStrip(selector) {
  const host = document.querySelector(selector);
  if (!host) return;
  try {
    const { teachers } = await api.get('/public/teachers', { token: null });
    if (!teachers.length) { host.closest('[data-section]')?.setAttribute('hidden', ''); return; }
    host.innerHTML = teachers.slice(0, 4).map((t) => teacherCard(t, true)).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  } catch {
    host.closest('[data-section]')?.setAttribute('hidden', '');
  }
}

function teacherCard(t, compact) {
  const specs = String(t.specialities || '').split(',').map((s) => s.trim()).filter(Boolean);
  return `<article class="teacher-card reveal">
    <div class="teacher-avatar">${avatar(t.name, t.avatar, 'avatar-xl')}</div>
    <h3>${esc(t.name)}</h3>
    ${t.qualification ? `<p class="teacher-qual">${esc(t.qualification)}</p>` : ''}
    ${t.experience ? `<p class="tiny muted">${esc(t.experience)} of teaching experience</p>` : ''}
    ${specs.length ? `<ul class="chip-row">${specs.slice(0, compact ? 2 : 5).map((s) => `<li class="chip">${esc(s)}</li>`).join('')}</ul>` : ''}
    ${!compact && t.bio ? `<p class="teacher-bio">${esc(t.bio)}</p>` : ''}
    <p class="tiny muted mt-3">${icon('users', 'icon-xs')} ${Number(t.students || 0)} student${Number(t.students) === 1 ? '' : 's'} currently assigned</p>
  </article>`;
}

/* ------------------------------------------------------ lightbox --------- */

function bindLightbox(scope) {
  scope.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-lightbox]');
    if (!tile) return;
    const tiles = Array.from(scope.querySelectorAll('[data-lightbox]'));
    let index = tiles.indexOf(tile);
    const render = () => {
      const t = tiles[index];
      const box = document.querySelector('.lightbox');
      const html = `<img src="${esc(t.dataset.src)}" alt="${esc(t.dataset.title || 'Academy photograph')}">
        <div class="lightbox-cap">${t.dataset.title ? `<strong>${esc(t.dataset.title)}</strong>` : ''}
        ${t.dataset.caption ? `<p>${esc(t.dataset.caption)}</p>` : ''}
        <p class="tiny muted">${index + 1} of ${tiles.length}</p></div>`;
      if (box) box.querySelector('.lightbox-figure').innerHTML = html;
      return html;
    };
    const wrap = document.createElement('div');
    wrap.className = 'lightbox';
    wrap.innerHTML = `<button type="button" class="lightbox-close" aria-label="Close">${icon('close')}</button>
      <button type="button" class="lightbox-nav prev" data-lb-prev aria-label="Previous">&#8249;</button>
      <figure class="lightbox-figure"></figure>
      <button type="button" class="lightbox-nav next" data-lb-next aria-label="Next">&#8250;</button>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    render();
    const close = () => { wrap.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
      if (ev.key === 'ArrowRight') { index = (index + 1) % tiles.length; render(); }
      if (ev.key === 'ArrowLeft') { index = (index - 1 + tiles.length) % tiles.length; render(); }
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-lb-next]')) { index = (index + 1) % tiles.length; render(); return; }
      if (ev.target.closest('[data-lb-prev]')) { index = (index - 1 + tiles.length) % tiles.length; render(); return; }
      if (ev.target === wrap || ev.target.closest('.lightbox-close')) close();
    });
  });
}

/* ------------------------------------------------------- courses page ---- */

registerPage('courses', async () => {
  const host = document.querySelector('#courses-grid');
  const search = document.querySelector('#course-search');
  let all = [];
  let currency = 'PKR';
  const render = () => {
    const term = (search?.value || '').trim().toLowerCase();
    const level = document.querySelector('#course-level')?.value || '';
    const list = all.filter((c) => (!term || `${c.name} ${c.description} ${c.level}`.toLowerCase().includes(term))
      && (!level || String(c.level || '').toLowerCase() === level.toLowerCase()));
    const count = document.querySelector('[data-course-count]');
    if (count) count.textContent = `${list.length} course${list.length === 1 ? '' : 's'}`;
    host.innerHTML = list.length
      ? list.map((c) => courseCard(c, currency)).join('')
      : emptyState('No course matches that search', 'Try a different keyword or clear the filters to see every course.');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  };
  host.innerHTML = skeletonCards(6);
  try {
    const data = await api.get('/courses', { token: null });
    all = data.courses;
    currency = data.currency;
    const levelSel = document.querySelector('#course-level');
    if (levelSel) {
      const levels = [...new Set(all.map((c) => c.level).filter(Boolean))];
      levelSel.innerHTML = '<option value="">All levels</option>' + levels.map((l) => `<option>${esc(l)}</option>`).join('');
    }
    render();
    search?.addEventListener('input', render);
    document.querySelector('#course-level')?.addEventListener('change', render);
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* -------------------------------------------------- course detail page --- */

registerPage('course', async () => {
  const host = document.querySelector('#course-detail');
  const slug = qs('slug');
  const id = qs('id');
  if (!slug && !id) { location.replace('courses.html'); return; }
  host.innerHTML = skeletonCards(2);
  try {
    const { course, teachers, currency } = await api.get(`/courses/detail?${slug ? `slug=${encodeURIComponent(slug)}` : `id=${encodeURIComponent(id)}`}`, { token: null });
    document.title = `${course.name} — Samad-ul-Qur'an Academy`;
    const crumb = document.querySelector('[data-crumb]');
    if (crumb) crumb.textContent = course.name;
    host.innerHTML = `
      <div class="course-detail">
        <div class="course-detail-media">
          <img src="${esc(courseImage(course))}" alt="${esc(course.name)}" width="1000" height="667">
        </div>
        <div class="course-detail-body">
          <h1>${esc(course.name)}</h1>
          <p class="lead">${esc(course.description || '')}</p>
          <dl class="kv">
            <div><dt>Monthly fee</dt><dd class="fee-value">${esc(money(course.fee, currency))}</dd></div>
            <div><dt>Schedule</dt><dd>${esc(course.duration || 'Monthly')}</dd></div>
            <div><dt>Level</dt><dd>${esc(course.level || 'All levels')}</dd></div>
            <div><dt>Students enrolled</dt><dd>${Number(course.students || 0)}</dd></div>
          </dl>
          <div class="btn-row">
            <a class="btn btn-primary" href="admissions.html?course=${encodeURIComponent(course.name)}">Enroll in this course</a>
            <a class="btn btn-outline" data-whatsapp-link data-whatsapp-text="Assalam-u-alaikum, I want to ask about the ${course.name} course." href="#" target="_blank" rel="noopener">${icon('whatsapp')} Ask on WhatsApp</a>
          </div>
          <p class="tiny muted mt-4">Fees are billed monthly. Payment is due on the 5th of each month with a grace period to the 8th; unverified fees are suspended on the 9th and reactivated as soon as the academy verifies your payment.</p>
        </div>
      </div>
      ${teachers.length ? `<section class="section-inner"><h2 class="section-title">Teachers for this course</h2>
        <div class="grid grid-cols-3">${teachers.map((t) => teacherCard(t, true)).join('')}</div></section>` : ''}`;
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    await window.SUQ.applyPublicSettings();
  } catch (err) {
    host.innerHTML = err.status === 404
      ? emptyState('Course not found', 'That course is no longer listed. Browse the current course list instead.', '<a class="btn btn-primary mt-4" href="courses.html">View all courses</a>')
      : errorState(err.message);
  }
});

/* ------------------------------------------------------- gallery page ---- */

registerPage('gallery', async () => {
  const host = document.querySelector('#gallery-grid');
  host.innerHTML = skeletonCards(6);
  try {
    const { items } = await api.get('/public/gallery', { token: null });
    if (!items.length) {
      host.innerHTML = emptyState('No photographs yet', 'The academy has not published gallery photographs yet.');
      return;
    }
    host.innerHTML = items.map((g, i) => `
      <button type="button" class="gallery-tile reveal" data-lightbox="${i}" data-src="${esc(g.image)}" data-title="${esc(g.title || '')}" data-caption="${esc(g.caption || '')}">
        <img src="${esc(g.image)}" alt="${esc(g.title || 'Academy photograph')}" loading="lazy" width="600" height="400">
        ${g.title ? `<span class="gallery-cap">${esc(g.title)}</span>` : ''}</button>`).join('');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    bindLightbox(host);
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* ------------------------------------------------------ teachers page --- */

registerPage('teachers', async () => {
  const host = document.querySelector('#teachers-grid');
  host.innerHTML = skeletonCards(3);
  try {
    const { teachers } = await api.get('/public/teachers', { token: null });
    host.innerHTML = teachers.length
      ? teachers.map((t) => teacherCard(t, false)).join('')
      : emptyState('Teacher profiles coming soon', 'Teacher profiles will appear here once the academy publishes them.');
    host.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* ------------------------------------------------------ contact page ---- */

registerPage('contact', async () => {
  const form = document.querySelector('#contact-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const btn = form.querySelector('[type=submit]');
    const values = formValues(form);
    if (!values.name?.trim()) { fieldError(form.elements.name, 'Please tell us your name.'); return; }
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(values.email || '')) { fieldError(form.elements.email, 'Enter a valid email address.'); return; }
    if (!values.message?.trim() || values.message.trim().length < 10) { fieldError(form.elements.message, 'Please write at least a short message.'); return; }
    setLoading(btn, true);
    try {
      await api.post('/contact', values, { token: null });
      form.reset();
      form.hidden = true;
      document.querySelector('#contact-success').hidden = false;
      toast('Your message has been sent. We will reply soon, in sha Allah.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
});

/* ---------------------------------------------------- admission page --- */

registerPage('admissions', async () => {
  const form = document.querySelector('#admission-form');
  if (!form) return;
  const courseSel = form.elements.course;
  const feeNote = document.querySelector('[data-fee-note]');
  let courses = [];
  let currency = 'PKR';

  const dayHost = document.querySelector('#day-picker');
  if (dayHost) {
    dayHost.innerHTML = DAY_LIST.map((d) => `<label class="check-chip">
      <input type="checkbox" name="days" data-group="days" value="${d}"${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(d) ? ' checked' : ''}>
      <span>${d.slice(0, 3)}</span></label>`).join('');
  }

  try {
    const data = await api.get('/courses', { token: null });
    courses = data.courses;
    currency = data.currency;
    courseSel.innerHTML = '<option value="">Choose a course…</option>'
      + courses.map((c) => `<option value="${esc(c.name)}">${esc(c.name)} — ${esc(money(c.fee, currency))}/month</option>`).join('');
    const preset = qs('course');
    if (preset && courses.some((c) => c.name === preset)) courseSel.value = preset;
  } catch (err) {
    courseSel.innerHTML = '<option value="">Course list unavailable</option>';
    toast(`Courses could not be loaded: ${err.message}`, 'error');
  }

  const syncFee = () => {
    const c = courses.find((x) => x.name === courseSel.value);
    if (feeNote) {
      feeNote.innerHTML = c
        ? `Monthly fee for <strong>${esc(c.name)}</strong>: <strong>${esc(money(c.fee, currency))}</strong>. Nothing is charged now — you will submit your first payment from the student portal after approval.`
        : 'Select a course to see its monthly fee.';
    }
  };
  courseSel.addEventListener('change', syncFee);
  syncFee();

  const ageInput = form.elements.age;
  const guardianField = document.querySelector('[data-guardian-field]');
  const syncGuardian = () => {
    const age = Number(ageInput.value);
    const minor = Number.isFinite(age) && age > 0 && age < 18;
    guardianField.classList.toggle('is-required', minor);
    form.elements.guardianName.required = minor;
    guardianField.querySelector('.req').hidden = !minor;
  };
  ageInput.addEventListener('input', syncGuardian);
  syncGuardian();

  const steps = Array.from(document.querySelectorAll('[data-step]'));
  const dots = Array.from(document.querySelectorAll('[data-step-dot]'));
  let step = 0;
  const showStep = (next) => {
    step = Math.max(0, Math.min(steps.length - 1, next));
    steps.forEach((s, i) => { s.hidden = i !== step; });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === step);
      d.classList.toggle('is-done', i < step);
    });
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const validateStep = () => {
    const current = steps[step];
    let firstBad = null;
    current.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.disabled) return;
      const invalid = !el.checkValidity();
      fieldError(el, invalid ? (el.validationMessage || 'Please check this field.') : '');
      if (invalid && !firstBad) firstBad = el;
    });
    if (step === 1 && !form.querySelector('input[name=days]:checked')) {
      toast('Please choose at least one class day.', 'warning');
      return false;
    }
    if (firstBad) { firstBad.focus(); return false; }
    return true;
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-step-next]')) { if (validateStep()) showStep(step + 1); }
    if (e.target.closest('[data-step-back]')) showStep(step - 1);
  });
  if (steps.length) showStep(0);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    if (!validateStep()) return;
    const v = formValues(form);
    const days = Array.isArray(v.days) ? v.days : [];
    if (!days.length) { toast('Please choose at least one class day.', 'warning'); return; }
    if ((v.password || '').length < 8) { fieldError(form.elements.password, 'Choose a password of at least 8 characters.'); return; }
    if (v.password !== v.password2) { fieldError(form.elements.password2, 'The two passwords do not match.'); return; }
    if (!v.agree) { toast('Please accept the student policy to continue.', 'warning'); return; }
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true);
    try {
      const res = await api.post('/enrollments', {
        studentName: v.studentName,
        email: v.email,
        phone: v.phone,
        whatsapp: v.whatsapp,
        guardianName: v.guardianName,
        guardianPhone: v.guardianPhone,
        age: v.age,
        gender: v.gender,
        country: v.country,
        timezone: v.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        course: v.course,
        level: v.level,
        timing: v.timing,
        days,
        message: v.message,
        password: v.password,
      }, { token: null });
      document.querySelector('#admission-form-wrap').hidden = true;
      const done = document.querySelector('#admission-success');
      done.hidden = false;
      done.querySelector('[data-ref]').textContent = `#${res.enrollment?.id ?? '—'}`;
      done.querySelector('[data-course]').textContent = v.course;
      done.querySelector('[data-fee]').textContent = money(res.fee, currency);
      done.querySelector('[data-account]').hidden = !res.accountCreated;
      done.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Admission form submitted. The academy will review it shortly.', 'success');
    } catch (err) {
      if (err.status === 409) {
        toast(err.message, 'warning');
      } else {
        toast(err.message, 'error');
      }
    } finally {
      setLoading(btn, false);
    }
  });
});

/* --------------------------------------------------------- login pages -- */

function initLogin(role) {
  const form = document.querySelector('#login-form');
  if (!form) return;
  if (auth.token && auth.role === role) {
    const home = role === 'teacher' ? 'teacher-dashboard.html' : role === 'admin' ? 'admin.html' : 'student-dashboard.html';
    location.replace(home);
    return;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const v = formValues(form);
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true);
    try {
      let res;
      if (role === 'admin') {
        res = await api.post('/auth/admin', { key: v.key }, { token: null });
      } else {
        res = await api.post('/auth/login', { email: v.email, password: v.password, role }, { token: null });
      }
      auth.save(res.token, res.user, res.user?.role || role);
      const next = qs('next');
      const home = role === 'teacher' ? 'teacher-dashboard.html' : role === 'admin' ? 'admin.html' : 'student-dashboard.html';
      location.href = next && /^[a-z0-9\-.?=&]+$/i.test(next) ? next : home;
    } catch (err) {
      if (err.status === 429) toast('Too many attempts. Please wait a few minutes and try again.', 'warning');
      else if (err.status === 403) toast(err.message || 'This account cannot sign in here. Use the correct portal.', 'error');
      else if (err.status === 401) {
        const field = role === 'admin' ? form.elements.key : form.elements.password;
        fieldError(field, role === 'admin' ? 'That administrator key is not valid.' : 'Email or password is incorrect.');
        toast(role === 'admin' ? 'That administrator key is not valid.' : 'Email or password is incorrect.', 'error');
      } else toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}

registerPage('student-login', () => initLogin('student'));
registerPage('teacher-login', () => initLogin('teacher'));
registerPage('admin-login', () => initLogin('admin'));

/* ------------------------------------------------- teacher application -- */

registerPage('teacher-register', () => {
  const form = document.querySelector('#teacher-apply-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const v = formValues(form);
    const btn = form.querySelector('[type=submit]');
    setLoading(btn, true);
    try {
      await api.post('/contact', {
        name: v.name,
        email: v.email,
        phone: v.phone,
        subject: 'Teacher application',
        message: [
          `Qualification: ${v.qualification || '—'}`,
          `Experience: ${v.experience || '—'}`,
          `Specialities: ${v.specialities || '—'}`,
          `Preferred timings: ${v.timing || '—'}`,
          '',
          v.message || '',
        ].join('\n'),
      }, { token: null });
      form.hidden = true;
      document.querySelector('#apply-success').hidden = false;
      toast('Your application has been sent to the academy.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
});

/* ------------------------------------------------------------- about ---- */

registerPage('about', () => {
  loadStats();
  loadTeacherStrip('#about-teachers');
});

registerPage('faq', () => {});

window.SUQSite = { courseCard, teacherCard, courseImage, starRow, DAY_LIST };
})();
