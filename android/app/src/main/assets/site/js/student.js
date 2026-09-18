/* =============================================================================
   student.js — student portal: dashboard, fee payments, receipts.
   ========================================================================== */

/* Wrapped in an IIFE: every page script is a classic (non-module) script, so
   top-level `const` declarations share one global lexical scope and would
   otherwise collide with the same names in core.js. */
(function () {


const {
  api, esc, money, icon, badge, avatar, toast, modal, closeModal, setLoading,
  formValues, clearFieldErrors, fieldError, fmtDate, fmtDateTime, fmtDay, fmtTime,
  relTime, monthLabel, emptyState, errorState, skeletonRows, registerPage, pkNow,
} = window.SUQ;
const { donutChart, lineChart } = window.SUQCharts;
const { initPortal, renderFeeBanner, setUnreadChat, setUnread } = window.SUQPortal;

const STATUS_TONE = {
  Verified: 'success', Pending: 'warning', Rejected: 'danger', Overdue: 'danger',
  Present: 'success', Absent: 'danger', Late: 'warning', Leave: 'info',
  scheduled: 'info', live: 'success', completed: 'muted', cancelled: 'danger',
};

function tone(status) {
  return STATUS_TONE[status] || 'info';
}

function classRow(c, opts = {}) {
  const joinable = c.status === 'scheduled' || c.status === 'live';
  return `<li class="list-row">
    <span class="row-date"><strong>${esc(fmtDay(c.starts_at))}</strong><small>${esc(fmtTime(c.starts_at))}</small></span>
    <div class="row-main">
      <strong>${esc(c.topic || c.course || 'Qur\'an class')}</strong>
      <span class="tiny muted">${esc(opts.who || c.teacher_name || c.student_name || '')}${c.course ? ` · ${esc(c.course)}` : ''}</span>
    </div>
    <span class="badge badge-${tone(c.status)}">${esc(c.status)}</span>
    ${joinable ? `<button type="button" class="btn btn-sm btn-primary" data-join-class="${c.id}">${icon('video', 'icon-xs')} Join</button>` : ''}
  </li>`;
}

/** Opens the Jitsi classroom that the server assigns for this class. */
async function joinClass(id, btn) {
  setLoading(btn, true);
  try {
    const res = await api.get(`/classes/join?id=${encodeURIComponent(id)}`);
    location.href = `classroom.html?id=${encodeURIComponent(id)}`;
    void res;
  } catch (err) {
    if (err.status === 403) toast(err.message || 'Your account is suspended. Settle your fee to rejoin classes.', 'warning');
    else toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-join-class]');
  if (!btn) return;
  joinClass(btn.dataset.joinClass, btn);
});

/* ---------------------------------------------------------- dashboard ---- */

registerPage('student-dashboard', async () => {
  const me = await initPortal('student');
  if (!me) return;
  const host = document.querySelector('#dash');
  host.innerHTML = skeletonRows(5);
  try {
    const d = await api.get('/student/dashboard');
    setUnreadChat(d.unreadMessages);
    setUnread(d.unreadNotifications);
    const currency = d.academy?.currency || 'PKR';
    const att = d.attendanceSummary || {};
    const enrolled = Boolean(d.enrollment);

    host.innerHTML = `
      <div class="stat-grid">
        <article class="stat-card">
          <span class="icon-badge">${icon('book')}</span>
          <div><small>Current course</small><strong>${esc(d.enrollment?.course || 'Not enrolled')}</strong>
          <span class="tiny muted">${esc(d.enrollment?.status || 'Submit an admission form to begin')}</span></div>
        </article>
        <article class="stat-card">
          <span class="icon-badge">${icon('checkCircle')}</span>
          <div><small>Attendance</small><strong>${Number(att.percentage || 0)}%</strong>
          <span class="tiny muted">${Number(att.total || 0)} class${Number(att.total) === 1 ? '' : 'es'} marked</span></div>
        </article>
        <article class="stat-card">
          <span class="icon-badge">${icon('calendar')}</span>
          <div><small>Upcoming classes</small><strong>${(d.upcoming || []).length}</strong>
          <span class="tiny muted">${d.nextClass ? `Next: ${esc(fmtDay(d.nextClass.starts_at))} ${esc(fmtTime(d.nextClass.starts_at))}` : 'Nothing scheduled yet'}</span></div>
        </article>
        <article class="stat-card">
          <span class="icon-badge">${icon('wallet')}</span>
          <div><small>${esc(monthLabel(d.monthlyStatus?.month || pkNow().monthKey))} fee</small>
          <strong>${esc(money(d.fee, currency))}</strong>
          <span class="tiny muted">${esc(d.monthlyPaid >= d.fee ? 'Verified' : d.payments?.pending ? 'Awaiting verification' : 'Not yet paid')}</span></div>
        </article>
      </div>

      <div class="panel-grid">
        <section class="panel">
          <header class="panel-head"><h2>${d.nextClass ? 'Your next class' : 'Class schedule'}</h2>
            <a class="link-arrow" href="classes.html">All classes ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body">
            ${d.nextClass ? `<div class="next-class">
              <div><span class="tiny muted">${esc(fmtDateTime(d.nextClass.starts_at))} (Pakistan time)</span>
                <h3>${esc(d.nextClass.topic || d.nextClass.course || 'Qur\'an class')}</h3>
                <p class="tiny muted">${esc(d.nextClass.teacher_name || 'Teacher to be assigned')}</p></div>
              <button type="button" class="btn btn-primary" data-join-class="${d.nextClass.id}">${icon('video')} Join classroom</button>
            </div>` : ''}
            <ul class="list-rows">${(d.upcoming || []).slice(0, 5).map((c) => classRow(c, { who: c.teacher_name })).join('')
              || `<li>${emptyState('No classes scheduled', enrolled ? 'Your teacher will schedule classes soon.' : 'Classes appear after your admission is approved.')}</li>`}</ul>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Attendance</h2>
            <a class="link-arrow" href="attendance.html">Full record ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body">
            ${donutChart([
              { label: 'Present', value: att.Present || 0, color: 'var(--green-600)' },
              { label: 'Late', value: att.Late || 0, color: 'var(--gold-600)' },
              { label: 'Leave', value: att.Leave || 0, color: 'var(--blue-500)' },
              { label: 'Absent', value: att.Absent || 0, color: 'var(--red-600)' },
            ], {
              centerValue: `${Number(att.percentage || 0)}%`,
              centerLabel: 'attended',
              emptyText: 'No attendance marked yet',
              title: 'Attendance breakdown',
            })}
            <p class="tiny muted mt-3">Attendance counts Present and Late as attended, as recorded by your teacher.</p>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Recent fee payments</h2>
            <a class="link-arrow" href="payments.html">Fees &amp; receipts ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body">
            <ul class="list-rows">${(d.recentPayments || []).map((p) => `<li class="list-row">
              <span class="row-date"><strong>${esc(monthLabel(p.billing_month))}</strong><small>${esc(fmtDate(p.payment_date || p.created_at))}</small></span>
              <div class="row-main"><strong>${esc(money(p.amount, currency))}</strong>
                <span class="tiny muted">${esc(p.method_label || p.method || '')}${p.reference ? ` · ${esc(p.reference)}` : ''}</span></div>
              <span class="badge badge-${tone(p.status)}">${esc(p.status)}</span>
              ${p.status === 'Verified' ? `<button type="button" class="btn btn-sm btn-ghost" data-receipt="${p.id}">Receipt</button>` : ''}
            </li>`).join('') || `<li>${emptyState('No payments yet', 'Your submitted fee payments and receipts will be listed here.')}</li>`}</ul>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Announcements</h2>
            <a class="link-arrow" href="notifications.html">All ${icon('external', 'icon-xs')}</a></header>
          <div class="panel-body">
            <ul class="notif-list">${(d.notifications || []).slice(0, 6).map((n) => window.SUQPortal.notificationItem(n)).join('')
              || `<li class="notif-empty">No announcements yet.</li>`}</ul>
          </div>
        </section>
      </div>`;
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
});

/* ----------------------------------------------------------- payments ---- */

const METHOD_ICONS = { bank: 'wallet', easypaisa: 'phone', jazzcash: 'phone', cash: 'wallet' };

registerPage('payments', async () => {
  const me = await initPortal('student');
  if (!me) return;
  const host = document.querySelector('#pay');
  host.innerHTML = skeletonRows(6);
  await renderPayments(host);
});

async function renderPayments(host) {
  try {
    const d = await api.get('/student/payments');
    const currency = d.academy?.currency || 'PKR';
    renderFeeBanner(d.billing);
    const methods = (d.methods || []).filter((m) => m.enabled);
    const payable = d.payableMonths || [];
    const missingConfig = [];
    if (!d.academy?.iban && !d.academy?.bankAccountNumber) missingConfig.push('bank transfer details');
    if (!d.academy?.easypaisa) missingConfig.push('Easypaisa number');
    if (!d.academy?.jazzcash) missingConfig.push('JazzCash number');

    host.innerHTML = `
      <div class="stat-grid">
        <article class="stat-card"><span class="icon-badge">${icon('wallet')}</span>
          <div><small>Monthly fee</small><strong>${esc(money(d.fee, currency))}</strong>
          <span class="tiny muted">${esc(d.course || 'No active course')}</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('checkCircle')}</span>
          <div><small>Verified total</small><strong>${esc(money(d.summary?.paid, currency))}</strong>
          <span class="tiny muted">Across all months</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('clock')}</span>
          <div><small>Awaiting verification</small><strong>${esc(money(d.summary?.pending, currency))}</strong>
          <span class="tiny muted">Checked by the academy office</span></div></article>
        <article class="stat-card"><span class="icon-badge">${icon('alert')}</span>
          <div><small>Unpaid months</small><strong>${(d.unpaidMonths || []).length}</strong>
          <span class="tiny muted">${(d.unpaidMonths || []).map((m) => esc(m.label || monthLabel(m.month))).join(', ') || 'None outstanding'}</span></div></article>
      </div>

      <section class="panel">
        <header class="panel-head"><h2>Submit a fee payment</h2></header>
        <div class="panel-body">
          ${payable.length ? '' : '<div class="alert alert-success">Every month up to now is either verified or already submitted for verification. Nothing to pay right now.</div>'}
          ${missingConfig.length ? `<div class="alert alert-info">${icon('info')}<div>The academy has not yet published its ${esc(missingConfig.join(', '))}. Contact the office for the correct details, or pay with a method shown below.</div></div>` : ''}
          <p class="tiny muted">Transfer the exact monthly fee, then submit the transaction reference and a screenshot of the receipt. Your payment is marked <strong>Pending</strong> until the academy verifies it — submitting the form does not mark the fee as paid.</p>
          <div class="method-cards">
            ${methods.map((m) => `<article class="method-card">
              <header>${icon(METHOD_ICONS[m.code] || 'wallet')}<h3>${esc(m.name)}</h3>
                ${m.gateway ? '<span class="badge badge-info">Live gateway ready</span>' : ''}</header>
              <dl>${methodDetails(m, d.academy).map(([k, v]) => `<div><dt>${esc(k)}</dt>
                <dd>${esc(v)}<button type="button" class="copy-btn" data-copy="${esc(v)}">${icon('copy', 'icon-xs')} Copy</button></dd></div>`).join('')
                || '<div><dt>Details</dt><dd class="muted">Ask the academy office for the current details.</dd></div>'}</dl>
              ${m.instructions ? `<p class="tiny muted">${esc(m.instructions)}</p>` : ''}
              <button type="button" class="btn btn-sm btn-outline" data-pay-method="${esc(m.code)}"${payable.length ? '' : ' disabled'}>Submit ${esc(m.name)} payment</button>
            </article>`).join('') || emptyState('No payment method is enabled', 'Please contact the academy office to arrange your fee payment.')}
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head"><h2>Payment history</h2>
          <div class="toolbar"><label class="sr-only" for="pay-filter">Filter by status</label>
            <select class="select select-sm" id="pay-filter">
              <option value="">All statuses</option><option>Verified</option><option>Pending</option><option>Rejected</option>
            </select></div></header>
        <div class="panel-body">
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Month</th><th>Amount</th><th>Method</th><th>Reference</th><th>Submitted</th><th>Status</th><th class="ta-right">Receipt</th></tr></thead>
            <tbody id="pay-history">${paymentRows(d.payments, currency)}</tbody></table></div>
        </div>
      </section>`;

    const filter = document.querySelector('#pay-filter');
    filter?.addEventListener('change', () => {
      const list = filter.value ? d.payments.filter((p) => p.status === filter.value) : d.payments;
      document.querySelector('#pay-history').innerHTML = paymentRows(list, currency);
    });

    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pay-method]');
      if (btn) openPaymentModal(btn.dataset.payMethod, d, host);
    });
  } catch (err) {
    host.innerHTML = errorState(err.message);
  }
}

