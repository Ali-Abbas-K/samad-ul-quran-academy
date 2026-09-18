"""Shared HTML partials for the Samad-ul-Qur'an Academy page build.

Icons are parsed straight out of web/js/core.js so the static markup and the
runtime helper can never drift apart.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

# --------------------------------------------------------------- icons ----

_ICON_RE = re.compile(r"^\s{2}([A-Za-z]+): '(.*)',$")


def _load_icons() -> dict[str, str]:
    src = (WEB / "js" / "core.js").read_text(encoding="utf-8")
    block = src.split("const ICONS = {", 1)[1].split("\n};", 1)[0]
    icons: dict[str, str] = {}
    for line in block.splitlines():
        m = _ICON_RE.match(line)
        if m:
            icons[m.group(1)] = m.group(2).replace("\\'", "'")
    if len(icons) < 30:  # pragma: no cover - build-time sanity check
        raise SystemExit(f"icon parse failed: only {len(icons)} icons found")
    return icons


ICONS = _load_icons()


def ic(name: str, cls: str = "icon") -> str:
    path = ICONS.get(name) or ICONS["info"]
    return (
        f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true">{path}</svg>'
    )


# ----------------------------------------------------------------- head ---

CSS_FILES = [
    "tokens.css",
    "base.css",
    "components.css",
    "site.css",
    "portal.css",
    "parts.css",
]

ACADEMY = "Samad-ul-Qur'an Academy"


def head(title: str, desc: str, *, og_image: str = "assets/img/og-cover.jpg") -> str:
    css = "\n  ".join(f'<link rel="stylesheet" href="css/{f}">' for f in CSS_FILES)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#0e6b49">
  <meta name="format-detection" content="telephone=no">
  <meta property="og:site_name" content="{ACADEMY}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="{og_image}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="assets/favicon.ico" sizes="32x32">
  <link rel="icon" href="assets/favicon-64.png" type="image/png" sizes="64x64">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="preload" href="assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="assets/fonts/playfair-display-latin.woff2" as="font" type="font/woff2" crossorigin>
  {css}
  <noscript><style>
    /* Scroll-reveal starts at opacity 0 and is faded in by core.js. With
       JavaScript off there is no observer, so show everything immediately. */
    .reveal {{ opacity: 1 !important; transform: none !important; }}
  </style></noscript>
</head>"""


def scripts(files: list[str]) -> str:
    """Emit the deferred script tags for a page.

    config.js is prepended to every page. It resolves the API origin before
    core.js reads it, which is what lets the identical bundle work when served
    by the Node server, opened from disk, and packaged inside the Android
    WebView. Because all tags are `defer`, they still execute in document order.
    """
    ordered = ["config.js"] + [f for f in files if f != "config.js"]
    return "\n".join(f'  <script src="js/{f}" defer></script>' for f in ordered)


# --------------------------------------------------------- public chrome ---

PUBLIC_NAV = [
    ("index.html", "Home", "home"),
    ("courses.html", "Courses", "courses"),
    ("about.html", "About Us", "about"),
    ("admissions.html", "Admission", "admissions"),
    ("contact.html", "Contact", "contact"),
]


def brand(link: str = "index.html", classes: str = "brand") -> str:
    return f"""<a class="{classes}" href="{link}">
        <img src="assets/logo-mark.png" alt="" width="44" height="44">
        <span class="brand-text">
          <span class="brand-name" data-academy="name">{ACADEMY}</span>
          <span class="brand-tag" data-academy="tagline">Online Qur'an Education</span>
        </span>
      </a>"""


def site_header() -> str:
    links = "\n        ".join(
        f'<a href="{href}" data-nav="{page}">{label}</a>'
        for href, label, page in PUBLIC_NAV
    )
    return f"""  <a class="skip-link" href="#main">Skip to main content</a>
  <header class="site-header">
    <div class="container header-inner">
      {brand()}
      <nav class="main-nav" id="main-nav" aria-label="Main navigation">
        {links}
        <a class="btn btn-outline btn-sm nav-cta" href="teacher-login.html" data-nav="teacher-login">Teacher Login</a>
        <a class="btn btn-primary btn-sm nav-cta" href="student-login.html" data-nav="student-login">Student Login</a>
      </nav>
      <div class="header-actions">
        <a class="btn btn-outline btn-sm" href="teacher-login.html">Teacher Login</a>
        <a class="btn btn-primary btn-sm" href="student-login.html">Student Login</a>
        <button type="button" class="nav-toggle" aria-label="Open menu" aria-controls="main-nav" aria-expanded="false"><span></span></button>
      </div>
    </div>
  </header>"""


