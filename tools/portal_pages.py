"""Student, teacher and shared portal pages.

Every host container listed here is filled at runtime by web/js/{student,teacher,
portal,portal-shell}.js. The markup below only supplies the shell, the exact
element IDs / data-attributes those scripts query, and a no-JS fallback.
"""
from __future__ import annotations

from partials import ic, portal_page

# Scripts, in the load order the modules require.
STUDENT_JS = ["core.js", "charts.js", "portal-shell.js", "student.js"]
TEACHER_JS = ["core.js", "charts.js", "portal-shell.js", "student.js", "teacher.js"]
SHARED_JS = ["core.js", "charts.js", "portal-shell.js", "student.js", "teacher.js", "portal.js"]

NOJS = ('<noscript><div class="alert alert-warning">This portal needs JavaScript '
        'enabled to load your live records. Please enable it and reload the page.'
        '</div></noscript>')


def _host(host_id: str, *, fee_banner: bool = False, lead: str = "") -> str:
    banner = '        <div data-fee-banner></div>\n' if fee_banner else ""
    lead_html = f'        <p class="lead mb-5">{lead}</p>\n' if lead else ""
    return (f'        {NOJS}\n{banner}{lead_html}'
            f'        <div id="{host_id}" class="stack-lg"></div>')


# --------------------------------------------------------------- student ---

def student_dashboard() -> str:
    actions = ('<a class="btn btn-primary btn-sm" href="classroom.html">'
               f'{ic("video", "icon-xs")} Join class</a>')
    return portal_page(
        page="student-dashboard", role="student", data_role="student",
        doc_title="Student Dashboard | Samad-ul-Qur'an Academy",
        title="Assalamu alaikum", subtitle="Your classes, attendance and fees at a glance.",
        actions=actions, js=STUDENT_JS,
        body=_host("dash", fee_banner=True),
    )


def payments() -> str:
    return portal_page(
        page="payments", role="student", data_role="student",
        doc_title="Fees & Payments | Samad-ul-Qur'an Academy",
        title="Fees &amp; Payments",
        subtitle="Submit your monthly fee, upload proof and track verification.",
        js=STUDENT_JS,
        body=_host("pay", fee_banner=True),
    )


# --------------------------------------------------------------- teacher ---

def teacher_dashboard() -> str:
    actions = ('<a class="btn btn-outline btn-sm" href="teacher-students.html">'
               f'{ic("users", "icon-xs")} My students</a>')
    return portal_page(
        page="teacher-dashboard", role="teacher", data_role="teacher",
        doc_title="Teacher Dashboard | Samad-ul-Qur'an Academy",
        title="Assalamu alaikum",
        subtitle="Today's classes, your students and attendance to mark.",
        actions=actions, js=TEACHER_JS,
        body=_host("dash"),
    )


def teacher_students() -> str:
    toolbar = f"""        <div class="toolbar">
          <div class="search-field">
            {ic('search')}
            <label class="sr-only" for="student-search">Search students</label>
            <input class="input" type="search" id="student-search" placeholder="Search by name, email or course" autocomplete="off">
          </div>
          <div class="filter-inline">
            <label class="sr-only" for="student-status">Filter by status</label>
            <select class="select select-sm" id="student-status">
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Approved">Approved</option>
              <option value="Completed">Completed</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>"""
    return portal_page(
        page="teacher-students", role="teacher", data_role="teacher",
        doc_title="My Students | Samad-ul-Qur'an Academy",
        title="My Students",
        subtitle="Assigned learners, progress notes and lesson history.",
        js=TEACHER_JS,
        body=f'        {NOJS}\n{toolbar}\n        <div id="students" class="stack-lg mt-5"></div>',
    )


# ---------------------------------------------------------------- shared ---

def classes() -> str:
    toolbar = f"""        <div class="toolbar">
          <div class="search-field">
            {ic('search')}
            <label class="sr-only" for="class-search">Search classes</label>
            <input class="input" type="search" id="class-search" placeholder="Search by topic, student or teacher" autocomplete="off">
          </div>
          <div class="filter-inline">
            <label class="sr-only" for="class-status">Filter by status</label>
            <select class="select select-sm" id="class-status">
              <option value="">All classes</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>"""
    return portal_page(
        page="classes", role="shared", nav_role="shared",
        doc_title="Classes | Samad-ul-Qur'an Academy",
        title="Classes",
        subtitle="Your schedule in Pakistan Standard Time (Asia/Karachi).",
        js=SHARED_JS,
        body=f'        {NOJS}\n{toolbar}\n        <div id="classes" class="stack-lg mt-5"></div>',
    )


