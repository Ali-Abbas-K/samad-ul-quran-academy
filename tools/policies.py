"""Policy and legal pages.

Content mirrors the rules the server actually enforces (see server/src/billing.js)
so the published policy and the software never disagree. Business identifiers
such as the IBAN and account title are bound with data-academy=".." and are
filled at runtime from /api/public/settings — never hard-coded here.
"""
from __future__ import annotations

from partials import public_page, page_hero

CRUMB_HOME = ("index.html", "Home")

UPDATED = "Last reviewed: 1 September 2026"


def _toc(items: list[tuple[str, str]]) -> str:
    links = "\n            ".join(f'<a href="#{i}">{t}</a>' for i, t in items)
    return f"""      <aside class="toc" aria-label="On this page">
        <p class="eyebrow">On this page</p>
        <nav>
            {links}
        </nav>
      </aside>"""


def _legal(*, page: str, title: str, desc: str, blurb: str,
           sections: list[tuple[str, str, str]]) -> str:
    """sections = [(anchor_id, heading, html_body), ...]"""
    toc = _toc([(sid, heading) for sid, heading, _ in sections])
    articles = "\n\n".join(
        f'        <section id="{sid}">\n          <h2>{heading}</h2>\n{body}\n        </section>'
        for sid, heading, body in sections
    )
    body_html = f"""{page_hero(title, blurb, [CRUMB_HOME, ("#", title)], eyebrow="Policies")}

    <section class="section">
      <div class="container legal-layout">
{toc}
        <article class="prose">
        <p class="tiny muted">{UPDATED}</p>

{articles}

        <hr class="hr-soft">
        <p class="tiny muted">Questions about this policy? Email
          <a data-academy="email">samadulquran@gmail.com</a> or call
          <a data-academy="phone">+92 347 52 44 717</a>.</p>
        </article>
      </div>
    </section>"""
    return public_page(page=page, title=title, desc=desc, body=body_html)


# ----------------------------------------------------------------- terms ---

def terms() -> str:
    return _legal(
        page="policy-terms",
        title="Terms of Service",
        desc="The terms that govern enrolment, classes, fees and use of the Samad-ul-Qur'an Academy online platform.",
        blurb="The agreement between you and the academy when you enrol in or teach a course.",
        sections=[
            ("acceptance", "1. Acceptance of these terms", """
          <p>By submitting an admission application, signing in to a student, teacher or
          administrator account, or attending a class hosted by
          <span data-academy="name">Samad-ul-Qur'an Academy</span>, you agree to these terms.
          If you are under 18, a parent or guardian must accept them on your behalf and
          their contact details must be provided on the admission form.</p>"""),
            ("service", "2. What the academy provides", """
          <p>The academy provides scheduled, teacher-led online Qur'an and Islamic studies
          lessons delivered one-to-one over a secure video room, together with a portal for
          attendance, lesson history, messaging and fee records.</p>
          <ul>
            <li>Class times are agreed at admission and are stated in Pakistan Standard Time (Asia/Karachi).</li>
            <li>Lessons are held on the weekdays selected on your admission form.</li>
            <li>A teacher is assigned by the administration after your application is approved.</li>
          </ul>"""),
            ("accounts", "3. Accounts and security", """
          <p>Each account belongs to one person. You are responsible for keeping your
          password confidential and for all activity under your account. Sessions expire
          automatically and you should sign out on shared devices. Tell us immediately if
          you believe your account has been accessed by someone else.</p>
          <p>Accounts are created by the academy. Public self-registration is disabled by
          design: a student account is created when an admission application is submitted,
          and teacher accounts are created by the administration after review.</p>"""),
            ("conduct", "4. Conduct during classes", """
          <p>Lessons are a place of learning and adab. Recording, photographing or
          re-broadcasting a lesson without written permission is not allowed. Abusive
          language, disruptive behaviour or sharing a class link with a third party may
          lead to suspension.</p>
          <p>Messages exchanged in the portal between students and teachers are visible to
          the academy administration for safeguarding purposes.</p>"""),
            ("fees", "5. Fees", """
          <p>Fees are monthly, per course, and are shown on each course page and in your
          portal before you enrol. The full fee schedule, due dates and the suspension
          rules are set out in the <a href="payment-policy.html">Fee &amp; Payment Policy</a>,
          which forms part of these terms.</p>"""),
            ("suspension", "6. Suspension and termination", """
          <p>Access to classes may be suspended when a month's fee remains unverified after
          the final grace date, or when these terms are breached. Suspension pauses
          classes; it does not delete your account, lesson history, attendance record or
          payment record. Access is restored automatically once an outstanding payment is
          verified by the administration.</p>
          <p>You may stop attending at any time by telling the administration in writing.
          Fees already due for months in which classes were delivered remain payable.</p>"""),
            ("liability", "7. Availability and liability", """
          <p>Online lessons depend on your internet connection, device and electricity
          supply, which are outside the academy's control. Where a class cannot be held for
          a reason attributable to the academy or the teacher, a replacement class is
          arranged at no extra cost. The academy is not liable for indirect or consequential
          loss arising from a missed class.</p>"""),
            ("changes", "8. Changes to these terms", """
          <p>These terms may be updated as the academy's operations change. The review date
          at the top of this page always reflects the current version, and material changes
          are announced as a notification inside the portal.</p>"""),
            ("law", "9. Governing law", """
          <p>These terms are governed by the laws of the Islamic Republic of Pakistan.
          Disputes will first be addressed directly with the administration in good faith
          before any other step is taken.</p>"""),
        ])


