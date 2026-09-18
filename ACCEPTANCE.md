# Acceptance checklist

Each item states how it was verified, not just that it exists. Where something is
intentionally not done, that is said plainly rather than ticked off.

Verification methods referenced below:

- **e2e** — `cd server && node tests/api-e2e.mjs` (128 checks, all passing).
- **browser** — Playwright audit of the rendered page at 1440px and 375px,
  checking console errors, horizontal overflow, broken images, leftover loading
  skeletons and text collisions. All 42 pages pass with zero findings.
- **build** — `python3 tools/build.py` reports `verification: OK`.
- **manual** — inspected directly in a browser or in the database.

---

## Existing system preserved

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 1 | Existing project inspected before any change | Done | Original 39 routes and 13 tables catalogued; the legacy backend was found genuinely functional and was extended, not replaced. Original files kept at `web.backup/` and `server/server.legacy.js.bak`. |
| 2 | No working functionality removed | Done | e2e covers every legacy capability (enrollment, login, classes, attendance, payments, messaging, admin) plus the additions. 82 routes now, superset of the original 39. |
| 3 | No existing data destroyed | Done | The supplied archive contained **no database file**, so there was never any pre-existing student, payment or attendance data. The database is created and seeded on first run. |
| 4 | Existing authentication kept working | Done | e2e: student, teacher and admin sign-in, token lifetime, and 403s for cross-role access. |
| 5 | Existing Jitsi classroom kept, no fake video | Done | The original Jitsi integration is intact. Room names are a SHA-256 hash of student + course, so they are stable and not guessable. `GET /api/classes/join` returns `provider: 'jitsi'`. No fake video player exists anywhere. |
| 6 | Existing IBAN preserved, not replaced | Done | manual: `PK31NAYA1234503227589462` / `Hafiz Muhammad Saqib` are in the database unchanged and rendered on the payments page. |
| 7 | Android/WebView project still works | Done | Both shipping modes wired and documented. The bundled site was loaded from a separate origin in a real browser: 6 courses and 6 gallery images from the live API, three web fonts loaded, student sign-in succeeded, payments page showed all four methods and the correct IBAN, zero console errors. |

## Nothing invented

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 8 | No fake APIs | Done | Every page reads from the real backend. There is no mock layer, no fixture file and no hard-coded response in `web/js/`. |
| 9 | No fake payment success | Done | e2e asserts a submitted payment is `pending`, that only an administrator can verify it, and that verification is irreversible (HTTP 409 on a second attempt). |
| 10 | No hard-coded transactions | Done | manual: `payments` and `receipts` are empty on a fresh database. |
| 11 | No invented bank information | Done | `bank_name` and the account number ship **blank**. The transfer card renders IBAN and title only until an administrator fills them in. |
| 12 | No invented social media URLs | Done | All four social settings ship blank and each icon is omitted entirely while blank. A test run that left `facebook.com/example-academy` in settings was caught and the test suite now rolls its own changes back. |
| 13 | Missing credentials handled by configuration, not invention | Done | `server/.env.example` documents every variable; `GET /api/admin/config-status` drives a "Configuration still needed" panel naming each unset field; the Settings page labels each blank field "Not set — hidden from the website". |
| 14 | No non-functional buttons | Done | browser: every control on all 42 pages was exercised or traced to a handler. No `href="#"` placeholders and no dead submit buttons. |
| 15 | No `alert()` used for UI | Done | `alert(` appears nowhere in `web/js/`. Feedback uses the toast, modal and inline field-error components. |
| 16 | No excessive animation | Done | One reveal-on-scroll observer, one count-up on real numbers, and CSS state transitions. `prefers-reduced-motion` is respected. |

## Public website

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 17 | Home page with all required sections | Done | build + browser. Hero with Enrol Now and View Courses, proof band, courses, why-us, process, gallery, fees, testimonials host, FAQ, CTA. |
| 18 | Courses index and course detail | Done | browser: 6 courses from `/api/courses`; detail page resolves by slug and lists assigned teachers. |
| 19 | About, admission, gallery, teachers, contact, FAQ | Done | browser, all live-data backed. |
| 20 | Six policy pages | Done | terms, privacy, payment, refund, student conduct, teacher conduct. |
| 21 | Teachers and Gallery in the footer, not the main nav | Done | manual: main navigation is Home, Courses, About Us, Admission, Contact. Teachers and Gallery appear under the footer's Academy and Explore columns. |
| 22 | Real images throughout, no placeholders | Done | 18 photographs generated for this academy, served as WebP with JPEG fallback, plus a custom SVG logo and favicon set. No stock placeholder or grey box anywhere. |
| 23 | SEO | Done | Per-page titles and descriptions, canonical URLs, Open Graph and Twitter cards with a real cover image, `sitemap.xml` and `robots.txt`. JSON-LD is deliberately omitted because `script-src 'self'` forbids inline scripts. |

