/**
 * Mint the short-lived staging audit sessions inside the web container (the
 * database is owned by the container's uid; the host user cannot write it).
 * Writes cookie files under /app/data, which is the host's staging db folder.
 */
const { DatabaseSync } = require("node:sqlite");
const { createHash, randomBytes } = require("node:crypto");
const fs = require("node:fs");

const db = new DatabaseSync("/app/data/portal.db");
const now = new Date();
const nowIso = now.toISOString();
const email = "staging-audit-user@example.invalid";

let user = db.prepare("SELECT id,email FROM users WHERE email=?").get(email);
if (!user) {
  const id = "stgtestuser0000000000000000000001";
  db.prepare("INSERT INTO users (id,email,email_verified,name,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, email, 1, "Staging Audit User", "user", nowIso, nowIso);
  user = db.prepare("SELECT id,email FROM users WHERE email=?").get(email);
}
// A future, free, open event with a real UUID shape: the upload route rejects
// synthetic ids, and the registration route refuses an event that has ended.
const eventId = "a0000000-0000-4000-8000-000000000001";
const eventDate = new Date(Date.now() + 3 * 86400e3).toISOString();
if (!db.prepare("SELECT id FROM events WHERE id=?").get(eventId)) {
  db.prepare(`INSERT INTO events (id,title,slug,description,date,time_tbc,timezone,venue,location_address,price,base_fee_paise,status,max_capacity,registration_open,registration_mode,check_in_enabled,contact_email,contact_phone,tags,is_deleted,form_template,registered_count,checked_in_count,collect_ieee_member,coupons,approval_status,finance_approval_status,attendance_mode,allow_self_cancellation,waitlist_enabled,eligible_semesters,eligible_programmes,requirements,attendee_note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    eventId, "Staging Audit Event", "staging-audit-event", "Temporary event created by the staging audit.",
    eventDate, 0, "Asia/Kolkata", "Audit Hall", "Sahrdaya", 0, 0, "published", 0, 1, "internal", 1,
    "audit@example.invalid", "", "[]", 0, "[]", 0, 0, 0, "[]", "approved", "approved", "onsite", 1, 0,
    "[]", "[]", "[]", "", nowIso, nowIso);
} else {
  db.prepare("UPDATE events SET date=?, status='published', registration_open=1, is_deleted=0, allow_self_cancellation=1, check_in_enabled=1 WHERE id=?").run(eventDate, eventId);
}

const admin = db.prepare("SELECT id,email FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").get();
const chair = db.prepare("SELECT id,email FROM users WHERE role='chair' ORDER BY created_at LIMIT 1").get();

function mint(userId, label) {
  const token = randomBytes(32).toString("base64url");
  const id = `stgtest_${label}_${randomBytes(5).toString("hex")}`;
  db.prepare("INSERT INTO sessions (id,token_hash,user_id,created_at,expires_at,last_seen_at,user_agent,ip_hash) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, createHash("sha256").update(token).digest("hex"), userId, nowIso,
      new Date(now.getTime() + 6 * 3600e3).toISOString(), nowIso, "staging-test-20261122", "");
  return { id, cookie: Buffer.from(JSON.stringify(token)).toString("base64") };
}

const adminS = mint(admin.id, "admin");
const memberS = mint(user.id, "member");
fs.writeFileSync("/app/data/.staging-test-session", JSON.stringify({ admin: admin.email, sessionId: adminS.id, cookie: adminS.cookie }));
fs.writeFileSync("/app/data/.staging-test-member", JSON.stringify({ userId: user.id, email: user.email, sessionId: memberS.id, cookie: memberS.cookie }));
if (chair) {
  const chairS = mint(chair.id, "chair");
  fs.writeFileSync("/app/data/.staging-test-chair", JSON.stringify({ userId: chair.id, email: chair.email, sessionId: chairS.id, cookie: chairS.cookie }));
}
db.close();
console.log("minted admin", admin.email, "member", user.email, chair ? `chair ${chair.email}` : "no chair");
