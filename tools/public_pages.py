"""Public marketing + enrolment pages."""
from __future__ import annotations

from partials import ic, public_page, page_hero, auth_page, ACADEMY

CRUMB_HOME = ("index.html", "Home")


def pic(name: str, alt: str, w: int, h: int, *, cls: str = "", lazy: bool = True) -> str:
    loading = ' loading="lazy" decoding="async"' if lazy else ' fetchpriority="high"'
    c = f' class="{cls}"' if cls else ""
    return (f'<picture><source srcset="assets/img/{name}.webp" type="image/webp">'
            f'<img{c} src="assets/img/{name}.jpg" alt="{alt}" width="{w}" height="{h}"{loading}></picture>')


FEATURES = [
    ("user", "One-to-one teaching",
     "Every student is matched with a dedicated teacher, so lessons move at the pace of the student and nothing is skipped."),
    ("users", "Male and female teachers",
     "Sisters and young children can request a female teacher. Family preferences are recorded at admission and respected."),
    ("clock", "Timings that fit your day",
     "Choose your class days and a time window that works in your timezone. Schedules can be adjusted with your teacher."),
    ("certificate", "A clear, staged syllabus",
     "Noorani Qaida to Nazra, Tajweed and Hifz. Each stage has defined outcomes so parents can see real progress."),
    ("checkCircle", "Attendance you can check",
     "Present, absent, late and leave are recorded for every class and visible in your portal at any time."),
    ("shield", "Transparent monthly fees",
     "One monthly fee per course, published on the course page. Payments are only marked paid after the office verifies them."),
]

PROCESS = [
    ("1", "Submit the admission form",
     "Tell us the student's name, age, course, preferred days and a class time window. It takes about three minutes and costs nothing."),
    ("2", "Free trial and teacher match",
     "The academy contacts you on WhatsApp, arranges a trial class and assigns a suitable teacher."),
    ("3", "Admission approved",
     "Once approved, your student account is activated and the monthly class schedule appears in the student portal."),
    ("4", "Join classes online",
     "Classes run in the browser through the academy's secure meeting room. No software installation is needed."),
    ("5", "Pay the monthly fee",
     "Submit your transfer reference and receipt in the portal each month. The office verifies it and issues a numbered receipt."),
]

HOME_FAQ = [
    ("Do you offer a free trial class?",
     "Yes. After you submit the admission form the academy arranges a trial class before any fee is requested. Nothing is charged at the time you apply."),
    ("Which devices can we use?",
     "Any modern browser on a laptop, tablet or phone. Classes open in the browser, and the Android app loads the same portal."),
    ("Can my daughter be taught by a female teacher?",
     "Yes. Note the preference in the admission form's message field and the academy will assign a female teacher where possible."),
    ("What happens if we miss a class?",
     "The class is recorded as absent or leave depending on whether you informed the teacher. Teachers usually arrange a make-up slot within the same week."),
    ("When is the monthly fee due?",
     "The fee is due on the 5th of each month, with a grace period to the 8th. If the current month is still unverified on the 9th, portal access is suspended until the payment is verified. No student record, class history, attendance or payment is ever deleted."),
    ("How do we pay from outside Pakistan?",
     "Bank transfer to the academy's account is the usual route for overseas families. Ask the office on WhatsApp for the details that suit your country."),
]


def _feature_cards() -> str:
    return "\n          ".join(
        f'<article class="card card-hover feature-card reveal"><span class="icon-badge">{ic(i)}</span>'
        f'<h3>{t}</h3><p>{d}</p></article>'
        for i, t, d in FEATURES
    )


def _timeline() -> str:
    return "\n          ".join(
        f'<div class="timeline-item reveal"><span class="timeline-dot">{n}</span>'
        f'<div class="timeline-body"><h3>{t}</h3><p>{d}</p></div></div>'
        for n, t, d in PROCESS
    )


def _accordions(items, group: str = "faq") -> str:
    return "\n          ".join(
        f'<details class="accordion"><summary>{q}</summary>'
        f'<div class="accordion-body"><p>{a}</p></div></details>'
        for q, a in items
    )


PAY_METHODS_BLOCK = """        <div class="grid grid-2">
          <article class="pay-method reveal">
            <span class="icon-badge">""" + ic('wallet') + """</span>
            <div class="col">
              <h3>Bank transfer</h3>
              <p class="sm muted">Recommended for families paying from outside Pakistan.</p>
              <dl class="pay-detail">
                <dt>Account title</dt><dd data-academy="accountTitle">&mdash;</dd>
                <dt>Bank</dt><dd data-academy="bankName">&mdash;</dd>
                <dt>IBAN</dt><dd data-academy="iban">&mdash;</dd>
              </dl>
            </div>
          </article>
          <article class="pay-method reveal">
            <span class="icon-badge icon-badge-gold">""" + ic('phone') + """</span>
            <div class="col">
              <h3>Easypaisa, JazzCash or cash</h3>
              <p class="sm muted">Mobile wallet numbers are published in your student portal once the office has configured them, so you always see the current account.</p>
              <ul class="value-list mt-4">
                <li class="value-item">""" + ic('check') + """<span>Submit your transaction reference and a screenshot in the portal.</span></li>
                <li class="value-item">""" + ic('check') + """<span>The office verifies it and issues a numbered receipt.</span></li>
                <li class="value-item">""" + ic('check') + """<span>A payment is never marked paid just because a form was submitted.</span></li>
              </ul>
            </div>
          </article>
        </div>"""


