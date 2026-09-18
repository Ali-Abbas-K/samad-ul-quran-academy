"""Administrator console pages.

Each page supplies only the shell, the toolbar controls and the host container
IDs that web/js/admin.js queries. Filter option values are the exact values the
server validates against (see server/src/routes/admin.js).
"""
from __future__ import annotations

from partials import ic, portal_page

ADMIN_JS = ["core.js", "charts.js", "portal-shell.js", "admin.js"]

NOJS = ('<noscript><div class="alert alert-warning">The administrator console needs '
        'JavaScript enabled. Please enable it and reload the page.</div></noscript>')


def _search(field_id: str, placeholder: str) -> str:
    return f"""          <div class="search-field">
            {ic('search')}
            <label class="sr-only" for="{field_id}">Search</label>
            <input class="input" type="search" id="{field_id}" placeholder="{placeholder}" autocomplete="off">
          </div>"""


def _select(field_id: str, label: str, options: list[tuple[str, str]]) -> str:
    opts = "\n              ".join(
        f'<option value="{v}">{t}</option>' for v, t in options
    )
    return f"""          <div class="filter-inline">
            <label class="sr-only" for="{field_id}">{label}</label>
            <select class="select select-sm" id="{field_id}">
              {opts}
            </select>
          </div>"""


def _dynamic_select(field_id: str, label: str, placeholder: str) -> str:
    """Select whose options are populated by admin.js at runtime."""
    return f"""          <div class="filter-inline">
            <label class="sr-only" for="{field_id}">{label}</label>
            <select class="select select-sm" id="{field_id}">
              <option value="">{placeholder}</option>
            </select>
          </div>"""


def _input(field_id: str, label: str, input_type: str) -> str:
    return f"""          <div class="filter-inline">
            <label class="sr-only" for="{field_id}">{label}</label>
            <input class="input input-sm" type="{input_type}" id="{field_id}" aria-label="{label}">
          </div>"""


def _page(*, page: str, title: str, subtitle: str, host: str,
          toolbar: list[str] | None = None, actions: str = "",
          doc: str | None = None, body: str | None = None) -> str:
    if body is None:
        tb = ""
        if toolbar:
            tb = '        <div class="toolbar">\n' + "\n".join(toolbar) + "\n        </div>\n"
        body = f'        {NOJS}\n{tb}        <div id="{host}" class="stack-lg"></div>'
    return portal_page(
        page=page, role="admin", data_role="admin",
        doc_title=doc or f"{title} | Admin | Samad-ul-Qur'an Academy",
        title=title, subtitle=subtitle, actions=actions, js=ADMIN_JS, body=body,
    )


# ------------------------------------------------------------- dashboard ---

def admin_home() -> str:
    actions = (
        f'<a class="btn btn-outline btn-sm" href="admin-admissions.html">{ic("certificate", "icon-xs")} Admissions</a>'
        f'<a class="btn btn-primary btn-sm" href="admin-payments.html">{ic("wallet", "icon-xs")} Verify payments</a>'
    )
    return _page(page="admin", title="Administrator Dashboard",
                 subtitle="Enrolment, teaching and fee health for the current month.",
                 host="overview", actions=actions,
                 doc="Administrator Dashboard | Samad-ul-Qur'an Academy")


# ---------------------------------------------------------------- people ---

def admin_students() -> str:
    actions = (f'<button type="button" class="btn btn-primary btn-sm" data-add-student>'
               f'{ic("plus", "icon-xs")} Add student</button>')
    return _page(
        page="admin-students", title="Students",
        subtitle="Accounts, enrolment status, attendance and fee history.",
        host="students", actions=actions,
        toolbar=[
            _search("stu-q", "Search by name, email or phone"),
            _select("stu-status", "Filter by account status", [
                ("", "All accounts"),
                ("active", "Active"),
                ("suspended", "Suspended"),
                ("inactive", "Deactivated"),
            ]),
        ])


def admin_teachers() -> str:
    actions = (f'<button type="button" class="btn btn-primary btn-sm" data-add-teacher>'
               f'{ic("plus", "icon-xs")} Add teacher</button>')
    return _page(
        page="admin-teachers", title="Teachers",
        subtitle="Staff accounts, assigned students and teaching load.",
        host="teachers", actions=actions,
        toolbar=[_search("tea-q", "Search by name, email or speciality")])


def admin_admissions() -> str:
    return _page(
        page="admin-admissions", title="Admissions",
        subtitle="Review applications, assign a teacher and approve or reject.",
        host="admissions",
        toolbar=[
            _search("adm-q", "Search by applicant, email or guardian"),
            _select("adm-status", "Filter by admission status", [
                ("", "All statuses"),
                ("Pending", "Pending"),
                ("Approved", "Approved"),
                ("Active", "Active"),
                ("Rejected", "Rejected"),
                ("Completed", "Completed"),
            ]),
            _dynamic_select("adm-course", "Filter by course", "All courses"),
        ])


# -------------------------------------------------------------- teaching ---

def admin_classes() -> str:
    actions = (f'<button type="button" class="btn btn-primary btn-sm" data-add-class>'
               f'{ic("plus", "icon-xs")} Schedule class</button>')
    return _page(
        page="admin-classes", title="Classes",
        subtitle="Every scheduled, live and completed lesson (Asia/Karachi).",
        host="classes", actions=actions,
        toolbar=[
            _search("cl-q", "Search by student, teacher or topic"),
            _select("cl-status", "Filter by class status", [
                ("", "All classes"),
                ("scheduled", "Scheduled"),
                ("live", "Live"),
                ("completed", "Completed"),
                ("cancelled", "Cancelled"),
            ]),
            _dynamic_select("cl-teacher", "Filter by teacher", "All teachers"),
            _input("cl-date", "Filter by date", "date"),
        ])