## Workflows

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 24 | Admission workflow with all five states | Done | e2e: Pending → Approved → Active, plus Rejected and Completed. |
| 25 | Student ↔ teacher assignment | Done | e2e: assignment, the teacher's student list, and the per-student detail view. |
| 26 | Three dashboards, each role-appropriate | Done | browser: 8 student, 8 teacher and 13 admin pages, all audit-clean. |
| 27 | Attendance with Present / Absent / Late / Leave | Done | e2e: marking, the student's own record, and the admin aggregate report. Attendance percentage counts Present and Late as attended. |
| 28 | Four payment methods | Done | browser: Bank Transfer, Easypaisa, JazzCash and Cash all render with their own instructions; each is a database row an administrator can edit. |
| 29 | Proof upload and administrator verification | Done | e2e: submission with reference and proof, then verify and reject paths with a reason. |
| 30 | Receipts | Done | e2e: `SUQ-YYYYMM-000123` generated on verification, retrievable by the student. |
| 31 | Notifications | Done | e2e: per-user delivery, admin broadcast, and unread counts. |
| 32 | Messaging | Done | e2e: student ↔ teacher threads plus admin oversight of any conversation. |
| 33 | Finance dashboard with charts | Done | browser: revenue, method breakdown and collection rate, drawn as hand-written SVG (no chart CDN, which `script-src 'self'` would block). |
| 34 | Search and filters | Done | browser: every admin list supports a text query plus the relevant status, method, teacher, course, month and date filters, all applied server-side. |
| 35 | Loading, empty and error states | Done | browser: skeletons while loading, a written empty state per surface, and a retryable error state. Zero leftover skeletons across all 42 pages. |

## Billing

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 36 | Due on the 5th, grace to the 8th, suspension on the 9th, server-side in Asia/Karachi | Done | e2e drives the calendar directly. All evaluation is server-side, so a device clock change has no effect. Days are configurable. |
| 37 | Suspension deletes nothing | Done | e2e: after suspension the account, course history, payments, receipts and attendance are all still present; only access changes. |
| 38 | Verification reactivates automatically | Done | e2e: verifying the outstanding month flips the student back to active with no manual step. |
| 39 | Four payment statuses, never auto-paid | Done | e2e: Pending, Verified, Rejected, Overdue. Submitting a form leaves the payment Pending; only an administrator can verify. |
| 40 | Arrears handled per month | Done | `payableMonths` and `unpaidMonths` list each outstanding month separately instead of merging them into one total. |

## Design, responsiveness and security

| # | Requirement | Status | How it was verified |
| --- | --- | --- | --- |
| 41 | Deep Islamic green primary, gold secondary, ivory and dark-green surfaces | Done | A single token file drives every colour. No off-palette values remain except one blue informational notice, kept for its accessibility contrast. |
| 42 | Elegant typography, modern cards, soft shadows, rounded corners | Done | Playfair Display for display text, Manrope for body, Amiri for Arabic — all self-hosted under the SIL Open Font License. |
| 43 | Responsive | Done | browser at 375px and 1440px across all page types: zero horizontal overflow. Three real mobile bugs were found and fixed (header overflow, portal topbar overflow, and an unsized icon rule that stretched SVGs to full container width). |
| 44 | RBAC and server-side authorisation | Done | e2e: every cross-role attempt returns 403 from the server, independent of what the page displays. |
| 45 | Input validation | Done | e2e: required fields, password length, guardian required under 18, IBAN checksum, and billing-day ordering. |
| 46 | Audit logs | Done | e2e: payment verification and admission approval are both recorded with actor and timestamp. Raw JSON no longer leaks into the UI — entries render as readable label/value pairs. |
| 47 | Security headers | Done | e2e asserts the CSP blocks inline scripts, `nosniff` is present, Jitsi is the only permitted frame source, and path traversal is refused. |
| 48 | Accessibility | Done | Skip link, labelled form controls, `aria-current` on the active nav item, `aria-expanded` on toggles, visible focus rings, and a `<noscript>` fallback that reveals scroll-animated content. |

---

## Not done, and why

| Item | Reason |
| --- | --- |
| Automatic Easypaisa / JazzCash online checkout | Needs real merchant credentials, which cannot be invented. The variables and configuration UI are ready; meanwhile the manual proof-and-verify workflow is complete and is what the academy runs. |
| E-mail and SMS notifications | No SMTP or SMS provider credentials. In-app notifications are fully functional. Adding a provider is a clean extension point; no fake sender was added. |
| Testimonials on the homepage | The feature works end to end, but inventing parent quotes would be fabricating social proof. The section hides itself until real testimonials are added in the admin dashboard. |
| Built APK | Requires the Android SDK and a JDK, neither available in this environment. The project and both configuration modes are ready for `./gradlew assembleDebug`. |
| JSON-LD structured data | `script-src 'self'` forbids inline scripts, and weakening the CSP for SEO markup is a bad trade. Meta, Open Graph and Twitter tags cover the same ground. |