def home() -> str:
    body = f"""    <section class="hero">
      <div class="container hero-inner">
        <div>
          <p class="hero-bismillah">&#1576;&#1616;&#1587;&#1618;&#1605;&#1616; &#1575;&#1604;&#1604;&#1617;&#1607;&#1616; &#1575;&#1604;&#1585;&#1617;&#1614;&#1581;&#1605;&#1614;&#1606;&#1616; &#1575;&#1604;&#1585;&#1617;&#1614;&#1581;&#1616;&#1610;&#1605;&#1616;</p>
          <h1>Learn the Qur'an properly, <em>from home</em>, with a teacher who knows your child.</h1>
          <p class="hero-sub">{ACADEMY} teaches Noorani Qaida, Nazra, Hifz, Tajweed and Islamic studies in one-to-one online classes. Structured syllabus, recorded attendance, transparent monthly fees and a portal where parents can see exactly what is happening.</p>
          <div class="hero-actions">
            <a class="btn btn-gold btn-lg" href="admissions.html">Enroll Now</a>
            <a class="btn btn-invert btn-lg" href="courses.html">View Courses</a>
          </div>
          <div class="hero-proof">
            <div class="hero-proof-item"><span class="hero-proof-num">1:1</span><span class="hero-proof-label">Live classes</span></div>
            <div class="hero-proof-item"><span class="hero-proof-num">6</span><span class="hero-proof-label">Structured courses</span></div>
            <div class="hero-proof-item"><span class="hero-proof-num">7</span><span class="hero-proof-label">Days a week</span></div>
            <div class="hero-proof-item"><span class="hero-proof-num">PKT</span><span class="hero-proof-label">Any timezone</span></div>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-visual-frame">
            {pic('hero-portrait', 'A student reciting the Qur&#39;an during an online class', 1024, 1536, lazy=False)}
          </div>
          <div class="hero-float">
            <span class="icon-badge">{ic('checkCircle')}</span>
            <span><span class="hero-float-title">Free trial class</span><span class="hero-float-sub">Arranged before any fee is due</span></span>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-tight section-deep" data-stats-section>
      <div class="container">
        <div class="grid grid-4" data-stats></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">Why families choose us</p>
          <h2>Serious Qur'an teaching, run like a proper school</h2>
          <p>Everything below is built into the platform you and your teacher use every day &mdash; not a promise on a brochure.</p>
        </div>
        <div class="grid grid-3">
          {_feature_cards()}
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Our courses</p>
            <h2>Choose the stage your student is at</h2>
            <p>Monthly fees are published on every course. Nothing is charged until the academy approves your admission.</p>
          </div>
          <a class="btn btn-outline" href="courses.html">All courses {ic('external', 'icon-xs')}</a>
        </div>
        <div class="grid grid-3" id="home-courses"></div>
      </div>
    </section>

    <section class="section">
      <div class="container split">
        <div class="split-media">
          {pic('process', 'A teacher preparing an online Qur&#39;an lesson', 1536, 1024)}
          <p class="media-caption">Every admission is reviewed by the academy office before classes begin.</p>
        </div>
        <div>
          <p class="eyebrow">How it works</p>
          <h2>From enquiry to first lesson in five steps</h2>
          <div class="timeline mt-6">
          {_timeline()}
          </div>
          <a class="btn btn-primary mt-6" href="admissions.html">Start the admission form</a>
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container split">
        <div>
          <p class="eyebrow">About the academy</p>
          <h2>A small academy that knows every student by name</h2>
          <p class="lead">{ACADEMY} is an online Qur'an academy based in Pakistan, teaching students in Pakistan, the Gulf, the United Kingdom, Europe and North America. Classes are one-to-one, taught by qualified huffaz and Qur'an teachers.</p>
          <ul class="value-list mt-5">
            <li class="value-item">{ic('check')}<span>Every student has a named teacher and a written syllabus stage.</span></li>
            <li class="value-item">{ic('check')}<span>Attendance and progress notes are recorded after each class.</span></li>
            <li class="value-item">{ic('check')}<span>Parents and adult students can message the teacher inside the portal.</span></li>
            <li class="value-item">{ic('check')}<span>Fees, receipts and account status are always visible &mdash; no surprises.</span></li>
          </ul>
          <div class="btn-row mt-6">
            <a class="btn btn-outline" href="about.html">More about us</a>
            <a class="btn btn-ghost" href="teachers.html">Meet the teachers</a>
          </div>
        </div>
        <div class="split-media">
          {pic('about', 'Qur&#39;an, prayer beads and a notebook on a desk', 1536, 1024)}
        </div>
      </div>
    </section>

    <section class="section" data-section>
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">Our teachers</p>
          <h2>Taught by qualified huffaz and Qur'an teachers</h2>
          <p>Teacher profiles are published by the academy office. Full profiles, qualifications and specialities are on the teachers page.</p>
        </div>
        <div class="grid grid-4" id="home-teachers"></div>
        <p class="center mt-6"><a class="btn btn-outline" href="teachers.html">View all teachers</a></p>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container split">
        <div class="split-media split-media-tall">
          {pic('hero', 'A young student following the lesson on screen', 1536, 1024)}
        </div>
        <div>
          <p class="eyebrow">Parent visibility</p>
          <h2>You can always see what happened in class</h2>
          <p class="lead">The portal is not decoration. It is the same system the teacher and the office use, so what you see is the record.</p>
          <div class="grid grid-2 mt-6">
            <article class="card card-quiet"><h3 class="h5">Attendance log</h3><p class="sm muted">Present, absent, late and leave for every scheduled class, with the teacher's note.</p></article>
            <article class="card card-quiet"><h3 class="h5">Progress notes</h3><p class="sm muted">Current lesson, surah or sabaq recorded by the teacher after class.</p></article>
            <article class="card card-quiet"><h3 class="h5">Fee history</h3><p class="sm muted">Every submission, its status, and a numbered receipt once verified.</p></article>
            <article class="card card-quiet"><h3 class="h5">Direct messaging</h3><p class="sm muted">Message the teacher or the office without swapping personal numbers.</p></article>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Fees &amp; payments</p>
            <h2>One monthly fee, verified by the office</h2>
            <p>Fees are billed monthly per course. The academy accepts bank transfer, Easypaisa, JazzCash and cash.</p>
          </div>
          <a class="btn btn-outline" href="payment-policy.html">Fee policy</a>
        </div>
{PAY_METHODS_BLOCK}
        <div class="alert alert-info mt-6">{ic('info')}<div><strong>Billing dates</strong>Fees are due on the 5th, with a grace period to the 8th. An unverified current month is suspended on the 9th and reactivated as soon as the office verifies the payment. Suspension pauses access only &mdash; records, attendance and payment history are never deleted.</div></div>
      </div>
    </section>

    <section class="section section-alt" data-section>
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Gallery</p>
            <h2>Inside the academy</h2>
            <p>Photographs published by the academy office.</p>
          </div>
          <a class="btn btn-outline" href="gallery.html">Full gallery</a>
        </div>
        <div class="gallery-grid gallery-grid-3" id="home-gallery"></div>
      </div>
    </section>

    <section class="section" data-section>
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">What families say</p>
          <h2>Testimonials from our students and parents</h2>
          <p>Published by the academy office from messages received from families.</p>
        </div>
        <div class="grid grid-3" id="home-testimonials"></div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container container-narrow">
        <div class="section-head section-head-center">
          <p class="eyebrow">Questions</p>
          <h2>Frequently asked questions</h2>
        </div>
        <div class="faq-list" data-accordion-group>
          {_accordions(HOME_FAQ)}
        </div>
        <p class="center mt-6"><a class="link-arrow" href="faq.html">Read the full FAQ {ic('external', 'icon-xs')}</a></p>
      </div>
    </section>

    <section class="container">
      <div class="cta-band">
        {pic('cta', '', 1672, 941)}
        <div class="cta-inner">
          <p class="eyebrow">Begin today</p>
          <h2>Give your family a proper Qur'an teacher this month</h2>
          <p>Submit the admission form and the academy will arrange a free trial class. There is nothing to pay until your admission is approved and you are happy with your teacher.</p>
          <div class="cta-actions">
            <a class="btn btn-gold btn-lg" href="admissions.html">Enroll Now</a>
            <a class="btn btn-invert btn-lg" data-whatsapp-link target="_blank" rel="noopener">{ic('whatsapp')} Ask on WhatsApp</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-tight">
      <div class="container">
        <div class="grid grid-3">
          <article class="contact-item"><span class="icon-badge">{ic('mail')}</span><div><p class="contact-label">Email</p><a data-academy="email">samadulquran@gmail.com</a></div></article>
          <article class="contact-item"><span class="icon-badge">{ic('phone')}</span><div><p class="contact-label">Phone &amp; WhatsApp</p><a data-academy="phone">+92 347 52 44 717</a></div></article>
          <article class="contact-item"><span class="icon-badge">{ic('clock')}</span><div><p class="contact-label">Office hours</p><span class="strong">9:00 &ndash; 21:00 PKT, seven days</span></div></article>
        </div>
      </div>
    </section>"""
    return public_page(
        page="home",
        title=f"{ACADEMY} — Online Qur'an Classes for Children & Adults",
        desc="Learn Noorani Qaida, Nazra, Hifz, Tajweed and Islamic studies in one-to-one online classes with qualified teachers. Recorded attendance, transparent monthly fees and a parent portal.",
        body=body,
    )