function methodDetails(method, academy = {}) {
  const rows = [];
  if (method.code === 'bank') {
    if (academy.bankName) rows.push(['Bank', academy.bankName]);
    if (academy.accountTitle) rows.push(['Account title', academy.accountTitle]);
    if (academy.iban) rows.push(['IBAN', academy.iban]);
    if (academy.bankAccountNumber) rows.push(['Account number', academy.bankAccountNumber]);
  } else if (method.code === 'easypaisa') {
    if (academy.easypaisa) rows.push(['Easypaisa number', academy.easypaisa]);
    if (academy.easypaisaTitle) rows.push(['Account title', academy.easypaisaTitle]);
  } else if (method.code === 'jazzcash') {
    if (academy.jazzcash) rows.push(['JazzCash number', academy.jazzcash]);
    if (academy.jazzcashTitle) rows.push(['Account title', academy.jazzcashTitle]);
  }
  if (method.account_detail) rows.push(['Details', method.account_detail]);
  return rows;
}

function paymentRows(payments, currency) {
  if (!payments?.length) {
    return `<tr><td colspan="7">${emptyState('No payments recorded', 'Once you submit a fee payment it will appear here with its verification status.')}</td></tr>`;
  }
  return payments.map((p) => `<tr>
    <td>${esc(monthLabel(p.billing_month))}</td>
    <td>${esc(money(p.amount, currency))}</td>
    <td>${esc(p.method_label || p.method || '')}</td>
    <td class="mono">${esc(p.reference || '—')}</td>
    <td>${esc(fmtDate(p.created_at))}</td>
    <td>${badge(p.status)}${p.status === 'Rejected' && p.admin_note ? `<span class="tiny muted block">${esc(p.admin_note)}</span>` : ''}</td>
    <td class="ta-right">${p.status === 'Verified'
      ? `<button type="button" class="btn btn-sm btn-ghost" data-receipt="${p.id}">${icon('download', 'icon-xs')} ${esc(p.receipt_no || 'Receipt')}</button>`
      : '<span class="muted tiny">—</span>'}</td></tr>`).join('');
}

