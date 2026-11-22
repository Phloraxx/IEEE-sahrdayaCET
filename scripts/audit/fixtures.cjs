/**
 * Read the ids the audit pivots on, inside the web container.
 *
 * It must run there: opening the WAL database from the host user leaves
 * `portal.db-wal` owned by that user, after which the container's uid cannot
 * write it and every mutation answers 500. Prints one JSON object.
 */
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("/app/data/portal.db");

const openEvent =
  db.prepare("SELECT id, slug, price FROM events WHERE slug='staging-audit-event' AND is_deleted=0").get() ||
  db.prepare("SELECT id, slug, price FROM events WHERE slug='sustainx' AND is_deleted=0").get() ||
  null;
const closedEvent =
  db.prepare("SELECT id, slug FROM events WHERE status='published' AND registration_open=0 AND is_deleted=0 LIMIT 1").get() ||
  null;
const banner =
  db.prepare("SELECT id, banner FROM events WHERE banner IS NOT NULL AND status IN ('published','completed') AND is_deleted=0 LIMIT 1").get() ||
  null;
const cert =
  db.prepare("SELECT verification_token, credential_id FROM certificates WHERE status='active' LIMIT 1").get() ||
  null;
const member = db.prepare("SELECT id FROM users WHERE email='staging-audit-user@example.invalid'").get();
const foreignReg = member
  ? db.prepare("SELECT id, user_id, event_id, ticket_id FROM registrations WHERE user_id <> ? LIMIT 1").get(member.id) || null
  : null;
const myPast = member
  ? db.prepare("SELECT id, ticket_id FROM registrations WHERE user_id=? AND registration_status='confirmed' AND ticket_id IS NOT NULL LIMIT 1").get(member.id) || null
  : null;
const first = (sql) => db.prepare(sql).get()?.id ?? "";

console.log(JSON.stringify({
  openEvent,
  closedEvent,
  banner,
  cert,
  foreignReg,
  myPast,
  ids: {
    event: first("SELECT id FROM events ORDER BY date DESC LIMIT 1"),
    registration: first("SELECT id FROM registrations LIMIT 1"),
    society: first("SELECT id FROM societies LIMIT 1"),
    execom: first("SELECT id FROM execom LIMIT 1"),
  },
}));

db.close();