def courses() -> str:
    body = f"""{page_hero(
        "Our Qur'an courses",
        "Six structured courses from the very first letters of the Arabic alphabet to full memorisation. Every course is taught one-to-one, with a published monthly fee.",
        [CRUMB_HOME, ("courses.html", "Courses")], eyebrow="Courses")}

    <section class="section">
      <div class="container">
        <div class="toolbar toolbar-card mb-5">
          <div class="search-field">
            {ic('search')}
            <label class="sr-only" for="course-search">Search courses</label>
            <input class="input" id="course-search" type="search" placeholder="Search courses, e.g. Hifz or Tajweed" autocomplete="off">
          </div>
          <label class="sr-only" for="course-level">Filter by level</label>
          <select class="select" id="course-level"><option value="">All levels</option></select>
          <span class="result-count" data-course-count></span>
        </div>
        <div class="grid grid-3" id="courses-grid"></div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container container-narrow">
        <div class="section-head section-head-center">
          <p class="eyebrow">Not sure where to start?</p>
          <h2>We will place your student after the trial class</h2>
          <p>If you are unsure which course suits your child, submit the admission form and choose the closest option. The teacher assesses the student in the trial class and the academy adjusts the course before classes begin.</p>
        </div>
        <p class="center"><a class="btn btn-primary btn-lg" href="admissions.html">Enroll Now</a></p>
      </div>
    </section>"""
    return public_page(
        page="courses", title=f"Courses — {ACADEMY}",
        desc="Noorani Qaida, Nazra Qur'an, Hifz, Tajweed, Namaz and Islamic studies. Structured online Qur'an courses with published monthly fees.",
        body=body)


def course() -> str:
    body = f"""{page_hero(
        "Course details",
        "Full syllabus outline, monthly fee and the teachers available for this course.",
        [CRUMB_HOME, ("courses.html", "Courses"), ("#", "Course")], eyebrow="Course")}

    <section class="section">
      <div class="container" id="course-detail"></div>
    </section>"""
    return public_page(page="course", title=f"Course — {ACADEMY}",
                       desc="Course syllabus, monthly fee and available teachers at Samad-ul-Qur'an Academy.",
                       body=body)


ABOUT_VALUES = [
    ("shield", "Ikhlas and adab",
     "Teachers are chosen for character as much as qualification. Classes begin and end with adab, and every student is treated with patience."),
    ("book", "A syllabus, not improvisation",
     "Each course has defined stages and outcomes, so a student who changes teacher does not start again from the beginning."),
    ("users", "Family involvement",
     "Parents receive attendance and progress records and can message the teacher directly through the portal."),
    ("wallet", "Honest money",
     "One published monthly fee. No registration fee, no hidden charges, and no payment marked as received until the office has verified it."),
]


def about() -> str:
    values = "\n          ".join(
        f'<article class="card card-hover feature-card reveal"><span class="icon-badge">{ic(i)}</span><h3>{t}</h3><p>{d}</p></article>'
        for i, t, d in ABOUT_VALUES)
    body = f"""{page_hero(
        "About Samad-ul-Qur'an Academy",
        "An online Qur'an academy from Pakistan, teaching families around the world one student at a time.",
        [CRUMB_HOME, ("about.html", "About Us")], eyebrow="About us")}

    <section class="section">
      <div class="container split">
        <div>
          <p class="eyebrow">Our story</p>
          <h2>Built because good Qur'an teaching should not depend on your postcode</h2>
          <p class="lead">Many families want their children to read the Qur'an correctly but cannot find a qualified teacher nearby, or cannot travel to a madrasah at a fixed hour every day. {ACADEMY} was founded to remove that barrier.</p>
          <p class="mt-4">We began with a handful of students taught over video call and a paper register. As more families joined, the academy built the system you are using now: an admission workflow, a teacher-assigned class schedule, a recorded attendance log, a monthly fee ledger with verified receipts, and a portal where students, teachers and the office all work from the same information.</p>
          <p class="mt-4">The academy remains deliberately small. Every student is assigned to a named teacher, and the office knows each family. That is the part we are not willing to scale away.</p>
        </div>
        <div class="split-media">
          {pic('about', 'A Qur&#39;an open on a wooden stand', 1536, 1024)}
        </div>
      </div>
    </section>

    <section class="section section-deep" data-stats-section>
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">The academy today</p>
          <h2>Live figures from our system</h2>
          <p>These counts are read directly from the academy database, not written by hand.</p>
        </div>
        <div class="grid grid-4" data-stats></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">What we hold ourselves to</p>
          <h2>Four commitments</h2>
        </div>
        <div class="grid grid-4">
          {values}
        </div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container split">
        <div class="split-media">
          {pic('process', 'A teacher marking a lesson plan', 1536, 1024)}
        </div>
        <div>
          <p class="eyebrow">How we teach</p>
          <h2>One teacher, one student, one clear next step</h2>
          <ul class="value-list mt-5">
            <li class="value-item">{ic('check')}<span><strong>Assessment.</strong> The trial class establishes what the student can already read.</span></li>
            <li class="value-item">{ic('check')}<span><strong>Stage placement.</strong> The academy places the student on the correct course and level.</span></li>
            <li class="value-item">{ic('check')}<span><strong>Daily sabaq.</strong> New lesson, revision and manzil are set according to the course.</span></li>
            <li class="value-item">{ic('check')}<span><strong>Recorded outcome.</strong> The teacher marks attendance and writes a progress note after every class.</span></li>
            <li class="value-item">{ic('check')}<span><strong>Monthly review.</strong> The office reviews attendance and progress before the next month begins.</span></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section" data-section>
      <div class="container">
        <div class="section-head section-head-center">
          <p class="eyebrow">Our team</p>
          <h2>The teachers behind the academy</h2>
        </div>
        <div class="grid grid-4" id="about-teachers"></div>
        <p class="center mt-6"><a class="btn btn-outline" href="teachers.html">See all teacher profiles</a></p>
      </div>
    </section>

    <section class="container">
      <div class="cta-band">
        {pic('cta', '', 1672, 941)}
        <div class="cta-inner">
          <h2>Ready to meet a teacher?</h2>
          <p>Submit the admission form and we will arrange a free trial class at a time that suits your family.</p>
          <div class="cta-actions">
            <a class="btn btn-gold btn-lg" href="admissions.html">Enroll Now</a>
            <a class="btn btn-invert btn-lg" href="contact.html">Contact the office</a>
          </div>
        </div>
      </div>
    </section>"""
    return public_page(page="about", title=f"About Us — {ACADEMY}",
                       desc="Learn about Samad-ul-Qur'an Academy: our story, our teaching method and the commitments we make to every family.",
                       body=body)


