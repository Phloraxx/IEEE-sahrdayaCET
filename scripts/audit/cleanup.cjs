/**
 * Remove every row, session and upload the staging audit created.
 * Runs inside the web container (the database is owned by the container uid).
 */
const { DatabaseSync } = require("node:sqlite");
const { execFileSync } = require("node:child_process");

const db = new DatabaseSync("/app/data/portal.db");
const testEvents = ["a0000000-0000-4000-8000-000000000001", "stgtest-event-0000-0000-000000000001"];
const user = db.prepare("SELECT id FROM users WHERE email=?").get("staging-audit-user@example.invalid");

function delRegistration(id) {
  db.prepare("DELETE FROM notification_outbox WHERE registration_id=?").run(id);
  db.prepare("DELETE FROM payments WHERE registration_id=?").run(id);
  db.prepare("DELETE FROM registration_cancellation_requests WHERE registration_id=?").run(id);
  db.prepare("DELETE FROM attendance_records WHERE registration_id=?").run(id);
  db.prepare("DELETE FROM registrations WHERE id=?").run(id);
}

for (const eventId of testEvents) {
  for (const row of db.prepare("SELECT id FROM registrations WHERE event_id=?").all(eventId)) delRegistration(row.id);
}
if (user) {
  for (const row of db.prepare("SELECT id FROM registrations WHERE user_id=?").all(user.id)) delRegistration(row.id);
}
for (const eventRow of db.prepare("SELECT id FROM events WHERE slug LIKE 'staging-audit-%' OR id IN (?,?)").all(...testEvents)) {
  for (const row of db.prepare("SELECT id FROM registrations WHERE event_id=?").all(eventRow.id)) delRegistration(row.id);
  db.prepare("DELETE FROM admin_audit_log WHERE entity_id=?").run(eventRow.id);
  db.prepare("DELETE FROM admin_audit_log WHERE event_id=?").run(eventRow.id);
  db.prepare("DELETE FROM events WHERE id=?").run(eventRow.id);
}
if (user) {
  db.prepare("DELETE FROM admin_audit_log WHERE actor_id=?").run(user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  db.prepare("DELETE FROM users WHERE id=?").run(user.id);
}
db.prepare("DELETE FROM sessions WHERE user_agent LIKE 'staging-test%'").run();

for (const society of db.prepare("SELECT id FROM societies WHERE slug LIKE 'staging-audit-%'").all()) {
  db.prepare("DELETE FROM admin_audit_log WHERE entity_id=?").run(society.id);
  db.prepare("DELETE FROM societies WHERE id=?").run(society.id);
  try { execFileSync("rm", ["-rf", `/app/data/uploads/societies/${society.id}`]); } catch { /* absent */ }
}
for (const member of db.prepare("SELECT id FROM execom WHERE name='Staging Audit Member'").all()) {
  db.prepare("DELETE FROM admin_audit_log WHERE entity_id=?").run(member.id);
}
db.prepare("DELETE FROM execom WHERE name='Staging Audit Member'").run();
db.close();
console.log("staging audit cleanup done");
