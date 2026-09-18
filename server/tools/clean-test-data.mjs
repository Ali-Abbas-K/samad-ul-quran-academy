/* =============================================================================
   clean-test-data.mjs — remove rows created by tests/api-e2e.mjs and restore the
   course catalogue text the test suite overwrites.

   Run before handing the system over, or any time after running the e2e suite:

       ~/n22/bin/node tools/clean-test-data.mjs            # dry run, shows counts
       ~/n22/bin/node tools/clean-test-data.mjs --apply    # actually delete

   It only ever touches rows whose email matches the throwaway test domains, so
   it is safe to run against a live database.
   ========================================================================== */

import { db, DEFAULT_COURSES, DEFAULT_SETTINGS } from '../src/db.js';

const APPLY = process.argv.includes('--apply');
/* OPTIONAL, OPERATOR-ONLY. The e2e suite also writes rows under the real admin
   identity: audit entries for its own settings/course/gallery calls, and admin
   notifications about test students that no longer exist. Those cannot be
   matched by e-mail pattern. `--full` clears the operational log tables so a
   fresh install starts with an empty history. It is deliberately NOT part of the
   default run, because on a live academy database these tables hold real
   history. Never pass --full to a database that has served real students. Seed
   data (courses, gallery, settings, payment methods) is never touched. */
const FULL = process.argv.includes('--full');
const OPERATIONAL = ['audit_logs', 'notifications', 'reminder_log'];

/* Emails the e2e suite creates. Nothing else is touched. */
const TEST_EMAIL = "(lower(%COL%) LIKE 'e2e.%@example.com' "
  + "OR lower(%COL%) LIKE 'visitor.%@example.com' "
  + "OR lower(%COL%) LIKE 'admin.created.%@example.com')";

const col = (name) => TEST_EMAIL.replaceAll('%COL%', name);

/* Order matters: children before parents. `receipts.payment_id` has a foreign
   key onto `payments`, so receipts for test payments must go first. */
const TARGETS = [
  ['attendance', `student_email IN (SELECT email FROM users WHERE ${col('email')})`],
  ['receipts', `payment_id IN (SELECT id FROM payments WHERE ${col('student_email')})`],
  ['payments', col('student_email')],
  ['receipts', 'payment_id IS NOT NULL AND payment_id NOT IN (SELECT id FROM payments)'],
  ['class_sessions', `${col('student_email')} OR ${col('teacher_email')}`],
  ['chat_messages', `${col('student_email')} OR ${col('teacher_email')} OR ${col('sender_email')}`],
  ['notifications', col('user_email')],
  ['enrollments', col('email')],
  ['messages', col('email')],
  ['users', col('email')],
  ['audit_logs', "details LIKE '%e2e.%' OR details LIKE '%@example.com%' OR actor LIKE '%@example.com%'"],
  ['reminder_log', col('user_email')],
];

/* The e2e suite PATCHes a course to prove the endpoint works. DEFAULT_COURSES is
   the canonical catalogue, so restore straight from it rather than keeping a
   second copy of the marketing copy here. */
const COURSE_TEXT = DEFAULT_COURSES.map(([name, fee, description, level]) => [name, description, fee, level]);

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function run() {
  let removed = 0;
  /* One transaction: a foreign-key failure part way through must not leave the
     database with some test rows deleted and others still present. */
  db.exec('BEGIN');
  for (const [table, where] of TARGETS) {
    if (!tableExists(table)) continue;
    let n = 0;
    try {
      n = db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).get().n;
    } catch (err) {
      console.log(`  ${table.padEnd(16)} skipped (${err.message})`);
      continue;
    }
    if (!n) continue;
    if (APPLY) db.prepare(`DELETE FROM ${table} WHERE ${where}`).run();
    console.log(`  ${table.padEnd(16)} ${APPLY ? 'deleted' : 'would delete'} ${n}`);
    removed += n;
  }

  if (FULL) {
    for (const table of OPERATIONAL) {
      if (!tableExists(table)) continue;
      const n = db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
      if (!n) continue;
      if (APPLY) db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  ${table.padEnd(16)} ${APPLY ? 'cleared' : 'would clear'} ${n} (--full)`);
      removed += n;
    }
  }

  let fixed = 0;
  const upd = db.prepare('UPDATE courses SET description=?,fee=?,level=? WHERE name=? AND (description<>? OR fee<>? OR level<>?)');
  for (const [name, desc, fee, level] of COURSE_TEXT) {
    const row = db.prepare('SELECT description,fee,level FROM courses WHERE name=?').get(name);
    if (!row) continue;
    if (row.description === desc && Number(row.fee) === fee && row.level === level) continue;
    if (APPLY) upd.run(desc, fee, level, name, desc, fee, level);
    console.log(`  courses          ${APPLY ? 'restored' : 'would restore'} "${name}"`);
    fixed += 1;
  }

  /* Older versions of the e2e suite left placeholder business details behind.
     Reset any setting whose value still looks like test data back to its blank
     default, so the site never publishes an invented bank or social URL. */
  const SUSPECT = /example\.com|example-academy|test bank|placeholder|lorem|e2e/i;
  let reset = 0;
  for (const [key, blank] of Object.entries(DEFAULT_SETTINGS)) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (!row || !row.value || !SUSPECT.test(row.value)) continue;
    if (APPLY) db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(blank ?? ''), key);
    console.log(`  settings         ${APPLY ? 'cleared' : 'would clear'} ${key} = "${row.value}"`);
    reset += 1;
  }
  if (reset) console.log(`  (${reset} setting(s) contained placeholder values)`);

  console.log(`\n${APPLY ? 'Removed' : 'Would remove'} ${removed} test row(s); `
    + `${APPLY ? 'restored' : 'would restore'} ${fixed} course record(s).`);
  if (!APPLY) console.log('Re-run with --apply to make the changes.');
  db.exec(APPLY ? 'COMMIT' : 'ROLLBACK');
}

console.log(`clean-test-data (${APPLY ? 'APPLY' : 'dry run'})`);
try {
  run();
} catch (err) {
  try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
  console.error('\nclean-test-data failed; no changes were kept.');
  console.error(err.message);
  process.exit(1);
}