def teachers() -> str:
    body = f"""{page_hero(
        "Our teachers",
        "Qualified huffaz and Qur'an teachers, each assigned a small number of students so no one is a number on a register.",
        [CRUMB_HOME, ("teachers.html", "Teachers")], eyebrow="Teachers")}

    <section class="section">
      <div class="container">
        <div class="grid grid-3" id="teachers-grid"></div>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container container-narrow center">
        <p class="eyebrow">Teach with us</p>
        <h2>Are you a qualified Qur'an teacher?</h2>
        <p class="lead mt-4">The academy regularly takes on male and female teachers for Nazra, Tajweed and Hifz classes. Send your details and the office will contact you.</p>
        <a class="btn btn-primary btn-lg mt-6" href="teacher-register.html">Apply to teach</a>
      </div>
    </section>"""
    return public_page(page="teachers", title=f"Our Teachers — {ACADEMY}",
                       desc="Meet the qualified Qur'an teachers of Samad-ul-Qur'an Academy, their qualifications and specialities.",
                       body=body)


def gallery() -> str:
    body = f"""{page_hero(
        "Gallery",
        "Photographs from the academy, published by the office.",
        [CRUMB_HOME, ("gallery.html", "Gallery")], eyebrow="Gallery")}

    <section class="section">
      <div class="container">
        <div class="gallery-grid" id="gallery-grid"></div>
      </div>
    </section>"""
    return public_page(page="gallery", title=f"Gallery — {ACADEMY}",
                       desc="Photographs from Samad-ul-Qur'an Academy classes, events and student achievements.",
                       body=body)


FAQ_GROUPS = [
    ("Admission and trial", [
        ("How do I enrol my child?",
         "Complete the admission form on this website. You will choose a course, class days and a preferred time window, and create a portal password. The academy reviews the application and contacts you to arrange a free trial class."),
        ("Is there a registration or admission fee?",
         "No. There is no registration fee and nothing is charged at the time you apply. The first monthly fee becomes payable only after your admission is approved and classes begin."),
        ("What age do you accept?",
         "From about four years old for Noorani Qaida up to adults. Applicants under eighteen must give a guardian name and phone number on the admission form."),
        ("How long does approval take?",
         "Usually one to two working days. You can check the status any time by signing in to the student portal with the email and password you used on the form."),
    ]),
    ("Classes and teachers", [
        ("How long is each class?",
         "Most classes are thirty to forty-five minutes, five or six days a week. The exact duration is agreed with your teacher and shown on each course page."),
        ("Can we choose our class times?",
         "Yes. You choose your days and a preferred time window on the admission form, and the academy matches you with a teacher who is available then. Timings can be changed later by messaging the office."),
        ("Can we request a female teacher?",
         "Yes. Please note it in the message field of the admission form. The academy assigns a female teacher for sisters and young children wherever possible."),
        ("What software do we need?",
         "None. Classes run in the browser using the academy's meeting room, which opens directly from your portal. The Android app loads the same portal."),
        ("What if the teacher or the student misses a class?",
         "Teachers record every scheduled class as present, absent, late or leave. If you inform the teacher in advance it is recorded as leave, and a make-up class is usually arranged in the same week."),
    ]),
    ("Fees, receipts and suspension", [
        ("How much are the classes?",
         "Each course has its own published monthly fee, shown on the courses page and on the course detail page. One fee covers all of that month's classes for that course."),
        ("Which payment methods do you accept?",
         "Bank transfer, Easypaisa, JazzCash and cash. The exact account details in use are shown in your student portal and are kept up to date by the office."),
        ("How do I submit a payment?",
         "Transfer the exact monthly fee, then open Fees &amp; Payments in your portal, choose the method, enter the transaction reference and upload a screenshot of the receipt. Your payment appears as Pending until the office verifies it."),
        ("When is my payment marked as paid?",
         "Only when the academy office verifies it. Submitting the form does not mark the fee as paid. Once verified, a numbered receipt is issued in your portal and can be printed."),
        ("What happens if I pay late?",
         "The fee is due on the 5th. The 6th to 8th is a grace period, with the 8th being the final grace day. If the current month is still unverified on the 9th, the account is suspended automatically."),
        ("What does suspension actually do?",
         "It pauses access to classes and messaging. It does not delete anything: the student record, course history, attendance and every payment remain intact. As soon as the office verifies your payment, the account is reactivated automatically."),
        ("Do you give refunds?",
         "Refunds are handled case by case as set out in the refund policy. Verified payments for classes already delivered are not refundable."),
    ]),
    ("Accounts and privacy", [
        ("I have forgotten my password.",
         "Contact the academy office by email or WhatsApp. For security, passwords are reset by the office rather than by an automated email link."),
        ("Can I change my email address?",
         "Your email is your sign-in identity, so it is changed by the office. Message the academy from your portal or by WhatsApp and we will update it."),
        ("What data do you keep about my child?",
         "Only what is needed to run the classes: name, contact details, guardian details, course, class records, attendance and payment history. The privacy policy explains this in full."),
        ("Do you record the classes?",
         "The academy does not record video classes. Teachers record written progress notes and attendance only."),
    ]),
]