# --------------------------------------------------------------- privacy ---

def privacy() -> str:
    return _legal(
        page="policy-privacy",
        title="Privacy Policy",
        desc="What personal data Samad-ul-Qur'an Academy collects, why it is collected, how long it is kept and how to request a copy or deletion.",
        blurb="What we collect, why we collect it, and the control you have over it.",
        sections=[
            ("collect", "1. Data we collect", """
          <ul>
            <li><strong>Admission details</strong> — student name, email, phone, WhatsApp number,
              age, gender, country, timezone, chosen course, preferred timing and days, and
              for applicants under 18 the guardian's name and phone number.</li>
            <li><strong>Account data</strong> — a securely hashed password, role, account status,
              profile photo if you upload one, and sign-in timestamps.</li>
            <li><strong>Learning data</strong> — class schedule, attendance status and notes,
              progress notes written by your teacher.</li>
            <li><strong>Payment data</strong> — method, amount, billing month, payment date,
              transaction reference and the proof image you upload, plus verification notes
              and the receipt number issued.</li>
            <li><strong>Messages</strong> — portal messages between students and teachers, and
              enquiries submitted through the public contact form.</li>
            <li><strong>Technical data</strong> — the IP address used for sign-in attempts, kept
              only to rate-limit abuse.</li>
          </ul>
          <p>We do not collect card numbers or bank credentials. Fee transfers happen in your
          own banking or wallet application; the academy only receives the proof you choose
          to upload.</p>"""),
            ("why", "2. Why we use it", """
          <p>To deliver and schedule lessons, mark and report attendance, calculate and
          reconcile monthly fees, issue receipts, contact you about your classes, and keep
          the safeguarding and audit records a teaching institution needs.</p>
          <p>We do not sell personal data, and we do not use it for advertising.</p>"""),
            ("proof", "3. Payment proof images", """
          <p>Proof screenshots are stored so the administration can verify a transfer and so
          you have evidence of the payment attached to your receipt. Please crop out any
          part of a screenshot that is not needed to prove the transfer, such as your full
          account balance or unrelated transactions.</p>"""),
            ("access", "4. Who can see your data", """
          <ul>
            <li>You can see your own records at any time in your portal.</li>
            <li>Your assigned teacher can see your name, contact details, schedule,
              attendance and progress — not your payment proofs.</li>
            <li>The administration can see all records, and every administrative action is
              written to an audit log.</li>
          </ul>
          <p>Live classes are hosted on Jitsi Meet, which processes the audio and video
          stream for the duration of the class. No other third party receives your data.</p>"""),
            ("retention", "5. How long we keep it", """
          <p>Academic and financial records are retained while your account exists and for as
          long as tax and audit obligations require. Suspending an account does not delete
          its history. Sign-in rate-limit records are discarded within hours.</p>"""),
            ("children", "6. Children's privacy", """
          <p>Many of our students are children. A guardian's name and phone number are
          required for applicants under 18, and a guardian may request access to, correction
          of, or deletion of their child's record at any time.</p>"""),
            ("rights", "7. Your rights", """
          <p>You may ask us to show you the data we hold about you, correct anything
          inaccurate, or delete data we are not legally required to keep. Most details can
          be corrected yourself from the profile page in your portal. For anything else,
          email <a data-academy="email">samadulquran@gmail.com</a> and we will
          respond within 30 days.</p>"""),
            ("security", "8. Security", """
          <p>Passwords are stored only as salted scrypt hashes and are never recoverable in
          plain text. Sessions use short-lived signed tokens. Every page is served with a
          strict content security policy, and all administrative changes are logged. No
          system is perfectly secure, so please use a unique password and tell us at once if
          something looks wrong.</p>"""),
        ])