def classroom() -> str:
    return portal_page(
        page="classroom", role="shared", nav_role="shared",
        doc_title="Live Classroom | Samad-ul-Qur'an Academy",
        title="Live Classroom",
        subtitle="Secure one-to-one Qur'an lessons hosted on Jitsi Meet.",
        js=SHARED_JS,
        body=_host("classroom"),
    )


def chat() -> str:
    body = f"""        {NOJS}
        <div class="chat-layout">
          <aside class="chat-aside">
            <div class="chat-head">
              <h2>Conversations</h2>
            </div>
            <div class="chat-people" id="chat-contacts"></div>
          </aside>
          <section class="chat-main" id="chat-thread" aria-live="polite">
            <div class="chat-head">
              <p class="muted tiny">Select a conversation to begin.</p>
            </div>
            <div class="chat-scroll" id="chat-scroll"></div>
            <form class="chat-compose chat-form" id="chat-form" novalidate>
              <label class="sr-only" for="chat-input">Message</label>
              <textarea class="textarea" id="chat-input" name="message" rows="1"
                placeholder="Write a message&hellip;" maxlength="2000" required disabled></textarea>
              <button class="btn btn-primary btn-square" type="submit" aria-label="Send message" disabled>{ic('chat')}</button>
            </form>
          </section>
        </div>
        <p class="tiny muted mt-4">Messages between students and teachers are visible to the academy
        administration for safeguarding. Please keep every conversation respectful and lesson-related.</p>"""
    return portal_page(
        page="chat", role="shared", nav_role="shared",
        doc_title="Messages | Samad-ul-Qur'an Academy",
        title="Messages",
        subtitle="Talk to your teacher or student about lessons and timings.",
        js=SHARED_JS, body=body,
    )


def attendance() -> str:
    return portal_page(
        page="attendance", role="shared", nav_role="shared",
        doc_title="Attendance | Samad-ul-Qur'an Academy",
        title="Attendance",
        subtitle="Present, Late and Leave all count towards your monthly rate.",
        js=SHARED_JS,
        body=_host("attendance"),
    )


def notifications() -> str:
    actions = ('<a class="btn btn-outline btn-sm" href="student-dashboard.html" data-portal-home>'
               f'{ic("home", "icon-xs")} Dashboard</a>')
    body = f"""        {NOJS}
        <section class="panel notif-page">
          <header class="panel-head">
            <h2>All notifications</h2>
            <button type="button" class="btn btn-ghost btn-sm" data-notif-read-all>{ic('checkCircle', 'icon-xs')} Mark all read</button>
          </header>
          <div class="panel-body-flush">
            <div id="notifications-page"></div>
          </div>
        </section>"""
    return portal_page(
        page="notifications", role="shared", nav_role="shared",
        doc_title="Notifications | Samad-ul-Qur'an Academy",
        title="Notifications",
        subtitle="Fee reminders, class updates and academy announcements.",
        actions=actions, js=SHARED_JS, body=body,
    )


def profile() -> str:
    actions = (f'<button type="button" class="btn btn-outline btn-sm" data-open-password>'
               f'{ic("key", "icon-xs")} Change password</button>')
    return portal_page(
        page="profile", role="shared", nav_role="shared",
        doc_title="My Profile | Samad-ul-Qur'an Academy",
        title="My Profile",
        subtitle="Keep your contact details and timezone up to date.",
        actions=actions, js=SHARED_JS,
        body=_host("profile"),
    )


PAGES = {
    "student-dashboard.html": student_dashboard,
    "payments.html": payments,
    "teacher-dashboard.html": teacher_dashboard,
    "teacher-students.html": teacher_students,
    "classes.html": classes,
    "classroom.html": classroom,
    "chat.html": chat,
    "attendance.html": attendance,
    "notifications.html": notifications,
    "profile.html": profile,
}