def faq() -> str:
    groups = []
    for title, items in FAQ_GROUPS:
        groups.append(f"""      <section class="section-inner">
        <h2 class="section-title">{title}</h2>
        <div class="faq-list" data-accordion-group>
          {_accordions(items)}
        </div>
      </section>""")
    body = f"""{page_hero(
        "Frequently asked questions",
        "Admission, classes, fees, suspension and privacy &mdash; answered in detail. If your question is not here, message the office and we will answer it.",
        [CRUMB_HOME, ("faq.html", "FAQ")], eyebrow="Help")}

    <section class="section">
      <div class="container container-narrow">
{chr(10).join(groups)}
        <div class="card card-quiet mt-6 center">
          <h3>Still have a question?</h3>
          <p class="muted mt-2">The office answers WhatsApp messages between 9:00 and 21:00 Pakistan time, seven days a week.</p>
          <div class="btn-row mt-4" style="justify-content:center">
            <a class="btn btn-primary" href="contact.html">Contact us</a>
            <a class="btn btn-outline" data-whatsapp-link target="_blank" rel="noopener">{ic('whatsapp')} WhatsApp</a>
          </div>
        </div>
      </div>
    </section>"""
    return public_page(page="faq", title=f"FAQ — {ACADEMY}",
                       desc="Answers about admission, trial classes, timings, teachers, monthly fees, receipts, suspension rules and privacy at Samad-ul-Qur'an Academy.",
                       body=body)


def contact() -> str:
    body = f"""{page_hero(
        "Contact the academy",
        "Send a message and the office will reply by email or WhatsApp, usually the same day.",
        [CRUMB_HOME, ("contact.html", "Contact")], eyebrow="Contact")}

    <section class="section">
      <div class="container contact-grid">
        <div class="stack-lg">
          <div>
            <p class="eyebrow">Reach us</p>
            <h2>Office contact details</h2>
          </div>
          <article class="contact-item"><span class="icon-badge">{ic('mail')}</span><div><p class="contact-label">Email</p><a data-academy="email">samadulquran@gmail.com</a></div></article>
          <article class="contact-item"><span class="icon-badge">{ic('phone')}</span><div><p class="contact-label">Phone</p><a data-academy="phone">+92 347 52 44 717</a></div></article>
          <article class="contact-item"><span class="icon-badge">{ic('whatsapp')}</span><div><p class="contact-label">WhatsApp</p><a data-whatsapp-link target="_blank" rel="noopener">Start a WhatsApp chat</a></div></article>
          <article class="contact-item" data-hide-wrap><span class="icon-badge">{ic('pin')}</span><div><p class="contact-label">Address</p><span data-academy="address" data-hide-empty></span></div></article>
          <article class="contact-item"><span class="icon-badge">{ic('clock')}</span><div><p class="contact-label">Office hours</p><span>9:00 &ndash; 21:00 Pakistan Standard Time, seven days a week</span></div></article>
          <div class="alert alert-gold">{ic('info')}<div><strong>Already a student?</strong>For fee queries and class changes, message your teacher or the office from inside the <a href="student-login.html">student portal</a> so your request is attached to your record.</div></div>
        </div>

        <div class="form-card">
          <h2>Send a message</h2>
          <p class="muted mt-2">All fields marked <span class="req">*</span> are required.</p>
          <form id="contact-form" class="stack mt-5" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="c-name">Your name <span class="req">*</span></label>
                <input class="input" id="c-name" name="name" required maxlength="120" autocomplete="name">
                <span class="error-text"></span>
              </div>
              <div class="field">
                <label for="c-email">Email address <span class="req">*</span></label>
                <input class="input" id="c-email" name="email" type="email" required maxlength="160" autocomplete="email">
                <span class="error-text"></span>
              </div>
              <div class="field">
                <label for="c-phone">Phone or WhatsApp</label>
                <input class="input" id="c-phone" name="phone" type="tel" maxlength="40" autocomplete="tel">
                <span class="help">Include your country code.</span>
              </div>
              <div class="field">
                <label for="c-subject">Subject</label>
                <select class="select" id="c-subject" name="subject">
                  <option>Admission enquiry</option>
                  <option>Fees and payment</option>
                  <option>Class timings</option>
                  <option>Teaching opportunity</option>
                  <option>Something else</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="c-message">Message <span class="req">*</span></label>
              <textarea class="textarea" id="c-message" name="message" required minlength="10" maxlength="2000" placeholder="Tell us the student's age, the course you are interested in and a good time to call."></textarea>
              <span class="error-text"></span>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary btn-lg" type="submit">Send message</button>
              <span class="tiny muted">We reply by email or WhatsApp.</span>
            </div>
          </form>
          <div class="alert alert-success mt-5" id="contact-success" hidden>
            {ic('checkCircle')}
            <div><strong>Your message has been sent</strong>The office has received your enquiry and will reply soon, in sha Allah. If it is urgent, message us on WhatsApp.</div>
          </div>
        </div>
      </div>
    </section>"""
    return public_page(page="contact", title=f"Contact — {ACADEMY}",
                       desc="Contact Samad-ul-Qur'an Academy by email, phone or WhatsApp, or send a message using the contact form.",
                       body=body)


COUNTRIES = ["Pakistan", "United Kingdom", "United States", "Canada", "Saudi Arabia",
             "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman", "Australia",
             "Germany", "France", "Netherlands", "Norway", "Sweden", "Denmark", "Spain",
             "Italy", "South Africa", "Malaysia", "Indonesia", "Turkey", "Other"]

TIMINGS = ["Early morning (05:00 – 08:00 PKT)", "Morning (08:00 – 12:00 PKT)",
           "Afternoon (12:00 – 16:00 PKT)", "Evening (16:00 – 20:00 PKT)",
           "Night (20:00 – 23:00 PKT)", "Flexible – advise me"]