FOOTER_EXPLORE = [
    ("index.html", "Home"),
    ("courses.html", "Courses"),
    ("about.html", "About Us"),
    ("admissions.html", "Admission"),
    ("contact.html", "Contact"),
    ("faq.html", "FAQ"),
]

FOOTER_ACADEMY = [
    ("teachers.html", "Our Teachers"),
    ("gallery.html", "Gallery"),
    ("student-login.html", "Student Login"),
    ("teacher-login.html", "Teacher Login"),
    ("teacher-register.html", "Teach With Us"),
    ("admin-login.html", "Administrator"),
]

FOOTER_POLICIES = [
    ("terms.html", "Terms of Service"),
    ("privacy-policy.html", "Privacy Policy"),
    ("payment-policy.html", "Fee & Payment Policy"),
    ("refund-policy.html", "Refund Policy"),
    ("student-policy.html", "Student Code of Conduct"),
    ("teacher-policy.html", "Teacher Policy"),
]

SOCIALS = [
    ("facebook", "Facebook"),
    ("instagram", "Instagram"),
    ("youtube", "YouTube"),
    ("tiktok", "TikTok"),
]


def _links(items: list[tuple[str, str]]) -> str:
    return "\n          ".join(f'<a href="{h}">{t}</a>' for h, t in items)


def site_footer() -> str:
    socials = "\n            ".join(
        f'<a class="social-btn" data-social="{key}" aria-label="{label}" '
        f'target="_blank" rel="noopener" hidden>{ic(key)}</a>'
        for key, label in SOCIALS
    )
    return f"""  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        {brand()}
        <p class="footer-about">Structured, teacher-led online Qur'an education for children and adults &mdash; Noorani Qaida, Nazra, Hifz, Tajweed and Islamic studies, taught one-to-one from Pakistan to families worldwide.</p>
        <div class="footer-contact">
          <a data-academy="email">samadulquran@gmail.com</a>
          <a data-academy="phone">+92 347 52 44 717</a>
          <span data-academy="address" data-hide-empty></span>
        </div>
        <div class="social-row" data-social-row>
            {socials}
          <span class="tiny" data-social-empty hidden>Social channels are being set up.</span>
        </div>
      </div>
      <div>
        <h4>Explore</h4>
        <nav class="footer-links" aria-label="Footer">
          {_links(FOOTER_EXPLORE)}
        </nav>
      </div>
      <div>
        <h4>Academy</h4>
        <nav class="footer-links" aria-label="Academy links">
          {_links(FOOTER_ACADEMY)}
        </nav>
      </div>
      <div>
        <h4>Policies</h4>
        <nav class="footer-links" aria-label="Policies">
          {_links(FOOTER_POLICIES)}
        </nav>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>&copy; <span data-year>2026</span> <span data-academy="name">{ACADEMY}</span>. All rights reserved.</span>
      <nav aria-label="Legal">
        <a href="terms.html">Terms</a>
        <a href="privacy-policy.html">Privacy</a>
        <a href="payment-policy.html">Fees</a>
        <a href="sitemap.xml">Sitemap</a>
      </nav>
    </div>
  </footer>
  <a class="whatsapp-fab" data-whatsapp-link data-whatsapp-text="Assalamu alaikum, I would like to know more about the Qur'an classes." target="_blank" rel="noopener" aria-label="Chat on WhatsApp">{ic('whatsapp')}</a>"""


def public_page(*, page: str, title: str, desc: str, body: str,
                body_class: str = "site", extra_scripts: list[str] | None = None) -> str:
    js = ["core.js", "site.js"] + (extra_scripts or [])
    return f"""{head(title, desc)}
<body class="{body_class}" data-page="{page}">
{site_header()}
  <main id="main">
{body}
  </main>
{site_footer()}
{scripts(js)}
</body>
</html>
"""


def page_hero(title: str, blurb: str, crumbs: list[tuple[str, str]], *, eyebrow: str = "") -> str:
    parts = []
    for href, label in crumbs[:-1]:
        parts.append(f'<a href="{href}">{label}</a><span aria-hidden="true">/</span>')
    parts.append(f'<span data-crumb>{crumbs[-1][1]}</span>')
    crumb_html = "\n          ".join(parts)
    eb = f'<p class="eyebrow">{eyebrow}</p>' if eyebrow else ""
    return f"""    <section class="page-hero">
      <div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          {crumb_html}
        </nav>
        {eb}
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>
    </section>"""