# --------------------------------------------------------------- payments ---

def payment_policy() -> str:
    return _legal(
        page="policy-payment",
        title="Fee & Payment Policy",
        desc="Monthly fee dates, the grace period, automatic suspension rules and the accepted payment methods at Samad-ul-Qur'an Academy.",
        blurb="Clear dates, clear methods, and no surprises about suspension.",
        sections=[
            ("cycle", "1. The monthly cycle", """
          <p>Fees are charged per calendar month, per course, in
          <span data-academy="currency">PKR</span>. Every date below is evaluated in Pakistan
          Standard Time (Asia/Karachi) by the system itself, not manually.</p>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Date</th><th>What happens</th></tr></thead>
              <tbody>
                <tr><td><strong>1st</strong></td><td>The new month's fee becomes payable and appears in your portal.</td></tr>
                <tr><td><strong>5th</strong></td><td>Due date. A reminder notification is sent.</td></tr>
                <tr><td><strong>6th &ndash; 8th</strong></td><td>Grace period. Classes continue as normal. The 8th is the final grace day.</td></tr>
                <tr><td><strong>9th</strong></td><td>If the month's fee is still unverified, the account is suspended automatically.</td></tr>
              </tbody>
            </table>
          </div>
          <p class="tiny muted">If the administration changes these dates in the settings, your
          portal and your reminders update with them.</p>"""),
            ("submit", "2. How to submit a payment", """
          <ol>
            <li>Transfer the exact monthly fee using one of the accepted methods below.</li>
            <li>Open <strong>Fees &amp; Payments</strong> in your student portal.</li>
            <li>Choose the billing month and method, enter the transaction reference and
              upload a clear screenshot or photo of the receipt.</li>
            <li>Wait for the administration to verify it. You will receive a notification and
              a numbered receipt.</li>
          </ol>
          <div class="alert alert-warning">
            <p>Submitting the form is <strong>not</strong> payment confirmation. A month counts
            as paid only after an administrator has verified the transfer against the
            academy's own account statement.</p>
          </div>"""),
            ("methods", "3. Accepted methods", """
          <p>Only the methods enabled by the academy are shown in your portal. Bank transfer
          details are held in the academy settings and displayed there:</p>
          <ul>
            <li><strong>Bank transfer</strong> &mdash; account title
              <span data-academy="accountTitle">&mdash;</span>, IBAN
              <span class="mono" data-academy="iban">&mdash;</span>.</li>
            <li><strong>Easypaisa</strong> &mdash; mobile wallet transfer.</li>
            <li><strong>JazzCash</strong> &mdash; mobile wallet transfer.</li>
            <li><strong>Cash</strong> &mdash; recorded by the office; no reference or proof needed.</li>
          </ul>
          <p>Always send the exact fee amount. Bank or wallet charges, if any, are borne by
          the sender. Never send money to an account that is not shown in your portal, and
          contact the office if anything looks different from the details above.</p>"""),
            ("statuses", "4. Payment statuses", """
          <ul>
            <li><span class="badge badge-pending">Pending</span> submitted and awaiting verification.</li>
            <li><span class="badge badge-verified">Verified</span> confirmed against the academy's account; a receipt number is issued. Verification is final and cannot be reversed.</li>
            <li><span class="badge badge-rejected">Rejected</span> the proof could not be matched. The reason is always recorded and shown to you, and you may submit again.</li>
            <li><span class="badge badge-overdue">Overdue</span> the due date has passed with no verified payment for that month.</li>
          </ul>"""),
            ("suspension", "5. Suspension and reactivation", """
          <p>Suspension pauses your access to live classes. It does <strong>not</strong> delete
          your account, your course history, your attendance record or your payments. As
          soon as an administrator verifies the outstanding payment, your account is
          reactivated automatically and your usual class times resume.</p>
          <p>If you are in genuine difficulty, contact the office before the 8th. The academy
          would far rather arrange something than suspend a student.</p>"""),
            ("arrears", "6. Arrears and multiple months", """
          <p>If more than one month is unpaid, your portal lists each payable month
          separately so you can clear them one at a time. Each submission must name the
          month it is for.</p>"""),
            ("receipts", "7. Receipts", """
          <p>A receipt is generated for every verified payment, numbered in the form
          <span class="mono">SUQ-YYYYMM-000123</span>, and can be viewed or printed from your
          portal at any time.</p>"""),
        ])