def admissions() -> str:
    countries = "\n                    ".join(f'<option>{c}</option>' for c in COUNTRIES)
    timings = "\n                    ".join(f'<option>{t}</option>' for t in TIMINGS)
    body = f"""{page_hero(
        "Admission form",
        "Three short steps. There is no registration fee and nothing to pay now &mdash; the academy will arrange a free trial class before your first monthly fee.",
        [CRUMB_HOME, ("admissions.html", "Admission")], eyebrow="Admission")}

    <section class="section">
      <div class="container">
        <div class="panel-grid-sidebar">
          <div id="admission-form-wrap">
            <div class="steps mb-5">
              <div class="step" data-step-dot><span class="step-num">1</span><div><span class="step-label">Student</span><span class="step-desc">Who is enrolling</span></div></div>
              <div class="step" data-step-dot><span class="step-num">2</span><div><span class="step-label">Course &amp; schedule</span><span class="step-desc">What and when</span></div></div>
              <div class="step" data-step-dot><span class="step-num">3</span><div><span class="step-label">Portal account</span><span class="step-desc">Your login</span></div></div>
            </div>

            <div class="form-card">
              <form id="admission-form" novalidate>
                <fieldset data-step>
                  <p class="fieldset-title">Student and contact details</p>
                  <div class="form-grid">
                    <div class="field">
                      <label for="a-name">Student's full name <span class="req">*</span></label>
                      <input class="input" id="a-name" name="studentName" required maxlength="120" autocomplete="name">
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-age">Student's age <span class="req">*</span></label>
                      <input class="input" id="a-age" name="age" type="number" min="4" max="90" required inputmode="numeric">
                      <span class="help">A guardian's details are required under 18.</span>
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-email">Email address <span class="req">*</span></label>
                      <input class="input" id="a-email" name="email" type="email" required maxlength="160" autocomplete="email">
                      <span class="help">This becomes the student portal sign-in.</span>
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-phone">Phone number <span class="req">*</span></label>
                      <input class="input" id="a-phone" name="phone" type="tel" required maxlength="40" autocomplete="tel">
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-whatsapp">WhatsApp number</label>
                      <input class="input" id="a-whatsapp" name="whatsapp" type="tel" maxlength="40">
                      <span class="help">Leave blank if it is the same as above.</span>
                    </div>
                    <div class="field">
                      <label for="a-gender">Gender</label>
                      <select class="select" id="a-gender" name="gender">
                        <option value="">Prefer not to say</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>
                    <div class="field" data-guardian-field>
                      <label for="a-guardian">Guardian's name <span class="req" hidden>*</span></label>
                      <input class="input" id="a-guardian" name="guardianName" maxlength="120">
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-guardian-phone">Guardian's phone</label>
                      <input class="input" id="a-guardian-phone" name="guardianPhone" type="tel" maxlength="40">
                    </div>
                    <div class="field">
                      <label for="a-country">Country <span class="req">*</span></label>
                      <select class="select" id="a-country" name="country" required>
                        <option value="">Choose a country&hellip;</option>
                    {countries}
                      </select>
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-timezone">Timezone</label>
                      <input class="input" id="a-timezone" name="timezone" maxlength="60" placeholder="Detected automatically">
                      <span class="help">Leave blank and we will use your device timezone.</span>
                    </div>
                  </div>
                  <div class="form-actions">
                    <button type="button" class="btn btn-primary" data-step-next>Continue to course</button>
                  </div>
                </fieldset>

                <fieldset data-step hidden>
                  <p class="fieldset-title">Course and schedule</p>
                  <div class="form-grid">
                    <div class="field field-full">
                      <label for="a-course">Course <span class="req">*</span></label>
                      <select class="select" id="a-course" name="course" required>
                        <option value="">Loading courses&hellip;</option>
                      </select>
                      <span class="help" data-fee-note>Select a course to see its monthly fee.</span>
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-level">Current level</label>
                      <select class="select" id="a-level" name="level">
                        <option value="">Not sure &mdash; assess in the trial class</option>
                        <option>Complete beginner</option>
                        <option>Knows the Arabic letters</option>
                        <option>Can read slowly</option>
                        <option>Reads fluently</option>
                        <option>Already memorising</option>
                      </select>
                    </div>
                    <div class="field">
                      <label for="a-timing">Preferred class time <span class="req">*</span></label>
                      <select class="select" id="a-timing" name="timing" required>
                        <option value="">Choose a time window&hellip;</option>
                    {timings}
                      </select>
                      <span class="error-text"></span>
                    </div>
                  </div>
                  <div class="field field-full mt-4">
                    <span class="field-label">Class days <span class="req">*</span></span>
                    <div class="chip-row" id="day-picker"></div>
                    <span class="help">Most students take five days a week. You can change this with your teacher later.</span>
                  </div>
                  <div class="field field-full mt-4">
                    <label for="a-message">Anything the academy should know</label>
                    <textarea class="textarea" id="a-message" name="message" maxlength="1500" placeholder="For example: please assign a female teacher, or the student has a hearing difficulty."></textarea>
                  </div>
                  <div class="form-actions">
                    <button type="button" class="btn btn-ghost" data-step-back>Back</button>
                    <button type="button" class="btn btn-primary" data-step-next>Continue to account</button>
                  </div>
                </fieldset>

                <fieldset data-step hidden>
                  <p class="fieldset-title">Create your portal account</p>
                  <p class="muted">You will use this password with the email address from step one to sign in to the student portal, check your schedule and submit monthly fees.</p>
                  <div class="form-grid mt-4">
                    <div class="field">
                      <label for="a-password">Password <span class="req">*</span></label>
                      <div class="input-wrap">
                        <input class="input" id="a-password" name="password" type="password" required minlength="8" autocomplete="new-password">
                        <button type="button" class="password-toggle" aria-label="Show password">{ic('eye')}</button>
                      </div>
                      <span class="help">At least 8 characters.</span>
                      <span class="error-text"></span>
                    </div>
                    <div class="field">
                      <label for="a-password2">Repeat password <span class="req">*</span></label>
                      <div class="input-wrap">
                        <input class="input" id="a-password2" name="password2" type="password" required minlength="8" autocomplete="new-password">
                        <button type="button" class="password-toggle" aria-label="Show password">{ic('eye')}</button>
                      </div>
                      <span class="error-text"></span>
                    </div>
                  </div>
                  <label class="check check-card mt-4">
                    <input type="checkbox" name="agree" value="yes" required>
                    <span>I have read and accept the <a href="student-policy.html">student code of conduct</a>, the <a href="payment-policy.html">fee and payment policy</a> and the <a href="privacy-policy.html">privacy policy</a>. <span class="req">*</span></span>
                  </label>
                  <div class="form-actions">
                    <button type="button" class="btn btn-ghost" data-step-back>Back</button>
                    <button class="btn btn-gold btn-lg" type="submit">Submit admission form</button>
                  </div>
                  <p class="tiny muted mt-4">Submitting this form does not charge you anything. The academy reviews the application, arranges a free trial class and only then confirms your monthly fee.</p>
                </fieldset>
              </form>
            </div>
          </div>

          <aside class="stack">
            <div class="panel">
              <header class="panel-head"><h2>What happens next</h2></header>
              <div class="panel-body">
                <div class="timeline">
                  <div class="timeline-item"><span class="timeline-dot">1</span><div class="timeline-body"><h3>We review your form</h3><p>Usually within one to two working days.</p></div></div>
                  <div class="timeline-item"><span class="timeline-dot">2</span><div class="timeline-body"><h3>Free trial class</h3><p>Arranged on WhatsApp at a time that suits you.</p></div></div>
                  <div class="timeline-item"><span class="timeline-dot">3</span><div class="timeline-body"><h3>Admission approved</h3><p>Your schedule and fee appear in the portal.</p></div></div>
                  <div class="timeline-item"><span class="timeline-dot">4</span><div class="timeline-body"><h3>First monthly fee</h3><p>Submitted in the portal and verified by the office.</p></div></div>
                </div>
              </div>
            </div>
            <div class="panel">
              <header class="panel-head"><h2>Fee rules at a glance</h2></header>
              <div class="panel-body stack-sm">
                <p class="sm muted">Due on the <strong>5th</strong> of each month.</p>
                <p class="sm muted">Grace period <strong>6th to 8th</strong>, with the 8th as the final grace day.</p>
                <p class="sm muted">Unverified current month is suspended on the <strong>9th</strong>.</p>
                <p class="sm muted">Suspension pauses access only. Nothing is deleted, and verification reactivates the account automatically.</p>
                <a class="link-arrow" href="payment-policy.html">Full fee policy {ic('external', 'icon-xs')}</a>
              </div>
            </div>
            <div class="panel">
              <header class="panel-head"><h2>Need help?</h2></header>
              <div class="panel-body stack-sm">
                <p class="sm muted">The office can complete the form with you over WhatsApp if you prefer.</p>
                <a class="btn btn-outline btn-sm" data-whatsapp-link target="_blank" rel="noopener">{ic('whatsapp')} Message the office</a>
              </div>
            </div>
          </aside>
        </div>

        <div class="form-card mt-6" id="admission-success" hidden>
          <span class="icon-badge">{ic('checkCircle')}</span>
          <h2 class="mt-4">Admission form received</h2>
          <p class="lead mt-2">Jazak Allahu khairan. Your application is now with the academy office.</p>
          <dl class="kv kv-3 mt-5">
            <div><dt>Reference</dt><dd data-ref>&mdash;</dd></div>
            <div><dt>Course</dt><dd data-course>&mdash;</dd></div>
            <div><dt>Monthly fee</dt><dd class="fee-value" data-fee>&mdash;</dd></div>
          </dl>
          <div class="alert alert-success mt-5" data-account hidden>
            {ic('user')}
            <div><strong>Your student portal account is ready</strong>Sign in with the email address and password you just chose to follow your application status.</div>
          </div>
          <div class="alert alert-info mt-4">{ic('info')}<div><strong>No payment is due yet</strong>The academy will contact you to arrange a free trial class. Your first monthly fee is only requested after your admission is approved.</div></div>
          <div class="btn-row mt-5">
            <a class="btn btn-primary" href="student-login.html">Go to the student portal</a>
            <a class="btn btn-outline" data-whatsapp-link target="_blank" rel="noopener">{ic('whatsapp')} Message the office</a>
          </div>
        </div>
      </div>
    </section>"""
    return public_page(page="admissions", title=f"Admission — {ACADEMY}",
                       desc="Enrol in online Qur'an classes at Samad-ul-Qur'an Academy. No registration fee, a free trial class and a clear monthly fee.",
                       body=body)