# ---------------------------------------------------------- portal chrome ---

STUDENT_NAV = [
    ("student-dashboard.html", "student-dashboard", "home", "Dashboard", None),
    ("classes.html", "classes", "calendar", "My Classes", None),
    ("classroom.html", "classroom", "video", "Live Classroom", None),
    ("attendance.html", "attendance", "checkCircle", "Attendance", None),
    ("payments.html", "payments", "wallet", "Fees &amp; Payments", None),
    ("chat.html", "chat", "chat", "Messages", "messages"),
    ("notifications.html", "notifications", "bell", "Notifications", "notifications"),
    ("profile.html", "profile", "user", "My Profile", None),
]

TEACHER_NAV = [
    ("teacher-dashboard.html", "teacher-dashboard", "home", "Dashboard", None),
    ("teacher-students.html", "teacher-students", "users", "My Students", None),
    ("classes.html", "classes", "calendar", "Class Schedule", None),
    ("classroom.html", "classroom", "video", "Live Classroom", None),
    ("attendance.html", "attendance", "checkCircle", "Attendance", None),
    ("chat.html", "chat", "chat", "Messages", "messages"),
    ("notifications.html", "notifications", "bell", "Notifications", "notifications"),
    ("profile.html", "profile", "user", "My Profile", None),
]

ADMIN_NAV = [
    ("Overview", [
        ("admin.html", "admin", "chart", "Dashboard", None),
        ("admin-finance.html", "admin-finance", "wallet", "Finance", None),
        ("admin-audit.html", "admin-audit", "shield", "Audit Log", None),
    ]),
    ("People", [
        ("admin-admissions.html", "admin-admissions", "certificate", "Admissions", None),
        ("admin-students.html", "admin-students", "users", "Students", None),
        ("admin-teachers.html", "admin-teachers", "user", "Teachers", None),
    ]),
    ("Teaching", [
        ("admin-classes.html", "admin-classes", "calendar", "Classes", None),
        ("admin-attendance.html", "admin-attendance", "checkCircle", "Attendance", None),
    ]),
    ("Money", [
        ("admin-payments.html", "admin-payments", "wallet", "Payments", None),
    ]),
    ("Communication", [
        ("admin-messages.html", "admin-messages", "mail", "Enquiries", None),
        ("admin-notifications.html", "admin-notifications", "bell", "Notifications", None),
    ]),
    ("Website", [
        ("admin-content.html", "admin-content", "book", "Content", None),
        ("admin-settings.html", "admin-settings", "settings", "Settings", None),
    ]),
]


def _side_link(href: str, page: str, icon_name: str, label: str, count: str | None,
               role_only: str | None = None) -> str:
    badge = ""
    if count == "messages":
        badge = '<span class="side-count" data-unread-messages hidden>0</span>'
    elif count == "notifications":
        badge = '<span class="side-count" data-unread-notifications hidden>0</span>'
    attr = f' data-role-only="{role_only}"' if role_only else ""
    return (f'<a class="side-link" href="{href}" data-nav="{page}"{attr}>'
            f'{ic(icon_name)}<span>{label}</span>{badge}</a>')


def portal_sidebar(role: str, home: str) -> str:
    if role == "admin":
        groups = []
        for title, items in ADMIN_NAV:
            links = "\n          ".join(_side_link(*i) for i in items)
            groups.append(f'<div class="side-group"><p class="side-group-title">{title}</p>\n          {links}\n        </div>')
        body = "\n        ".join(groups)
        sub = "Administration"
    elif role == "shared":
        student = "\n          ".join(_side_link(*i, role_only="student") for i in STUDENT_NAV)
        teacher = "\n          ".join(_side_link(*i, role_only="teacher") for i in TEACHER_NAV)
        body = (f'<div class="side-group" data-role-only="student">{student}</div>\n        '
                f'<div class="side-group" data-role-only="teacher">{teacher}</div>')
        sub = "Portal"
    else:
        items = STUDENT_NAV if role == "student" else TEACHER_NAV
        body = '<div class="side-group">' + "\n          ".join(_side_link(*i) for i in items) + "</div>"
        sub = "Student Portal" if role == "student" else "Teacher Portal"

    return f"""  <aside class="portal-sidebar" id="portal-sidebar">
    <a class="brand" href="{home}">
      <img src="assets/logo-mark.png" alt="" width="44" height="44">
      <span class="brand-text">
        <span class="brand-name" data-academy="name">{ACADEMY}</span>
        <span class="brand-tag">{sub}</span>
      </span>
    </a>
    <nav class="side-scroll" aria-label="Portal navigation">
        {body}
    </nav>
    <div class="side-foot">
      <a class="side-link" href="index.html">{ic('globe')}<span>View website</span></a>
      <button type="button" class="side-link" data-logout>{ic('logout')}<span>Sign out</span></button>
      <div class="side-user">
        <span data-user-avatar data-avatar-size="avatar-sm"></span>
        <span class="who"><span class="name" data-user-name>&mdash;</span><span class="role" data-user-role></span></span>
      </div>
    </div>
  </aside>
  <div class="sidebar-backdrop" hidden></div>"""