# ---------------------------------------------------------------- refunds ---

def refund_policy() -> str:
    return _legal(
        page="policy-refund",
        title="Refund Policy",
        desc="When fees paid to Samad-ul-Qur'an Academy can be refunded or credited, and how to request it.",
        blurb="How we handle refunds, credits and classes the academy could not deliver.",
        sections=[
            ("principle", "1. Our principle", """
          <p>Fees pay for teaching time that has been reserved for you. Where the academy
          delivers the classes, the fee is not refundable. Where the academy could not
          deliver them, you should not be out of pocket.</p>"""),
            ("eligible", "2. When a refund or credit is given", """
          <ul>
            <li><strong>Classes the academy missed</strong> &mdash; a replacement class is offered
              first. If a replacement cannot be arranged within the same or the following
              month, the pro-rata amount is credited to your next month's fee.</li>
            <li><strong>Duplicate payment</strong> &mdash; if the same month is paid twice, the extra
              amount is credited to the next month, or refunded on request.</li>
            <li><strong>Payment for a course you were never enrolled in</strong> &mdash; refunded in
              full.</li>
            <li><strong>Cancellation before the first class</strong> &mdash; if you cancel before any
              class of a newly paid month has been held, that month is refunded in full.</li>
          </ul>"""),
            ("not", "3. When a refund is not given", """
          <ul>
            <li>Classes you did not attend without notice, and classes marked Absent.</li>
            <li>Part-months after teaching has begun, except in the pro-rata case above.</li>
            <li>Interruptions caused by your own internet connection, device or power supply.</li>
            <li>Months during which the account was suspended for non-payment.</li>
          </ul>"""),
            ("leave", "4. Planned leave", """
          <p>Tell your teacher and the office in advance and your absence is recorded as
          <span class="badge badge-leave">Leave</span> rather than Absent. For a planned break
          of a full month or more, notify the office before the 1st and no fee is raised for
          that month.</p>"""),
            ("how", "5. How to request one", """
          <p>Email <a data-academy="email">samadulquran@gmail.com</a> or message the
          office on <a data-whatsapp-link target="_blank" rel="noopener">WhatsApp</a>
          with the receipt number, the billing month and a short explanation. Requests are
          reviewed within 7 working days and the decision, with its reason, is recorded
          against the payment in your portal.</p>"""),
            ("method", "6. How refunds are paid", """
          <p>Refunds are returned by the same method and to the same account the payment came
          from. Credits are applied automatically to your next billing month and are visible
          in your portal.</p>"""),
        ])


# ---------------------------------------------------------------- student ---

