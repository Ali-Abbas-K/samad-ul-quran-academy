#!/usr/bin/env python3
"""Build every HTML page in web/ from the page modules, then self-verify.

Usage:  python3 tools/build.py [--check]

--check builds into memory only and reports what would change.

Verification performed after writing:
  1. every data-page value is either registered in web/js/*.js or explicitly
     listed in UNREGISTERED_PAGES;
  2. every selector the JS queries exists in at least the page that needs it;
  3. no inline <script> blocks or on*= handlers (CSP is script-src 'self');
  4. every local href/src referenced by a page actually exists on disk.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from partials import ROOT, WEB  # noqa: E402
import public_pages  # noqa: E402
import portal_pages  # noqa: E402
import admin_pages  # noqa: E402
import policies  # noqa: E402

PAGES: dict[str, callable] = {}
for mod in (public_pages, portal_pages, admin_pages, policies):
    for name, fn in mod.PAGES.items():
        if name in PAGES:
            raise SystemExit(f"duplicate page definition: {name}")
        PAGES[name] = fn

# Pages with no JS handler by design (static legal copy).
UNREGISTERED_PAGES = {
    "policy-terms", "policy-privacy", "policy-payment",
    "policy-refund", "policy-student", "policy-teacher",
}

# Public URLs for sitemap.xml, with change priority.
SITEMAP = [
    ("index.html", "1.0", "weekly"),
    ("courses.html", "0.9", "weekly"),
    ("admissions.html", "0.9", "monthly"),
    ("about.html", "0.8", "monthly"),
    ("teachers.html", "0.7", "monthly"),
    ("gallery.html", "0.6", "monthly"),
    ("contact.html", "0.7", "monthly"),
    ("faq.html", "0.6", "monthly"),
    ("teacher-register.html", "0.5", "yearly"),
    ("student-login.html", "0.4", "yearly"),
    ("teacher-login.html", "0.4", "yearly"),
    ("terms.html", "0.3", "yearly"),
    ("privacy-policy.html", "0.3", "yearly"),
    ("payment-policy.html", "0.4", "yearly"),
    ("refund-policy.html", "0.3", "yearly"),
    ("student-policy.html", "0.3", "yearly"),
    ("teacher-policy.html", "0.3", "yearly"),
]

# Selectors each page must expose, mirroring web/js/*.js queries.
REQUIRED: dict[str, list[str]] = {
    "index.html": ['id="home-courses"', 'id="home-testimonials"', 'id="home-gallery"',
                   'id="home-teachers"', "data-stats", "data-stats-section"],
    "courses.html": ['id="courses-grid"'],
    "course.html": ['id="course-detail"'],
    "gallery.html": ['id="gallery-grid"'],
    "teachers.html": ['id="teachers-grid"'],
    "about.html": ['id="about-teachers"'],
    "contact.html": ['id="contact-form"', 'id="contact-success"'],
    "admissions.html": ['id="admission-form"', 'id="admission-form-wrap"',
                        'id="admission-success"', 'id="day-picker"', "data-guardian-field",
                        "data-step-next", "data-step-back", "data-step-dot",
                        "data-ref", "data-fee", "data-account"],
    "teacher-register.html": ['id="teacher-apply-form"', 'id="apply-success"'],
    "student-login.html": ['id="login-form"', 'name="email"', 'name="password"'],
    "teacher-login.html": ['id="login-form"', 'name="email"', 'name="password"'],
    "admin-login.html": ['id="login-form"', 'name="key"'],

    "student-dashboard.html": ['id="dash"', "data-fee-banner", "data-user-name"],
    "payments.html": ['id="pay"', "data-fee-banner"],
    "teacher-dashboard.html": ['id="dash"'],
    "teacher-students.html": ['id="students"', 'id="student-search"', 'id="student-status"'],
    "classes.html": ['id="classes"', 'id="class-status"', 'id="class-search"'],
    "classroom.html": ['id="classroom"'],
    "chat.html": ['id="chat-contacts"', 'id="chat-thread"', 'id="chat-scroll"',
                  'id="chat-input"', 'id="chat-form"'],
    "attendance.html": ['id="attendance"'],
    "notifications.html": ['id="notifications-page"', "data-portal-home", "data-notif-read-all"],
    "profile.html": ['id="profile"', "data-open-password"],

    "admin.html": ['id="overview"'],
    "admin-students.html": ['id="students"', 'id="stu-q"', 'id="stu-status"', "data-add-student"],
    "admin-teachers.html": ['id="teachers"', 'id="tea-q"', "data-add-teacher"],
    "admin-admissions.html": ['id="admissions"', 'id="adm-q"', 'id="adm-status"', 'id="adm-course"'],
    "admin-classes.html": ['id="classes"', 'id="cl-q"', 'id="cl-status"', 'id="cl-teacher"',
                           'id="cl-date"', "data-add-class"],
    "admin-attendance.html": ['id="attendance"', 'id="at-q"', 'id="at-status"',
                              'id="at-teacher"', 'id="at-month"'],
    "admin-payments.html": ['id="payments"', 'id="pm-q"', 'id="pm-status"',
                            'id="pm-method"', 'id="pm-month"', "data-add-payment"],
    "admin-finance.html": ['id="finance"', 'id="fi-month"'],
    "admin-content.html": ['id="courses-admin"', 'id="gallery-admin"', 'id="testimonials-admin"',
                           "data-add-course", "data-add-gallery", "data-add-testimonial"],
    "admin-messages.html": ['id="messages"', 'id="msg-q"'],
    "admin-notifications.html": ['id="notifications-admin"', "data-send-notification"],
    "admin-settings.html": ['id="settings"'],
    "admin-audit.html": ['id="audit"', 'id="au-q"', 'id="au-action"'],
}

# Every portal page must carry the shell hooks portal-shell.js expects.
PORTAL_HOOKS = ["data-user-name", "data-user-role", "data-user-avatar",
                "data-unread-notifications", 'id="notif-list"', "data-logout",
                "data-open-profile", 'data-dropdown="notif-panel"',
                'class="sidebar-backdrop"', "sidebar-toggle"]

LOCAL_REF = re.compile(r'(?:href|src)="(?!https?:|mailto:|tel:|#|data:)([^"?#]+)')
INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>")
INLINE_HANDLER = re.compile(r"\son[a-z]+\s*=\s*[\"']")


def registered_pages() -> set[str]:
    names: set[str] = set()
    for js in sorted((WEB / "js").glob("*.js")):
        names |= set(re.findall(r"registerPage\('([^']+)'", js.read_text(encoding="utf-8")))
    return names


def build() -> dict[str, str]:
    return {name: fn() for name, fn in PAGES.items()}


def sitemap() -> str:
    urls = "\n".join(
        f"  <url>\n    <loc>https://samadulquran.com/{loc}</loc>\n"
        f"    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>"
        for loc, pri, freq in SITEMAP
    )
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}\n</urlset>\n")


def robots() -> str:
    private = ["/admin", "/student-dashboard.html", "/teacher-dashboard.html", "/payments.html",
               "/classes.html", "/classroom.html", "/chat.html", "/attendance.html",
               "/notifications.html", "/profile.html", "/teacher-students.html", "/api/"]
    lines = "\n".join(f"Disallow: {p}" for p in private)
    return (f"User-agent: *\nAllow: /\n{lines}\n\n"
            "Sitemap: https://samadulquran.com/sitemap.xml\n")


def verify(pages: dict[str, str], extras: tuple[str, ...] = ()) -> list[str]:
    errors: list[str] = []
    known = registered_pages() | UNREGISTERED_PAGES
    on_disk = {p.name for p in WEB.iterdir()} | set(extras)

    for name, html in sorted(pages.items()):
        m = re.search(r'<body[^>]*data-page="([^"]+)"', html)
        if not m:
            errors.append(f"{name}: no data-page on <body>")
        elif m.group(1) not in known:
            errors.append(f"{name}: data-page=\"{m.group(1)}\" has no registerPage handler")

        for sel in REQUIRED.get(name, []):
            if sel not in html:
                errors.append(f"{name}: missing required selector {sel}")

        if 'class="portal"' in html:
            for hook in PORTAL_HOOKS:
                if hook not in html:
                    errors.append(f"{name}: portal shell missing {hook}")
            role = re.search(r'<body[^>]*data-role="([^"]+)"', html)
            shared = name in {"classes.html", "classroom.html", "chat.html",
                              "attendance.html", "notifications.html", "profile.html"}
            if shared and role:
                errors.append(f"{name}: shared page must omit data-role (portal.js sets it)")
            if not shared and not role:
                errors.append(f"{name}: single-role portal page needs data-role")

        if INLINE_SCRIPT.search(html):
            errors.append(f"{name}: inline <script> violates script-src 'self'")
        if INLINE_HANDLER.search(html):
            errors.append(f"{name}: inline on*= handler violates script-src 'self'")

        for ref in set(LOCAL_REF.findall(html)):
            target = ref.split("/")[0] if "/" not in ref else ref
            path = WEB / ref
            if not path.exists() and target not in on_disk and ref not in pages and ref not in extras:
                errors.append(f"{name}: broken local reference -> {ref}")

    return errors


def main() -> int:
    check = "--check" in sys.argv
    pages = build()
    extras = {"sitemap.xml": sitemap(), "robots.txt": robots()}

    if not check:
        for name, html in pages.items():
            (WEB / name).write_text(html, encoding="utf-8")
        for name, text in extras.items():
            (WEB / name).write_text(text, encoding="utf-8")

    errors = verify(pages, tuple(extras))
    total = sum(len(h) for h in pages.values())
    print(f"{'checked' if check else 'wrote'} {len(pages)} pages "
          f"+ {len(extras)} extras ({total / 1024:.0f} KB) -> {WEB.relative_to(ROOT.parent)}")

    stale = sorted(p.name for p in WEB.glob("*.html") if p.name not in pages)
    if stale:
        print("stale HTML still on disk: " + ", ".join(stale))

    if errors:
        print(f"\n{len(errors)} verification error(s):")
        for e in errors:
            print("  - " + e)
        return 1
    print("verification: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