def portal_topbar(title: str, subtitle: str, actions: str = "") -> str:
    # Greetings get `data-greeting` so paintIdentity() can append the account's
    # first name once /api/me returns. Page titles are left alone.
    greet = ' data-greeting' if title.startswith("Assalamu alaikum") else ""
    return f"""    <header class="portal-topbar">
      <button type="button" class="sidebar-toggle" aria-label="Open navigation" aria-controls="portal-sidebar" aria-expanded="false">{ic('list')}</button>
      <div class="portal-title">
        <h1{greet}>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div class="topbar-actions">
        {actions}
        <div class="dropdown">
          <button type="button" class="icon-btn" data-dropdown="notif-panel" aria-expanded="false" aria-haspopup="true" aria-label="Notifications">
            {ic('bell')}<span class="dot" data-unread-notifications hidden>0</span>
          </button>
          <div class="dropdown-panel" id="notif-panel" hidden>
            <div class="dropdown-head">
              <h4>Notifications</h4>
              <button type="button" class="copy-btn" data-notif-read-all>Mark all read</button>
            </div>
            <ul class="dropdown-list notif-list" id="notif-list"></ul>
            <div class="dropdown-foot"><a href="notifications.html">View all notifications</a></div>
          </div>
        </div>
        <button type="button" class="icon-btn" data-open-profile aria-label="My profile">{ic('user')}</button>
        <button type="button" class="icon-btn" data-logout aria-label="Sign out">{ic('logout')}</button>
      </div>
    </header>"""


def portal_page(*, page: str, role: str, title: str, subtitle: str, body: str,
                doc_title: str, js: list[str], actions: str = "",
                nav_role: str | None = None, data_role: str | None = None) -> str:
    home = {"student": "student-dashboard.html", "teacher": "teacher-dashboard.html",
            "admin": "admin.html", "shared": "student-dashboard.html"}[role]
    role_attr = f' data-role="{data_role}"' if data_role else ""
    return f"""{head(doc_title, subtitle)}
<body class="portal" data-page="{page}"{role_attr}>
  <a class="skip-link" href="#main">Skip to main content</a>
  <div class="portal-shell">
{portal_sidebar(nav_role or role, home)}
    <div class="portal-main">
{portal_topbar(title, subtitle, actions)}
      <main class="portal-body" id="main">
{body}
      </main>
    </div>
  </div>
{scripts(js)}
</body>
</html>
"""


# ------------------------------------------------------------ auth pages ---

def auth_page(*, page: str, title: str, desc: str, aside_title: str, aside_text: str,
              aside_points: list[str], card: str) -> str:
    points = "\n            ".join(
        f'<li class="value-item">{ic("check")}<span>{p}</span></li>' for p in aside_points
    )
    return f"""{head(title, desc)}
<body class="auth-page" data-page="{page}">
  <aside class="auth-aside">
    {brand()}
    <div>
      <p class="eyebrow">{ACADEMY}</p>
      <h2>{aside_title}</h2>
      <p>{aside_text}</p>
      <ul class="value-list mt-5">
            {points}
      </ul>
    </div>
    <p class="tiny" style="color:rgba(255,255,255,.6)">&copy; <span data-year>2026</span> <span data-academy="name">{ACADEMY}</span></p>
  </aside>
  <main class="auth-main" id="main">
    <div class="auth-card">
{card}
    </div>
  </main>
{scripts(['core.js', 'site.js'])}
</body>
</html>
"""