def admin_attendance() -> str:
    return _page(
        page="admin-attendance", title="Attendance",
        subtitle="Monthly attendance rates by student and by teacher.",
        host="attendance",
        toolbar=[
            _search("at-q", "Search by student or teacher"),
            _select("at-status", "Filter by attendance status", [
                ("", "All statuses"),
                ("Present", "Present"),
                ("Late", "Late"),
                ("Leave", "Leave"),
                ("Absent", "Absent"),
            ]),
            _dynamic_select("at-teacher", "Filter by teacher", "All teachers"),
            _input("at-month", "Filter by month", "month"),
        ])


# ----------------------------------------------------------------- money ---

def admin_payments() -> str:
    actions = (f'<button type="button" class="btn btn-primary btn-sm" data-add-payment>'
               f'{ic("plus", "icon-xs")} Record cash payment</button>')
    return _page(
        page="admin-payments", title="Payments",
        subtitle="Verify submitted proofs. Verification is final and issues a receipt.",
        host="payments", actions=actions,
        toolbar=[
            _search("pm-q", "Search by student, email or reference"),
            _select("pm-status", "Filter by payment status", [
                ("", "All payments"),
                ("pending", "Pending verification"),
                ("verified", "Verified"),
                ("rejected", "Rejected"),
            ]),
            _dynamic_select("pm-method", "Filter by method", "All methods"),
            _input("pm-month", "Filter by billing month", "month"),
        ])


def admin_finance() -> str:
    return _page(
        page="admin-finance", title="Finance",
        subtitle="Revenue, collection rate, arrears and method mix.",
        host="finance",
        toolbar=[_input("fi-month", "Reporting month", "month")])


def admin_audit() -> str:
    return _page(
        page="admin-audit", title="Audit Log",
        subtitle="Every administrative action, with actor, target and timestamp.",
        host="audit",
        toolbar=[
            _search("au-q", "Search by actor, target or detail"),
            _dynamic_select("au-action", "Filter by action", "All actions"),
        ])


# --------------------------------------------------------- communication ---

def admin_messages() -> str:
    actions = (f'<a class="btn btn-outline btn-sm" href="admin-notifications.html">'
               f'{ic("bell", "icon-xs")} Send notification</a>')
    return _page(
        page="admin-messages", title="Enquiries",
        subtitle="Messages submitted through the public contact form.",
        host="messages", actions=actions,
        toolbar=[_search("msg-q", "Search by name, email or subject")])


def admin_notifications() -> str:
    actions = (f'<button type="button" class="btn btn-primary btn-sm" data-send-notification>'
               f'{ic("plus", "icon-xs")} New notification</button>')
    return _page(
        page="admin-notifications", title="Notifications",
        subtitle="Announcements and reminders delivered inside the portals.",
        host="notifications-admin", actions=actions)


# --------------------------------------------------------------- website ---

def admin_content() -> str:
    body = f"""        {NOJS}
        <section class="panel">
          <header class="panel-head">
            <h2>Courses</h2>
            <button type="button" class="btn btn-primary btn-sm" data-add-course>{ic('plus', 'icon-xs')} Add course</button>
          </header>
          <div class="panel-body-flush">
            <div id="courses-admin"></div>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head">
            <h2>Gallery</h2>
            <button type="button" class="btn btn-primary btn-sm" data-add-gallery>{ic('plus', 'icon-xs')} Add image</button>
          </header>
          <div class="panel-body-flush">
            <div id="gallery-admin"></div>
          </div>
        </section>

        <section class="panel">
          <header class="panel-head">
            <h2>Testimonials</h2>
            <button type="button" class="btn btn-primary btn-sm" data-add-testimonial>{ic('plus', 'icon-xs')} Add testimonial</button>
          </header>
          <div class="panel-body-flush">
            <div id="testimonials-admin"></div>
          </div>
        </section>"""
    return _page(page="admin-content", title="Website Content",
                 subtitle="Courses, gallery images and testimonials shown on the public site.",
                 host="courses-admin", body=body)


def admin_settings() -> str:
    body = (f'        {NOJS}\n'
            '        <p class="lead mb-5">Business details entered here appear across the public'
            ' website, invoices and fee reminders. Bank and wallet fields are intentionally blank'
            ' until you enter the real account information.</p>\n'
            '        <div id="settings" class="stack-lg"></div>')
    return _page(page="admin-settings", title="Settings",
                 subtitle="Academy details, payment accounts, billing dates and social links.",
                 host="settings", body=body)


PAGES = {
    "admin.html": admin_home,
    "admin-students.html": admin_students,
    "admin-teachers.html": admin_teachers,
    "admin-admissions.html": admin_admissions,
    "admin-classes.html": admin_classes,
    "admin-attendance.html": admin_attendance,
    "admin-payments.html": admin_payments,
    "admin-finance.html": admin_finance,
    "admin-content.html": admin_content,
    "admin-messages.html": admin_messages,
    "admin-notifications.html": admin_notifications,
    "admin-settings.html": admin_settings,
    "admin-audit.html": admin_audit,
}