function openPaymentModal(code, data, host) {
  const method = (data.methods || []).find((m) => m.code === code);
  const currency = data.academy?.currency || 'PKR';
  const months = data.payableMonths || [];
  const needsProof = code !== 'cash';
  modal({
    title: `Submit ${method?.name || 'payment'}`,
    subtitle: `The academy verifies every payment before it counts as paid.`,
    body: `<form id="pay-form" class="stack" novalidate>
      <div class="alert alert-info">${icon('info')}<div>Amount must match the monthly fee exactly: <strong>${esc(money(data.fee, currency))}</strong>.</div></div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="pm-month">Billing month <span class="req">*</span></label>
          <select class="select" id="pm-month" name="billingMonth" required>
            ${months.map((m) => `<option value="${esc(m.month)}">${esc(m.label || monthLabel(m.month))}</option>`).join('')}
          </select><span class="error-text"></span></div>
        <div class="field"><label for="pm-amount">Amount (${esc(currency)}) <span class="req">*</span></label>
          <input class="input" id="pm-amount" name="amount" type="number" min="0" step="1" value="${Number(data.fee || 0)}" required>
          <span class="error-text"></span></div>
      </div>
      <div class="grid grid-cols-2">
        <div class="field"><label for="pm-date">Payment date <span class="req">*</span></label>
          <input class="input" id="pm-date" name="paymentDate" type="date" max="${esc(pkNow().date)}" value="${esc(pkNow().date)}" required>
          <span class="help">Today's date in Pakistan is ${esc(pkNow().date)}.</span><span class="error-text"></span></div>
        <div class="field"><label for="pm-ref">Transaction reference ${needsProof ? '<span class="req">*</span>' : ''}</label>
          <input class="input" id="pm-ref" name="reference" maxlength="80" ${needsProof ? 'required' : ''} placeholder="e.g. TRX8842190">
          <span class="error-text"></span></div>
      </div>
      ${needsProof ? `<div class="field"><label>Payment screenshot <span class="req">*</span></label>
        <label class="file-drop" data-value=""><input type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <span class="icon-badge">${icon('upload')}</span>
          <span data-drop-label>Upload the transfer receipt (PNG, JPG or WEBP, under 700 KB)</span></label>
        <div class="file-preview"></div><span class="error-text">A payment screenshot is required.</span></div>`
      : `<div class="alert alert-warning">${icon('alert')}<div>Record the cash handover here. The academy office will confirm receipt before it is marked verified.</div></div>`}
      <div class="field"><label for="pm-note">Note for the office</label>
        <textarea class="textarea" id="pm-note" name="note" maxlength="500" rows="2"></textarea></div>
    </form>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-pay-submit>Submit for verification</button>`,
    onMount(box) {
      box.querySelector('[data-pay-submit]').addEventListener('click', async (e) => {
        const form = box.querySelector('#pay-form');
        clearFieldErrors(form);
        const v = formValues(form);
        const proof = box.querySelector('.file-drop')?.dataset.value || '';
        if (!v.billingMonth) { fieldError(form.elements.billingMonth, 'Choose the billing month.'); return; }
        if (Number(v.amount) !== Number(data.fee)) {
          fieldError(form.elements.amount, `The amount must be exactly ${money(data.fee, currency)}.`);
          return;
        }
        if (needsProof && !v.reference.trim()) { fieldError(form.elements.reference, 'Enter the transaction reference.'); return; }
        if (needsProof && !proof) {
          box.querySelector('.file-drop').closest('.field').classList.add('has-error');
          return;
        }
        setLoading(e.currentTarget, true);
        try {
          await api.post('/payments', {
            method: code,
            billingMonth: v.billingMonth,
            amount: Number(v.amount),
            paymentDate: v.paymentDate,
            reference: v.reference,
            note: v.note,
            proof: proof || undefined,
          });
          closeModal();
          toast('Payment submitted. The academy will verify it and your receipt will appear here.', 'success', 'Pending verification');
          host.innerHTML = skeletonRows(6);
          await renderPayments(host);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoading(e.currentTarget, false);
        }
      });
    },
  });
}

