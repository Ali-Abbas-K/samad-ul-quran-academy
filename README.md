# Samad-ul-Qur'an Academy — Online Qur'an Academy Management System

A complete, working academy platform: a public website, three role-based
dashboards, a live classroom, attendance, and a full monthly fee lifecycle with
administrator verification. Node.js + SQLite backend, hand-written static
frontend, and an Android WebView wrapper.

There are no mock APIs, no placeholder payment confirmations and no buttons that
do nothing. Where a real credential is required and absent, the system says so
plainly in the admin dashboard instead of inventing a value.

---

## Contents

1. [What it does](#what-it-does)
2. [Running it](#running-it)
3. [First-run setup](#first-run-setup)
4. [Fee lifecycle](#fee-lifecycle)
5. [Payments and verification](#payments-and-verification)
6. [Configuration, credentials and what is deliberately blank](#configuration-credentials-and-what-is-deliberately-blank)
7. [Android app](#android-app)
8. [Project layout](#project-layout)
9. [Editing the site](#editing-the-site)
10. [Testing](#testing)
11. [Security](#security)
12. [Deploying to production](#deploying-to-production)
13. [Known limits and honest notes](#known-limits-and-honest-notes)

---

## What it does

**Public website** (19 pages) — home, courses index and course detail, about,
admission form, gallery, teachers, contact, FAQ, three login pages, teacher
registration, and six policy pages (terms, privacy, payment, refund, student
conduct, teacher conduct). Teachers and Gallery are reachable from the footer,
not the main navigation.

**Admission workflow** — a public form creates an enrollment and a student
account in one step. Enrollments move through Pending → Approved → Active, or
Rejected, and can be marked Completed. Approving an enrollment starts the
student's fee schedule.

**Student portal** — dashboard with current course, attendance percentage,
upcoming classes and this month's fee; class schedule; live classroom; own
attendance record; fees and payments with proof upload and downloadable receipts;
messages with the assigned teacher; notifications; profile and password.

**Teacher portal** — dashboard, assigned students with progress, class
scheduling, attendance marking (Present / Absent / Late / Leave), classroom,
messages, notifications, profile.

**Admin dashboard** (13 pages) — overview, students, teachers, admissions,
classes, attendance, payments, finance with charts, content (courses, gallery,
testimonials), messages, notifications, settings, and an audit log.

**Live classroom** — Jitsi Meet, embedded via the existing integration. Each
student-and-course pair gets a stable private room derived from a hash, so room
names are not guessable. Suspended students are refused entry by the server.

---

## Running it

Requires **Node.js 22.5 or newer** — the backend uses Node's built-in
`node:sqlite`, so there are no npm dependencies to install and no build step for
the server.

Check your version first:

```bash
node --version    # must be v22.5.0 or higher
```

### Windows

Double-click `start-server.bat`, then `open-website.bat`. `CHECK-SERVER.bat`
reports whether the server is up.

Or from a command prompt:

```bat
cd server
npm start
```

### Linux / macOS

```bash
cd server
npm start
```

Then open <http://localhost:8080>.

---

## First-run setup

1. **Set the two secrets.** Copy `server/.env.example` to `server/.env` and fill
   in `JWT_SECRET` and `ADMIN_KEY`. The server prints a warning on every start
   until you do, and refuses to consider itself production-ready.

   ```bash
   cd server
   cp .env.example .env
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
   node -e "console.log('ADMIN_KEY=' + require('crypto').randomBytes(24).toString('base64url'))"
   ```

2. **Sign in as administrator.** Open `/admin-login.html` and enter your
   `ADMIN_KEY`. There is no admin e-mail or password — the key *is* the
   credential. Rate limited to 10 attempts per 15 minutes per IP.

3. **Fill in Settings.** The admin Settings page lists every configurable
   business detail with an integration status panel showing Configured or
   Not set for each one. Anything left blank is hidden from the public site
   rather than displayed as a placeholder.

4. **Add teachers.** Teachers apply through `/teacher-register.html` and are
   activated by an administrator, or you can create them directly from the admin
   Teachers page.

5. **Approve your first admission** to start that student's fee schedule.

The database is created automatically at `data/samad-ul-quran.db` on first run,
seeded with the six courses, the gallery, the four payment methods and the
default settings.

---

## Fee lifecycle

All dates are evaluated server-side in **Asia/Karachi**, so a student cannot
change their device clock to dodge a suspension.

| Day of month | State | What happens |
| --- | --- | --- |
| 1–4 | Upcoming | The month's fee is shown as upcoming. |
| **5** | **Due** | Fee becomes due. Reminder notification sent. |
| 6–7 | Grace | Reminders continue. Access unaffected. |
| **8** | **Final grace** | Final warning sent. Last day to pay without suspension. |
| **9** | **Suspended** | If the current month is still unverified, the account is suspended automatically. |

A suspended student **keeps everything**. Nothing is deleted: the account,
course history, attendance record, past payments and receipts all remain
untouched. What changes is access — they cannot join the classroom, and the
portal shows a clear explanation of what to pay and how.

When an administrator verifies a payment for the outstanding month, the account
**reactivates automatically**. No manual un-suspending step.

The three days are configurable on the admin Settings page (due day ≤ grace end
day < suspension day, each between 1 and 28). The billing pass is idempotent: it
runs at most once per day per month regardless of how often it is triggered, so
no student is ever double-notified or double-suspended. It runs on server start
and opportunistically on request, so no external cron job is required — though
`POST /api/admin/billing/run` lets you trigger it manually.

Arrears are handled properly. If a student owes several months, the payments page
lists each unpaid month separately rather than lumping them into one figure.

---

## Payments and verification

Four methods, all real, all defined in the database and editable by an
administrator: **Bank Transfer**, **Easypaisa**, **JazzCash** and **Cash**.

The workflow:

1. The student picks a month and a method, enters the transaction reference, and
   uploads a proof screenshot.
2. The payment is recorded as **Pending**. It is *not* treated as paid.
3. An administrator reviews the proof on the admin Payments page and marks it
   **Verified** or **Rejected**, with a reason.
4. Verification generates a receipt (`SUQ-YYYYMM-000123`) the student can view
   and print, and reactivates a suspended account if the outstanding month is now
   covered.

**A submitted form never counts as payment.** The four statuses are Pending,
Verified, Rejected and Overdue, and only an administrator can move a payment to
Verified. Verification is deliberately irreversible — attempting to re-verify or
reverse a verified payment returns HTTP 409 — so the finance record cannot be
quietly rewritten. Every verification and rejection is written to the audit log
with the actor and timestamp.

The bank details that shipped with the project are unchanged:

```
IBAN           PK31NAYA1234503227589462
Account title  Hafiz Muhammad Saqib
```

New IBANs entered in Settings are checksum-validated (ISO 13616 mod-97) so a
typo cannot silently break every student's bank transfer.

---

## Configuration, credentials and what is deliberately blank

Two secrets live in `server/.env`: `JWT_SECRET` and `ADMIN_KEY`. See
`server/.env.example`, which documents every variable the code actually reads.

Everything else — bank name and account number, Easypaisa and JazzCash numbers
and titles, contact details, WhatsApp number, address, social media links, fee
amounts, and the billing calendar — is edited on the **admin Settings page** and
stored in the database, so the academy can change it without a redeploy.

**Nothing was invented to fill a gap.** These fields ship blank, and the site
hides each one until it is filled:

| Blank field | Effect while blank |
| --- | --- |
| Bank name | Bank transfer card shows IBAN and account title only |
| Easypaisa account and title | Easypaisa card shows "not configured yet" |
| JazzCash account and title | JazzCash card shows "not configured yet" |
| Facebook / Instagram / YouTube / TikTok URL | That social icon is not rendered at all |

`GET /api/admin/config-status` powers the "Configuration still needed" panel on
the admin dashboard, which names every unset field. It is a to-do list, not an
error.

**Payment gateway credentials.** Automatic Easypaisa and JazzCash checkout needs
real merchant credentials, which cannot be fabricated. The environment variables
exist and are documented; while they are empty the system runs the manual
proof-and-verify workflow described above, which is complete and fully
functional. The admin dashboard states which gateways are configured, so nothing
is silently half-enabled.

---

## Android app

`android/` is a single-activity WebView wrapper. Camera and microphone
permissions are requested and forwarded to the page so the Jitsi classroom works
inside the app. Cleartext HTTP is refused.

Two shipping modes, both supported. Choose one in `android/gradle.properties`.

### Mode 1 — Online (recommended)

Set `SAMAD_WEB_URL` to your live HTTPS domain. The app loads the real website, so
site and API share an origin, sessions and uploads behave exactly as in a mobile
browser, and website updates reach users without shipping a new APK.

```properties
SAMAD_WEB_URL=https://your-domain.example
```

### Mode 2 — Bundled

Ship the copy of the site in `android/app/src/main/assets/site` and point it at a
remote API.

1. Leave `SAMAD_WEB_URL` as the placeholder.
2. Set `SAMAD_API_BASE_URL=https://your-domain.example/api`.
3. Add `https://appassets.androidplatform.net` to `ALLOWED_ORIGINS` in
   `server/.env`.

The bundled pages are served through `WebViewAssetLoader` from
`https://appassets.androidplatform.net/site/`, not as `file://` URLs. That is
deliberate: a `file://` page has an opaque origin, which makes the browser refuse
the bundled web fonts, blocks `localStorage`, and loses the saved session on
every navigation. Serving from a real (private, non-routable) HTTPS origin fixes
all three, and lets the WebView run with `AllowFileAccess` switched **off**.

**Keep the bundle in sync.** After every website build:

```bash
python3 tools/build.py
bash tools/sync-android.sh
```

Building the APK needs the Android SDK and a JDK, neither of which is included
here. `./gradlew assembleDebug` from `android/` once those are installed.

---

## Project layout

```
finalfix/
├── web/                     The built website — 42 pages. Do not hand-edit HTML.
│   ├── css/                 tokens, base, components, site, portal, parts
│   ├── js/                  config, core, site, charts, portal-shell,
│   │                        student, teacher, portal, admin
│   └── assets/              images (webp + jpg), fonts, logos, favicons
├── web.backup/              The original website, untouched, for reference
├── tools/                   Page generators and maintenance scripts
│   ├── partials.py          Shared chrome: head, header, footer, nav, sidebars
│   ├── public_pages.py      The 19 public pages
│   ├── portal_pages.py      Student and teacher pages
│   ├── admin_pages.py       The 13 admin pages
│   ├── policies.py          The six policy pages
│   ├── build.py             Writes web/ and verifies the output
│   ├── sync-android.sh      Copies web/ into the Android asset bundle
│   └── build-preview.sh     Static preview copy with a fixed API origin
├── server/
│   ├── server.js            HTTP server, route table, static file serving
│   ├── src/                 config, db, util, http, billing
│   ├── src/routes/          public, auth, student, teacher, classroom, admin
│   ├── tests/api-e2e.mjs    128 end-to-end checks
│   ├── tools/clean-test-data.mjs
│   ├── server.legacy.js.bak The original backend, kept for reference
│   └── .env.example
├── android/                 WebView wrapper + bundled site assets
├── data/                    SQLite database (created on first run)
└── README.md
```

## Editing the site

The HTML in `web/` is **generated**. Editing it directly means losing the change
on the next build.

- **Page structure and copy** → edit the generator in `tools/`, then run
  `python3 tools/build.py`.
- **Styling** → edit `web/css/*.css` directly. Load order matters:
  `tokens → base → components → site → portal → parts`. `parts.css` is last and
  wins.
- **Behaviour** → edit `web/js/*.js` directly.

`build.py` verifies its own output and prints `verification: OK`. After any
markup change also run `bash tools/sync-android.sh` so the app bundle matches.

Two frontend rules worth knowing, both enforced by the Content-Security-Policy:

- **No inline `<script>` and no `onclick=` attributes.** `script-src 'self'`
  blocks them. Behaviour is attached from the JS files by `data-*` hooks.
- **Every script is a classic script sharing one top-level scope**, so each file
  except `core.js` is wrapped in an IIFE. Without that, two files declaring the
  same `const` break every page — and `node --check` cannot catch it, only a real
  browser can.

## Testing

```bash
cd server
node tests/api-e2e.mjs
```

128 checks covering enrollment, authentication and rate limiting, role
separation, the full billing calendar including suspension and reactivation,
payment submission and verification, receipts, attendance, classes and classroom
access control, chat, notifications, every admin surface, the audit log, and the
static-delivery security headers.

The suite creates its own accounts under `@example.com` and rolls back the
settings it touches. To remove its rows afterwards:

```bash
cd server
node tools/clean-test-data.mjs           # dry run — shows what would go
node tools/clean-test-data.mjs --apply   # delete
```

It only ever matches `e2e.%@example.com`, `visitor.%@example.com` and
`admin.created.%@example.com`, runs in a single transaction, and restores any
setting left holding a placeholder value. It never touches a real account.

`--full` additionally clears the audit log, notifications and reminder log. That
is for a fresh install only — on a live database those tables hold real history.

## Security

- **Passwords** — scrypt with a per-user random salt. Never stored or logged in
  plain text.
- **Sessions** — signed HS256-style tokens, 12-hour lifetime (8 hours for admin).
- **Admin authentication** — a single high-entropy key, accepted as a bearer
  token or an `X-Admin-Key` header, rate limited to 10 attempts per 15 minutes
  per IP. The key and the JWT secret cannot be read or written through the
  settings API.
- **Login rate limiting** — 8 attempts per 15 minutes per e-mail, 30 per 15
  minutes per IP. Contact form limited to 6 per hour.
- **Authorisation is server-side on every route.** Hiding a menu item is
  presentation, not security: a student calling a teacher endpoint gets 403 from
  the server regardless of what the page shows.
- **Public self-registration is disabled** — `POST /api/auth/register` returns
  403 by design. Student accounts are created only through the admission form or
  by an administrator.
- **Content-Security-Policy** — `default-src 'self'`, `script-src 'self'` (no
  inline scripts), `object-src 'none'`, `frame-src` limited to
  `https://meet.jit.si`, `frame-ancestors 'self'`. Plus `nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` and a `Permissions-Policy`
  that grants camera and microphone only to this origin and Jitsi.
- **CORS is off by default** and allow-list only. `*` is refused outright,
  because a wildcard combined with bearer tokens turns a token leak into account
  takeover.
- **Static file serving** refuses path traversal.
- **Audit log** records administrator actions with actor, action, target and
  timestamp.

## Deploying to production

1. Set `NODE_ENV=production`, a real `JWT_SECRET` and a real `ADMIN_KEY` in
   `server/.env`.
2. Keep `HOST=127.0.0.1` and put Nginx, Caddy or Apache in front, terminating
   TLS and forwarding to port 8080. HTTPS is not optional: sessions and fee proof
   uploads travel over this connection.
3. Run the server under a process supervisor (systemd, pm2) so it restarts on
   failure and on reboot.
4. **Back up `data/samad-ul-quran.db` on a schedule.** It holds every student,
   payment, receipt and attendance record. SQLite runs in WAL mode, so copy
   `.db`, `.db-wal` and `.db-shm` together, or use `sqlite3 … ".backup"`.
5. Fill in the admin Settings page.
6. Optionally add the payment gateway credentials to enable automatic checkout.

## Known limits and honest notes

Stated plainly rather than hidden:

- **No testimonials are shown.** The testimonials system is built end to end —
  admin can add, edit and remove them, and the homepage renders them — but no
  testimonial text was invented, so the database has none and the section hides
  itself. Add real parent feedback in the admin dashboard and it appears.
- **Homepage counters only show real figures.** A counter whose value is zero is
  omitted, and the whole band hides if fewer than two are real. On a fresh
  install that means the band is hidden rather than advertising "0 students".
- **Automatic Easypaisa and JazzCash checkout is not active** because it requires
  merchant credentials. The manual proof-and-verify workflow is complete and is
  what the academy runs today.
- **E-mail and SMS are not sent.** Notifications are delivered in-app and are
  fully functional there. Wiring an SMTP or SMS provider is a clean extension
  point, but no fake sender was added.
- **Social media links are absent** until real URLs are entered in Settings. No
  profile URLs were guessed.
- **The APK is not built here** — that needs the Android SDK and a JDK. The
  project and both configuration modes are ready.
- **The database ships with no students, enrolments, payments, receipts or
  attendance** — only the six courses, the gallery, the four payment methods and
  the settings. What remains are audit-log and notification rows written by the
  administrator account during development. They are harmless history, and they
  were deliberately left rather than deleted, because your instruction was not to
  delete database records and a script cannot tell development history from real
  history. If you want a spotless start, run `node tools/clean-test-data.mjs
  --full` once **before** the academy goes live. Never run it afterwards.
- **The original archive contained no database file**, so there was no
  pre-existing student, payment or attendance data to migrate or preserve. The
  original website is kept intact in `web.backup/` and the original backend in
  `server/server.legacy.js.bak`.
- **Fonts are self-hosted** under the SIL Open Font License; see
  `web/assets/fonts/README.txt`.