def student_policy() -> str:
    return _legal(
        page="policy-student",
        title="Student Code of Conduct",
        desc="What Samad-ul-Qur'an Academy asks of its students and guardians during online Qur'an classes.",
        blurb="A short set of expectations that keeps every lesson calm, safe and productive.",
        sections=[
            ("attendance", "1. Attendance and punctuality", """
          <p>Join the class room two or three minutes early. A class begun more than ten
          minutes late is marked <span class="badge badge-late">Late</span>; Late still counts
          towards your monthly attendance rate. If you cannot attend, tell your teacher
          beforehand so the class is recorded as
          <span class="badge badge-leave">Leave</span> rather than
          <span class="badge badge-absent">Absent</span>.</p>"""),
            ("prepare", "2. Preparation", """
          <ul>
            <li>Have your Qur'an or Qaida, notebook and pen ready before the class starts.</li>
            <li>Complete the revision (sabaq, sabqi and manzil) your teacher assigns.</li>
            <li>Test your microphone, camera and internet connection in advance.</li>
          </ul>"""),
            ("adab", "3. Adab in the class", """
          <p>Begin with salaam, sit in a clean and quiet place, dress modestly, and speak to
          your teacher with respect. Keep the camera on where the guardian has agreed to it,
          and use a plain background. Please avoid eating during the lesson.</p>"""),
            ("guardians", "4. Guardians", """
          <p>For students under 18 we ask a guardian to be within earshot of the lesson, to
          keep the contact details on the admission form current, and to raise any concern
          with the office rather than only with the teacher. Guardians are welcome to sit in
          on a class at any time.</p>"""),
            ("safeguarding", "5. Safeguarding", """
          <p>All portal messages between students and teachers are visible to the academy
          administration. Teachers will never ask a student to move a conversation to a
          private channel, request money, or share a personal payment number. If anything of
          the kind happens, report it to
          <a data-academy="email">samadulquran@gmail.com</a> immediately.</p>"""),
            ("privacy", "6. Recording and sharing", """
          <p>Do not record, screenshot or share a class or a class link without written
          permission from the academy. Class rooms are generated per student and per course
          and are not to be forwarded to anyone.</p>"""),
            ("consequences", "7. If the code is broken", """
          <p>The usual first step is a conversation with the guardian. Repeated disruption
          may lead to a change of teacher, a temporary pause, or withdrawal from the course.
          Any such action is recorded with its reason, and your history and payments are
          never deleted.</p>"""),
        ])


# ---------------------------------------------------------------- teacher ---

def teacher_policy() -> str:
    return _legal(
        page="policy-teacher",
        title="Teacher Policy",
        desc="Responsibilities, conduct and safeguarding requirements for teachers at Samad-ul-Qur'an Academy.",
        blurb="What the academy expects from every teacher on its faculty.",
        sections=[
            ("appointment", "1. Appointment", """
          <p>Teachers are appointed after review of their qualification, sanad or ijazah where
          applicable, teaching experience and a trial lesson. Accounts are created by the
          administration; there is no public teacher self-registration. Applications are made
          through <a href="teacher-register.html">Teach With Us</a>.</p>"""),
            ("duties", "2. Core duties", """
          <ul>
            <li>Hold every scheduled class on time, in the agreed Pakistan Standard Time slot.</li>
            <li>Mark attendance for each class on the same day, with a short note where useful.</li>
            <li>Keep each student's progress note current so guardians can see real movement.</li>
            <li>Reply to portal messages from students and guardians within 24 hours.</li>
            <li>Tell the office in advance about any leave so cover can be arranged.</li>
          </ul>"""),
            ("quality", "3. Teaching quality", """
          <p>Follow the course syllabus and the level the student was admitted to, correct
          makharij and tajweed patiently, set revision that fits the student's pace, and
          escalate to the administration if a student is falling behind rather than letting
          it drift.</p>"""),
            ("conduct", "4. Conduct and safeguarding", """
          <ul>
            <li>Communicate with students only through the academy portal and the academy's
              own channels. Do not move a student to a private channel.</li>
            <li>Never request or accept fees, gifts or payments directly from a student or
              guardian. All money is handled by the office.</li>
            <li>Keep the camera on, dress and speak appropriately, and treat every student
              and guardian with respect regardless of level or background.</li>
            <li>Do not record or share a class, a class link, or a student's contact details.</li>
          </ul>
          <p>All portal messages are visible to the administration. This protects students
          and teachers alike.</p>"""),
            ("data", "5. Student data", """
          <p>You may see the contact details, schedule, attendance and progress of the
          students assigned to you, and only for the purpose of teaching them. You cannot
          see payment proofs. Do not copy student data out of the portal or discuss a student
          with anyone outside the academy.</p>"""),
            ("absence", "6. Absence and cancellation", """
          <p>Give at least 24 hours' notice for planned leave, and inform the office
          immediately in an emergency. Classes missed by a teacher must be rescheduled within
          the same month wherever possible; the office monitors this.</p>"""),
            ("review", "7. Review and ending an engagement", """
          <p>Teaching is reviewed on attendance punctuality, marking discipline, student
          progress and guardian feedback. Either side may end the engagement with reasonable
          notice; assigned students are handed over with their full progress notes so their
          learning continues without a gap.</p>"""),
        ])


PAGES = {
    "terms.html": terms,
    "privacy-policy.html": privacy,
    "payment-policy.html": payment_policy,
    "refund-policy.html": refund_policy,
    "student-policy.html": student_policy,
    "teacher-policy.html": teacher_policy,
}