/* ------------------------------------------------------------ receipts --- */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-receipt]');
  if (!btn) return;
  setLoading(btn, true);
  try {
    const { receipt, academy } = await api.get(`/student/receipt?id=${encodeURIComponent(btn.dataset.receipt)}`);
    showReceipt(receipt, academy);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
});

function showReceipt(r, academy = {}) {
  const currency = academy.currency || 'PKR';
  modal({
    title: 'Fee receipt',
    subtitle: r.receipt_no || '',
    wide: true,
    body: `<div class="receipt" id="receipt-print">
      <header class="receipt-head">
        <div><img src="assets/logo-badge.png" alt="" width="52" height="52">
          <div><strong>${esc(academy.name || 'Samad-ul-Qur\'an Academy')}</strong>
          <span class="tiny muted">${esc(academy.email || '')}${academy.phone ? ` · ${esc(academy.phone)}` : ''}</span></div></div>
        <div class="receipt-no"><small>Receipt</small><strong>${esc(r.receipt_no || '—')}</strong></div>
      </header>
      <dl class="receipt-grid">
        <div><dt>Student</dt><dd>${esc(r.student_name || r.email || '')}</dd></div>
        <div><dt>Course</dt><dd>${esc(r.course || '—')}</dd></div>
        <div><dt>Billing month</dt><dd>${esc(monthLabel(r.billing_month))}</dd></div>
        <div><dt>Payment method</dt><dd>${esc(r.method_label || r.method || '')}</dd></div>
        <div><dt>Reference</dt><dd class="mono">${esc(r.reference || '—')}</dd></div>
        <div><dt>Payment date</dt><dd>${esc(fmtDate(r.payment_date))}</dd></div>
        <div><dt>Verified on</dt><dd>${esc(fmtDateTime(r.verified_at))}</dd></div>
        <div><dt>Verified by</dt><dd>${esc(r.verified_by || 'Academy office')}</dd></div>
      </dl>
      <div class="receipt-total"><span>Amount received</span><strong>${esc(money(r.received_amount ?? r.amount, currency))}</strong></div>
      <p class="tiny muted">This receipt confirms a verified fee payment recorded by ${esc(academy.name || 'the academy')}.</p>
    </div>`,
    footer: `<button type="button" class="btn btn-ghost" data-modal-close>Close</button>
      <button type="button" class="btn btn-primary" data-print-receipt>${icon('print')} Print or save as PDF</button>`,
    onMount(box) {
      box.querySelector('[data-print-receipt]').addEventListener('click', () => {
        document.body.classList.add('printing-receipt');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-receipt'), 500);
      });
    },
  });
}

window.SUQStudent = { classRow, tone, paymentRows, showReceipt, joinClass };
})();