def teacher_register() -> str:
    body = f"""{page_hero(
        "Teach with us",
        "The academy takes on qualified male and female Qur'an teachers for Nazra, Tajweed and Hifz classes. Send your details and the office will contact you.",
        [CRUMB_HOME, ("teacher-register.html", "Teach with us")], eyebrow="Careers")}

    <section class="section">
      <div class="container panel-grid-sidebar">
        <div class="form-card">
          <h2>Teacher application</h2>
          <p class="muted mt-2">This sends your details to the academy office as an enquiry. Teacher portal accounts are created by the office after an interview &mdash; this form does not create an account by itself.</p>
          <form id="teacher-apply-form" class="stack mt-5" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="t-name">Full name <span class="req">*</span></label>
                <input class="input" id="t-name" name="name" required maxlength="120" autocomplete="name">
                <span class="error-text"></span>
              </div>
              <div class="field">
                <label for="t-email">Email address <span class="req">*</span></label>
                <input class="input" id="t-email" name="email" type="email" required maxlength="160" autocomplete="email">
                <span class="error-text"></span>
              </div>
              <div class="field">
                <label for="t-phone">Phone or WhatsApp <span class="req">*</span></label>
                <input class="input" id="t-phone" name="phone" type="tel" required maxlength="40" autocomplete="tel">
                <span class="error-text"></span>
              </div>
              <div class="field">
                <label for="t-qual">Qualification</label>
                <input class="input" id="t-qual" name="qualification" maxlength="200" placeholder="e.g. Hafiz-e-Qur'an, Shahadat al-Alamiyyah">
              </div>
              <div class="field">
                <label for="t-exp">Teaching experience</label>
                <input class="input" id="t-exp" name="experience" maxlength="100" placeholder="e.g. 6 years">
              </div>
              <div class="field">
                <label for="t-spec">Specialities</label>
                <input class="input" id="t-spec" name="specialities" maxlength="300" placeholder="Tajweed, Hifz, Qira'at">
                <span class="help">Separate each speciality with a comma.</span>
              </div>
              <div class="field field-full">
                <label for="t-timing">Availability</label>
                <input class="input" id="t-timing" name="timing" maxlength="200" placeholder="e.g. 16:00 – 21:00 PKT, six days a week">
              </div>
            </div>
            <div class="field">
              <label for="t-message">About you</label>
              <textarea class="textarea" id="t-message" name="message" maxlength="2000" placeholder="Tell the academy about your ijazah or sanad, the ages you teach best, and your internet setup."></textarea>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary btn-lg" type="submit">Send application</button>
            </div>
          </form>
          <div class="alert alert-success mt-5" id="apply-success" hidden>
            {ic('checkCircle')}
            <div><strong>Application sent</strong>The academy office has your details and will contact you to arrange a short interview and a demonstration class, in sha Allah.</div>
          </div>
        </div>

        <aside class="stack">
          <div class="panel">
            <header class="panel-head"><h2>What we look for</h2></header>
            <div class="panel-body">
              <ul class="value-list">
                <li class="value-item">{ic('check')}<span>Correct Tajweed and clear recitation.</span></li>
                <li class="value-item">{ic('check')}<span>Patience with children and consistent punctuality.</span></li>
                <li class="value-item">{ic('check')}<span>A stable internet connection and a quiet room.</span></li>
                <li class="value-item">{ic('check')}<span>Willingness to record attendance and progress after every class.</span></li>
              </ul>
            </div>
          </div>
          <div class="panel">
            <header class="panel-head"><h2>Already teaching here?</h2></header>
            <div class="panel-body stack-sm">
              <p class="sm muted">Use the teacher portal to see your students, schedule classes and mark attendance.</p>
              <a class="btn btn-outline btn-sm" href="teacher-login.html">Teacher login</a>
            </div>
          </div>
        </aside>
      </div>
    </section>"""
    return public_page(page="teacher-register", title=f"Teach With Us — {ACADEMY}",
                       desc="Apply to teach Qur'an online with Samad-ul-Qur'an Academy. We welcome qualified male and female teachers for Nazra, Tajweed and Hifz.",
                       body=body)


# ---------------------------------------------------------------- logins ---

def student_login() -> str:
    card = f"""      <h1>Student sign in</h1>
      <p>Check your class schedule, attendance, fees and messages.</p>
      <form class="auth-form" id="login-form" novalidate>
        <div class="field">
          <label for="l-email">Email address</label>
          <input class="input" id="l-email" name="email" type="email" required autocomplete="email" autofocus>
          <span class="error-text"></span>
        </div>
        <div class="field">
          <label for="l-password">Password</label>
          <div class="input-wrap">
            <input class="input" id="l-password" name="password" type="password" required autocomplete="current-password">
            <button type="button" class="password-toggle" aria-label="Show password">{ic('eye')}</button>
          </div>
          <span class="error-text"></span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
      </form>
      <p class="auth-alt">Not enrolled yet? <a href="admissions.html">Submit an admission form</a></p>
      <p class="auth-alt">Forgotten your password? The academy office resets it for you &mdash; <a href="contact.html">contact us</a>.</p>
      <div class="auth-footer-links">
        <a href="index.html">&larr; Back to website</a>
        <a href="teacher-login.html">Teacher login</a>
      </div>"""
    return auth_page(page="student-login", title=f"Student Login — {ACADEMY}",
                     desc="Sign in to the Samad-ul-Qur'an Academy student portal to see classes, attendance and fees.",
                     aside_title="Your classes, attendance and fees in one place",
                     aside_text="The student portal shows exactly what the academy office and your teacher see.",
                     aside_points=["Class schedule and one-click join link",
                                   "Attendance record for every class",
                                   "Fee history with numbered receipts",
                                   "Direct messages with your teacher"],
                     card=card)


def teacher_login() -> str:
    card = f"""      <h1>Teacher sign in</h1>
      <p>Manage your students, schedule classes and mark attendance.</p>
      <form class="auth-form" id="login-form" novalidate>
        <div class="field">
          <label for="l-email">Email address</label>
          <input class="input" id="l-email" name="email" type="email" required autocomplete="email" autofocus>
          <span class="error-text"></span>
        </div>
        <div class="field">
          <label for="l-password">Password</label>
          <div class="input-wrap">
            <input class="input" id="l-password" name="password" type="password" required autocomplete="current-password">
            <button type="button" class="password-toggle" aria-label="Show password">{ic('eye')}</button>
          </div>
          <span class="error-text"></span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
      </form>
      <p class="auth-alt">Want to teach with us? <a href="teacher-register.html">Send an application</a></p>
      <div class="auth-footer-links">
        <a href="index.html">&larr; Back to website</a>
        <a href="student-login.html">Student login</a>
      </div>"""
    return auth_page(page="teacher-login", title=f"Teacher Login — {ACADEMY}",
                     desc="Sign in to the Samad-ul-Qur'an Academy teacher portal to manage students, classes and attendance.",
                     aside_title="Everything you need for your halaqah",
                     aside_text="Your assigned students, the class schedule and the attendance register in one workspace.",
                     aside_points=["Your assigned students and their courses",
                                   "Schedule and reschedule classes",
                                   "Mark attendance and write progress notes",
                                   "Message students and the academy office"],
                     card=card)


def admin_login() -> str:
    card = f"""      <h1>Administrator sign in</h1>
      <p>Enter the administrator key issued by the academy.</p>
      <form class="auth-form" id="login-form" novalidate>
        <div class="field">
          <label for="l-key">Administrator key</label>
          <div class="input-wrap">
            <input class="input" id="l-key" name="key" type="password" required autocomplete="off" autofocus>
            <button type="button" class="password-toggle" aria-label="Show key">{ic('eye')}</button>
          </div>
          <span class="help">The key is configured on the server as <code>ADMIN_KEY</code>. It is never stored in the browser in plain text beyond this session.</span>
          <span class="error-text"></span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">{ic('key')} Sign in</button>
      </form>
      <div class="alert alert-warning mt-5">{ic('shield')}<div><strong>Restricted area</strong>Sign-in attempts are rate limited and written to the audit log with the requesting IP address.</div></div>
      <div class="auth-footer-links">
        <a href="index.html">&larr; Back to website</a>
        <a href="student-login.html">Student login</a>
      </div>"""
    return auth_page(page="admin-login", title=f"Administrator — {ACADEMY}",
                     desc="Administrator sign-in for the Samad-ul-Qur'an Academy management system.",
                     aside_title="Academy administration",
                     aside_text="Admissions, students, teachers, classes, attendance, fee verification and website content.",
                     aside_points=["Approve admissions and assign teachers",
                                   "Verify fee payments and issue receipts",
                                   "Run the monthly billing and suspension check",
                                   "Manage courses, gallery, testimonials and settings"],
                     card=card)


PAGES = {
    "index.html": home,
    "courses.html": courses,
    "course.html": course,
    "about.html": about,
    "teachers.html": teachers,
    "gallery.html": gallery,
    "faq.html": faq,
    "contact.html": contact,
    "admissions.html": admissions,
    "teacher-register.html": teacher_register,
    "student-login.html": student_login,
    "teacher-login.html": teacher_login,
    "admin-login.html": admin_login,
}
