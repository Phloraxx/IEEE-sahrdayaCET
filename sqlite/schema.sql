-- =============================================================================
-- IEEE Sahrdaya — SQLite 3.35+ schema
-- =============================================================================
--
-- Translation of the staging PocketBase collections (26 app collections, 419
-- fields) into 27 tables. Derived from the live `data.db` `_collections` table,
-- not from `pb_migrations/` — the database is the state, the migrations are the
-- history.
--
-- See /home/drvij/ieee-port/recon/schema-draft.md for the per-collection
-- translation table and the reasoning behind each decision.
--
-- Conventions
-- -----------
--   * Ids are TEXT holding UUIDs generated app-side with `crypto.randomUUID()`.
--     PocketBase's 15-character ids are remapped during migration
--     (scripts/migrate-pb-to-sqlite.ts).
--   * Timestamps are TEXT ISO-8601 UTC with milliseconds
--     (`2026-11-16T18:09:51.123Z`). Every writer produces that exact shape —
--     `strftime('%Y-%m-%dT%H:%M:%fZ')` here, `Date.toISOString()` in the app —
--     so lexical comparison is chronological and `ORDER BY` works.
--   * Booleans are INTEGER 0/1 with a CHECK. SQLite has no boolean type; the db
--     layer coerces on the way in and compares `=== 1` on the way out.
--   * `select` fields are TEXT with a CHECK listing the allowed values, so an
--     invalid enum is a database error rather than a silent string.
--   * `json` fields are TEXT holding JSON, guarded by `json_valid()`. None of
--     them is queried in a WHERE clause, so none is normalised.
--   * `file` fields hold the stored filename only. Bytes live in the uploads
--     volume and are served by a role-checked route.
--   * Every table has `created_at` / `updated_at` and an `AFTER UPDATE` trigger
--     that rewrites `updated_at`. `recursive_triggers` is OFF by default, so the
--     trigger's own UPDATE does not re-fire it.
--
-- Idempotency contract
-- --------------------
-- Every statement is safe to re-run: `CREATE TABLE IF NOT EXISTS`,
-- `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.
-- `src/lib/db-migrate.server.ts` applies the whole file inside one transaction
-- and bumps `PRAGMA user_version`, so a failure leaves no partial schema.
--
-- What is deliberately absent
-- ---------------------------
--   * `users.password` / `users.tokenKey` — auth is Google OAuth; there are no
--     local passwords to store.
--   * `users.emailVisibility` — folded into `email_verified`.
--   * `fifa_raffle_draws` — dropped by decision (0 rows, one-off event).
--   * `_externalAuths` / `_authOrigins` / `_mfas` / `_otps` — PocketBase
--     internals; the only value they carry (`providerId`) is migrated into
--     `users.google_sub`.
--
-- Changing a column
-- -----------------
-- This file creates tables; it cannot ALTER one that already exists. A change
-- to a column's type, nullability or CHECK (schema version 2 made
-- `certificates.registration_id` nullable and added `volunteer_id`) is carried
-- by a forward step in `src/lib/db-migrate.server.ts`, which rebuilds the table
-- inside one transaction. The existing database is upgraded in place — it is not
-- rebuilt and no data is lost. See `docs/sqlite-migrations.md`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
	id             TEXT PRIMARY KEY,
	email          TEXT NOT NULL,
	email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
	name           TEXT,
	display_name   TEXT,
	avatar         TEXT,
	role           TEXT NOT NULL DEFAULT 'user'
	               CHECK (role IN ('admin', 'chair', 'user', 'content')),
	-- Google OAuth subject. NULL means "directory-only record": the user exists
	-- (execom, society chairs) but cannot sign in.
	google_sub     TEXT,
	last_login_at  TEXT,
	created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

-- PocketBase treats email as unique case-insensitively; so does Google.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq
	ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Opaque session tokens. The cookie carries the token; the row stores only its
-- sha256, so a database leak does not hand out live sessions.
CREATE TABLE IF NOT EXISTS sessions (
	id           TEXT PRIMARY KEY,
	token_hash   TEXT NOT NULL UNIQUE,
	user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	expires_at   TEXT NOT NULL,
	last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	user_agent   TEXT,
	ip_hash      TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Directory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS societies (
	id                    TEXT PRIMARY KEY,
	name                  TEXT NOT NULL,
	slug                  TEXT NOT NULL,
	bio                   TEXT,
	logo                  TEXT,
	banner                TEXT,
	is_hidden             INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
	default_whatsapp_link TEXT,
	created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS societies_slug_uq ON societies (slug);

-- `societies.chairs` is a relation with maxSelect 10.
CREATE TABLE IF NOT EXISTS society_chairs (
	society_id TEXT NOT NULL REFERENCES societies (id) ON DELETE CASCADE,
	user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (society_id, user_id)
);

CREATE INDEX IF NOT EXISTS society_chairs_user_idx ON society_chairs (user_id);

CREATE TABLE IF NOT EXISTS execom (
	id           TEXT PRIMARY KEY,
	name         TEXT NOT NULL,
	position     TEXT NOT NULL,
	society_id   TEXT REFERENCES societies (id) ON DELETE SET NULL,
	photo        TEXT,
	section_id   TEXT,
	sort_order   INTEGER,
	batch        TEXT,
	department   TEXT,
	linkedin     TEXT,
	instagram    TEXT,
	section      TEXT,
	email        TEXT,
	phone        TEXT,
	portfolio    TEXT,
	user_id      TEXT REFERENCES users (id) ON DELETE SET NULL,
	term         TEXT,
	role_code    TEXT,
	active_from  TEXT,
	active_until TEXT,
	assignment_id TEXT,
	created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS execom_society_idx ON execom (society_id, sort_order);
CREATE INDEX IF NOT EXISTS execom_user_idx ON execom (user_id);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
	id                              TEXT PRIMARY KEY,
	title                           TEXT NOT NULL,
	slug                            TEXT NOT NULL,
	description                     TEXT,
	date                            TEXT NOT NULL,
	end_date                        TEXT,
	time_tbc                        INTEGER NOT NULL DEFAULT 0 CHECK (time_tbc IN (0, 1)),
	timezone                        TEXT,
	venue                           TEXT,
	location_address                TEXT,
	price                           INTEGER,
	base_fee_paise                  INTEGER NOT NULL DEFAULT 0 CHECK (base_fee_paise >= 0),
	-- Nullable: 9 of 82 staging events have no society despite the PocketBase
	-- field being marked `required`. 8 of those are publicly visible completed
	-- events, so they must survive the migration. The app renders them without a
	-- society rather than inventing one.
	society_id                      TEXT REFERENCES societies (id) ON DELETE RESTRICT,
	banner                          TEXT,
	status                          TEXT CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
	max_capacity                    INTEGER,
	registration_open               INTEGER NOT NULL DEFAULT 0 CHECK (registration_open IN (0, 1)),
	registration_start              TEXT,
	registration_deadline           TEXT,
	registration_mode               TEXT CHECK (registration_mode IN ('internal', 'external', 'closed')),
	check_in_enabled                INTEGER NOT NULL DEFAULT 0 CHECK (check_in_enabled IN (0, 1)),
	contact_email                   TEXT,
	contact_phone                   TEXT,
	tags                            TEXT,
	is_deleted                      INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
	form_template                   TEXT CHECK (form_template IS NULL OR json_valid(form_template)),
	registered_count                INTEGER NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
	checked_in_count                INTEGER NOT NULL DEFAULT 0 CHECK (checked_in_count >= 0),
	collect_ieee_member             INTEGER NOT NULL DEFAULT 0 CHECK (collect_ieee_member IN (0, 1)),
	external_form_url               TEXT,
	external_link                   TEXT,
	whatsapp_link                   TEXT,
	coupons                         TEXT CHECK (coupons IS NULL OR json_valid(coupons)),
	approval_status                 TEXT CHECK (approval_status IN ('draft', 'submitted', 'changes_requested', 'approved')),
	approval_note                   TEXT,
	submitted_by                    TEXT REFERENCES users (id) ON DELETE SET NULL,
	submitted_at                    TEXT,
	approved_by                     TEXT REFERENCES users (id) ON DELETE SET NULL,
	approved_at                     TEXT,
	approval_revision               INTEGER NOT NULL DEFAULT 0 CHECK (approval_revision >= 0),
	finance_approval_status         TEXT CHECK (finance_approval_status IN ('not_required', 'pending', 'changes_requested', 'approved')),
	finance_approval_note           TEXT,
	finance_approved_by             TEXT REFERENCES users (id) ON DELETE SET NULL,
	finance_approved_at             TEXT,
	attendance_mode                 TEXT CHECK (attendance_mode IN ('onsite', 'online', 'hybrid')),
	allow_self_cancellation         INTEGER NOT NULL DEFAULT 0 CHECK (allow_self_cancellation IN (0, 1)),
	self_cancellation_until         TEXT,
	refund_request_until            TEXT,
	refund_policy                   TEXT,
	waitlist_enabled                INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_enabled IN (0, 1)),
	waitlist_offer_minutes          INTEGER NOT NULL DEFAULT 60
	                                CHECK (waitlist_offer_minutes BETWEEN 15 AND 10080),
	waitlist_reserved_count         INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_reserved_count >= 0),
	eligible_semesters              TEXT CHECK (eligible_semesters IS NULL OR json_valid(eligible_semesters)),
	eligible_programmes             TEXT CHECK (eligible_programmes IS NULL OR json_valid(eligible_programmes)),
	ieee_member_discount_percent    INTEGER NOT NULL DEFAULT 0
	                                CHECK (ieee_member_discount_percent BETWEEN 0 AND 100),
	requirements                    TEXT CHECK (requirements IS NULL OR json_valid(requirements)),
	attendee_note                   TEXT,
	attendance_qualification_locked INTEGER NOT NULL DEFAULT 0
	                                CHECK (attendance_qualification_locked IN (0, 1)),
	attendance_qualification_version INTEGER NOT NULL DEFAULT 0,
	attendance_qualification_locked_at TEXT,
	attendance_qualification_locked_by TEXT REFERENCES users (id) ON DELETE SET NULL,
	attendance_qualification_snapshot TEXT
	                                CHECK (attendance_qualification_snapshot IS NULL OR json_valid(attendance_qualification_snapshot)),
	created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS events_slug_uq ON events (slug);
CREATE INDEX IF NOT EXISTS events_status_date_idx ON events (status, date);
CREATE INDEX IF NOT EXISTS events_society_idx ON events (society_id);
CREATE INDEX IF NOT EXISTS events_deleted_idx ON events (is_deleted);

-- Kept separate so join links never enter the public event payload.
CREATE TABLE IF NOT EXISTS event_private_details (
	id                 TEXT PRIMARY KEY,
	event_id           TEXT NOT NULL UNIQUE REFERENCES events (id) ON DELETE CASCADE,
	virtual_join_url   TEXT,
	join_instructions  TEXT,
	whatsapp_group_url TEXT,
	created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE TABLE IF NOT EXISTS event_sessions (
	id                       TEXT PRIMARY KEY,
	event_id                 TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	title                    TEXT NOT NULL,
	starts_at                TEXT NOT NULL,
	ends_at                  TEXT,
	venue                    TEXT,
	sort_order               INTEGER NOT NULL DEFAULT 0,
	attendance_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (attendance_enabled IN (0, 1)),
	check_in_enabled         INTEGER NOT NULL DEFAULT 0 CHECK (check_in_enabled IN (0, 1)),
	required_for_certificate INTEGER NOT NULL DEFAULT 0 CHECK (required_for_certificate IN (0, 1)),
	attendance_weight        INTEGER NOT NULL DEFAULT 0 CHECK (attendance_weight BETWEEN 0 AND 100),
	created_by               TEXT REFERENCES users (id) ON DELETE SET NULL,
	created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS event_sessions_event_idx ON event_sessions (event_id, sort_order);

-- ---------------------------------------------------------------------------
-- Event volunteers
-- ---------------------------------------------------------------------------
-- Volunteers work an event without a registration. Their certificates carry
-- `volunteer_id` instead of `registration_id`; the one-of CHECK on
-- `certificates` keeps every credential attributable to exactly one person.
-- PocketBase modelled this as a relation on the collection, and the rows are
-- carried across so the volunteer credentials already delivered keep verifying.

CREATE TABLE IF NOT EXISTS event_volunteers (
	id         TEXT PRIMARY KEY,
	event_id   TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	email      TEXT,
	role       TEXT,
	sr_no      TEXT,
	active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS event_volunteers_event_idx
	ON event_volunteers (event_id, active);

CREATE TABLE IF NOT EXISTS coupons (
	id               TEXT PRIMARY KEY,
	event_id         TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	society_id       TEXT NOT NULL REFERENCES societies (id) ON DELETE RESTRICT,
	code             TEXT NOT NULL,
	discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
	max_uses         INTEGER NOT NULL DEFAULT 0 CHECK (max_uses >= 0),
	used_count       INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
	expires_at       TEXT,
	is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
	description      TEXT,
	created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_event_code_uq ON coupons (event_id, code);

-- ---------------------------------------------------------------------------
-- Registrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS registrations (
	id                  TEXT PRIMARY KEY,
	user_id             TEXT REFERENCES users (id) ON DELETE SET NULL,
	event_id            TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	user_name           TEXT,
	user_email          TEXT,
	user_phone          TEXT,
	form_responses      TEXT CHECK (form_responses IS NULL OR json_valid(form_responses)),
	payment_status      TEXT CHECK (payment_status IN ('pending', 'paid', 'failed', 'not_required', 'refunded')),
	registration_status TEXT CHECK (registration_status IN ('pending', 'confirmed', 'cancelled')),
	ticket_id           TEXT,
	checked_in          INTEGER NOT NULL DEFAULT 0 CHECK (checked_in IN (0, 1)),
	checked_in_at       TEXT,
	payment_ticket_id   TEXT,
	-- Legacy paise field. Kept for receipt history; the app writes final_fee_paise.
	amount              INTEGER,
	payment_data        TEXT CHECK (payment_data IS NULL OR json_valid(payment_data)),
	registration_date   TEXT,
	coupon_code         TEXT,
	discount_amount     INTEGER,
	registration_source TEXT CHECK (registration_source IN ('self_service', 'admin')),
	internal_notes      TEXT,
	created_by          TEXT REFERENCES users (id) ON DELETE SET NULL,
	base_fee_paise      INTEGER NOT NULL DEFAULT 0 CHECK (base_fee_paise >= 0),
	discount_paise      INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
	final_fee_paise     INTEGER NOT NULL DEFAULT 0 CHECK (final_fee_paise >= 0),
	programme_code      TEXT,
	semester            TEXT CHECK (semester IN ('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')),
	ieee_member         INTEGER NOT NULL DEFAULT 0 CHECK (ieee_member IN (0, 1)),
	ieee_member_id      TEXT,
	discount_source     TEXT CHECK (discount_source IN ('none', 'ieee_member', 'coupon')),
	created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_ticket_uq
	ON registrations (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations (event_id);
CREATE INDEX IF NOT EXISTS registrations_user_idx ON registrations (user_id);
CREATE INDEX IF NOT EXISTS registrations_status_idx ON registrations (event_id, registration_status);

-- One active seat per user per event. PocketBase enforced this in hook code
-- inside a transaction; here it is a database invariant, so no code path can
-- bypass it.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_uq
	ON registrations (user_id, event_id)
	WHERE registration_status <> 'cancelled' AND user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments (
	id                  TEXT PRIMARY KEY,
	registration_id     TEXT NOT NULL REFERENCES registrations (id) ON DELETE RESTRICT,
	event_id            TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	provider            TEXT NOT NULL
	                    CHECK (provider IN ('razorpay', 'paygate', 'manual', 'legacy_paygate')),
	provider_order_id   TEXT,
	receipt             TEXT,
	status              TEXT NOT NULL
	                    CHECK (status IN ('created', 'pending', 'authorized', 'captured', 'failed',
	                                      'cancelled', 'refunded', 'partially_refunded', 'manual_review')),
	base_fee_paise      INTEGER NOT NULL DEFAULT 0 CHECK (base_fee_paise >= 0),
	discount_paise      INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
	final_fee_paise     INTEGER NOT NULL DEFAULT 0 CHECK (final_fee_paise >= 0),
	collected_paise     INTEGER NOT NULL DEFAULT 0 CHECK (collected_paise >= 0),
	refunded_paise      INTEGER NOT NULL DEFAULT 0 CHECK (refunded_paise >= 0),
	currency            TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
	captured_payment_id TEXT,
	payment_method      TEXT,
	confirmation_source TEXT NOT NULL
	                    CHECK (confirmation_source IN ('razorpay', 'paygate', 'admin', 'legacy')),
	captured_at         TEXT,
	hold_expires_at     TEXT,
	last_synced_at      TEXT,
	manual_review       INTEGER NOT NULL DEFAULT 0 CHECK (manual_review IN (0, 1)),
	review_reason       TEXT,
	created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS payments_registration_idx ON payments (registration_id);
CREATE INDEX IF NOT EXISTS payments_event_idx ON payments (event_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_uq
	ON payments (provider, provider_order_id) WHERE provider_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_attempts (
	id                  TEXT PRIMARY KEY,
	payment_id          TEXT NOT NULL REFERENCES payments (id) ON DELETE CASCADE,
	provider_payment_id TEXT NOT NULL,
	status              TEXT NOT NULL
	                    CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
	amount_paise        INTEGER NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
	method              TEXT,
	error_code          TEXT,
	error_description   TEXT,
	provider_created_at TEXT,
	captured_at         TEXT,
	created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS payment_attempts_payment_idx ON payment_attempts (payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_uq
	ON payment_attempts (provider_payment_id);

CREATE TABLE IF NOT EXISTS payment_refunds (
	id                TEXT PRIMARY KEY,
	payment_id        TEXT NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
	provider_refund_id TEXT,
	idempotency_key   TEXT NOT NULL,
	amount_paise      INTEGER NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
	status            TEXT NOT NULL
	                  CHECK (status IN ('queued', 'submitted', 'processed', 'failed', 'cancelled')),
	reason            TEXT,
	source            TEXT NOT NULL
	                  CHECK (source IN ('event_cancel', 'admin', 'late_capture', 'dispute', 'reconciliation')),
	requested_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
	requested_at      TEXT,
	processed_at      TEXT,
	failed_at         TEXT,
	attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	last_attempt_at   TEXT,
	failure_reason    TEXT,
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx ON payment_refunds (payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_idem_uq
	ON payment_refunds (idempotency_key);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
	id                  TEXT PRIMARY KEY,
	event_id            TEXT NOT NULL,
	event_type          TEXT NOT NULL,
	entity_type         TEXT,
	entity_id           TEXT,
	payload_hash        TEXT NOT NULL,
	status              TEXT NOT NULL
	                    CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'ignored')),
	attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	last_error          TEXT,
	provider_created_at TEXT,
	processed_at        TEXT,
	received_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

-- Webhook replay must be idempotent at the database level, not just in code.
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_uq
	ON payment_webhook_events (event_id);
CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
	ON payment_webhook_events (status);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

-- Append-only: corrections are new rows, never mutations.
CREATE TABLE IF NOT EXISTS attendance_records (
	id              TEXT PRIMARY KEY,
	event_id        TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	session_id      TEXT NOT NULL REFERENCES event_sessions (id) ON DELETE RESTRICT,
	registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE RESTRICT,
	type            TEXT NOT NULL
	                CHECK (type IN ('present', 'entry', 'exit', 'manual_add', 'manual_remove')),
	occurred_at     TEXT NOT NULL,
	operator_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
	source          TEXT NOT NULL CHECK (source IN ('scanner', 'manual', 'system')),
	device_id       TEXT,
	idempotency_key TEXT,
	note            TEXT,
	created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_idem_uq
	ON attendance_records (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_registration_idx
	ON attendance_records (registration_id, occurred_at);
CREATE INDEX IF NOT EXISTS attendance_session_idx
	ON attendance_records (session_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS attendance_records_no_update
BEFORE UPDATE ON attendance_records
BEGIN
	SELECT RAISE(ABORT, 'attendance_records is append-only');
END;

CREATE TRIGGER IF NOT EXISTS attendance_records_no_delete
BEFORE DELETE ON attendance_records
BEGIN
	SELECT RAISE(ABORT, 'attendance_records is append-only');
END;

CREATE TABLE IF NOT EXISTS event_waitlist (
	id                    TEXT PRIMARY KEY,
	event_id              TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	status                TEXT NOT NULL
	                      CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired', 'cancelled')),
	active_key            TEXT,
	joined_at             TEXT NOT NULL,
	offered_at            TEXT,
	offer_expires_at      TEXT,
	accepted_registration TEXT REFERENCES registrations (id) ON DELETE SET NULL,
	programme_code        TEXT,
	semester              TEXT CHECK (semester IN ('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')),
	created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS event_waitlist_active_uq
	ON event_waitlist (event_id, user_id)
	WHERE status IN ('waiting', 'offered', 'accepted');
CREATE INDEX IF NOT EXISTS event_waitlist_event_idx ON event_waitlist (event_id, status);

CREATE TABLE IF NOT EXISTS registration_cancellation_requests (
	id              TEXT PRIMARY KEY,
	registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
	event_id        TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	kind            TEXT NOT NULL CHECK (kind IN ('refund')),
	active_key      TEXT,
	status          TEXT NOT NULL
	                CHECK (status IN ('open', 'accepted', 'resolved', 'declined', 'withdrawn')),
	reason          TEXT,
	requested_at    TEXT NOT NULL,
	decision_at     TEXT,
	decision_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
	resolution_note TEXT,
	resolved_at     TEXT,
	created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_active_uq
	ON registration_cancellation_requests (registration_id)
	WHERE status IN ('open', 'accepted');
CREATE INDEX IF NOT EXISTS cancellation_event_idx
	ON registration_cancellation_requests (event_id, status);

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS certificate_templates (
	id                TEXT PRIMARY KEY,
	name              TEXT NOT NULL,
	scope_type        TEXT NOT NULL CHECK (scope_type IN ('branch', 'society', 'event')),
	society_id        TEXT REFERENCES societies (id) ON DELETE CASCADE,
	event_id          TEXT REFERENCES events (id) ON DELETE CASCADE,
	certificate_type  TEXT NOT NULL
	                  CHECK (certificate_type IN ('participation', 'completion', 'achievement',
	                                              'appreciation', 'volunteer', 'speaker')),
	version           INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
	status            TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
	source_background TEXT,
	source_signatures TEXT,
	render_base       TEXT,
	canvas_width      INTEGER CHECK (canvas_width IS NULL OR canvas_width >= 1),
	canvas_height     INTEGER CHECK (canvas_height IS NULL OR canvas_height >= 1),
	layout            TEXT CHECK (layout IS NULL OR json_valid(layout)),
	email_subject     TEXT,
	email_html        TEXT,
	email_text        TEXT,
	created_by        TEXT REFERENCES users (id) ON DELETE SET NULL,
	published_by      TEXT REFERENCES users (id) ON DELETE SET NULL,
	published_at      TEXT,
	content_hash      TEXT,
	created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	CHECK (
		(scope_type = 'branch'  AND society_id IS NULL AND event_id IS NULL) OR
		(scope_type = 'society' AND society_id IS NOT NULL AND event_id IS NULL) OR
		(scope_type = 'event'   AND event_id IS NOT NULL)
	)
);

CREATE INDEX IF NOT EXISTS certificate_templates_scope_idx
	ON certificate_templates (scope_type, society_id, event_id);
-- One published version per (scope, type).
CREATE UNIQUE INDEX IF NOT EXISTS certificate_templates_published_uq
	ON certificate_templates (scope_type, ifnull(society_id, ''), ifnull(event_id, ''), certificate_type)
	WHERE status = 'published';

CREATE TABLE IF NOT EXISTS certificate_batches (
	id                    TEXT PRIMARY KEY,
	event_id              TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	template_id           TEXT NOT NULL REFERENCES certificate_templates (id) ON DELETE RESTRICT,
	audience_type         TEXT NOT NULL
	                      CHECK (audience_type IN ('selected', 'checked_in', 'attendance_qualified', 'confirmed')),
	audience_config       TEXT CHECK (audience_config IS NULL OR json_valid(audience_config)),
	audience_fingerprint  TEXT,
	status                TEXT NOT NULL
	                      CHECK (status IN ('draft', 'issued', 'sending', 'sent', 'partial_failure',
	                                        'cancelled_before_issue')),
	recipient_count       INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
	issued_count          INTEGER NOT NULL DEFAULT 0 CHECK (issued_count >= 0),
	email_eligible_count  INTEGER NOT NULL DEFAULT 0 CHECK (email_eligible_count >= 0),
	queued_count          INTEGER NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
	sent_count            INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
	failed_count          INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
	missing_email_count   INTEGER NOT NULL DEFAULT 0 CHECK (missing_email_count >= 0),
	created_by            TEXT REFERENCES users (id) ON DELETE SET NULL,
	issued_by             TEXT REFERENCES users (id) ON DELETE SET NULL,
	issued_at             TEXT,
	send_started_at       TEXT,
	completed_at          TEXT,
	note                  TEXT,
	idempotency_key       TEXT,
	audience_snapshot     TEXT CHECK (audience_snapshot IS NULL OR json_valid(audience_snapshot)),
	created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS certificate_batches_event_idx
	ON certificate_batches (event_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_batches_idem_uq
	ON certificate_batches (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS certificates (
	id                      TEXT PRIMARY KEY,
	event_id                TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	-- Exactly one of registration_id / volunteer_id is set. Volunteers receive
	-- credentials without registering (certificate_type = 'volunteer'), and the
	-- legacy PocketBase rows already carry that shape.
	registration_id         TEXT REFERENCES registrations (id) ON DELETE RESTRICT,
	volunteer_id            TEXT REFERENCES event_volunteers (id) ON DELETE RESTRICT,
	batch_id                TEXT NOT NULL REFERENCES certificate_batches (id) ON DELETE RESTRICT,
	template_id             TEXT NOT NULL REFERENCES certificate_templates (id) ON DELETE RESTRICT,
	certificate_type        TEXT NOT NULL
	                        CHECK (certificate_type IN ('participation', 'completion', 'achievement',
	                                                    'appreciation', 'volunteer', 'speaker')),
	credential_id           TEXT NOT NULL,
	verification_token      TEXT NOT NULL,
	recipient_name_snapshot  TEXT NOT NULL,
	recipient_email_snapshot TEXT,
	event_title_snapshot    TEXT NOT NULL,
	issuer_name_snapshot    TEXT,
	issued_at               TEXT NOT NULL,
	status                  TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'superseded')),
	revoked_at              TEXT,
	revoked_by              TEXT REFERENCES users (id) ON DELETE SET NULL,
	revocation_reason       TEXT,
	metadata_version        INTEGER NOT NULL DEFAULT 1 CHECK (metadata_version >= 1),
	supersedes              TEXT REFERENCES certificates (id) ON DELETE SET NULL,
	superseded_by           TEXT REFERENCES certificates (id) ON DELETE SET NULL,
	created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	CHECK (registration_id IS NOT NULL OR volunteer_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS certificates_credential_uq ON certificates (credential_id);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_token_uq ON certificates (verification_token);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_reg_batch_uq
	ON certificates (registration_id, batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_volunteer_batch_uq
	ON certificates (volunteer_id, batch_id) WHERE volunteer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificates_event_idx ON certificates (event_id, status);

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_assignments (
	id            TEXT PRIMARY KEY,
	user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	role_code     TEXT NOT NULL,
	title         TEXT,
	scope_type    TEXT NOT NULL CHECK (scope_type IN ('branch', 'society', 'event')),
	society_id    TEXT REFERENCES societies (id) ON DELETE CASCADE,
	event_id      TEXT REFERENCES events (id) ON DELETE CASCADE,
	term          TEXT,
	starts_at     TEXT,
	ends_at       TEXT,
	active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	source        TEXT CHECK (source IN ('manual', 'execom', 'legacy')),
	created_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
	notes         TEXT,
	source_execom TEXT REFERENCES execom (id) ON DELETE SET NULL,
	created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	CHECK (
		(scope_type = 'branch'  AND society_id IS NULL AND event_id IS NULL) OR
		(scope_type = 'society' AND society_id IS NOT NULL AND event_id IS NULL) OR
		(scope_type = 'event'   AND event_id IS NOT NULL)
	)
);

CREATE INDEX IF NOT EXISTS oa_user_idx ON organization_assignments (user_id, active);
CREATE INDEX IF NOT EXISTS oa_scope_idx
	ON organization_assignments (scope_type, society_id, event_id);

-- ---------------------------------------------------------------------------
-- Content and operations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blogs (
	id           TEXT PRIMARY KEY,
	title        TEXT NOT NULL,
	slug         TEXT NOT NULL,
	excerpt      TEXT,
	content      TEXT,
	cover_url    TEXT,
	read_minutes INTEGER,
	topic_label  TEXT,
	published_at TEXT,
	published    INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
	category     TEXT CHECK (category IN ('IEEE', 'Society', 'Event')),
	society_id   TEXT REFERENCES societies (id) ON DELETE SET NULL,
	event_id     TEXT REFERENCES events (id) ON DELETE SET NULL,
	created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS blogs_slug_uq ON blogs (slug);
CREATE INDEX IF NOT EXISTS blogs_published_idx ON blogs (published, published_at);

-- `blogs.relation` is a relation with maxSelect 0 (unlimited).
CREATE TABLE IF NOT EXISTS blog_authors (
	blog_id TEXT NOT NULL REFERENCES blogs (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	PRIMARY KEY (blog_id, user_id)
);

CREATE INDEX IF NOT EXISTS blog_authors_user_idx ON blog_authors (user_id);

CREATE TABLE IF NOT EXISTS notification_outbox (
	id                 TEXT PRIMARY KEY,
	-- Null for certificate emails: a volunteer certificate has no registration.
	registration_id    TEXT REFERENCES registrations (id) ON DELETE CASCADE,
	kind               TEXT NOT NULL CHECK (kind IN ('ticket', 'receipt', 'certificate')),
	-- `stubbed` records a delivery the safety policy would have made but did not
	-- send. It is distinct from `sent` (really delivered) and `failed` (a real
	-- error), so a non-production environment can exercise the whole pipeline
	-- without ever emailing a student.
	status             TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'stubbed', 'failed')),
	recipient          TEXT NOT NULL,
	dedupe_key         TEXT NOT NULL,
	attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	next_attempt_at    TEXT,
	last_attempt_at    TEXT,
	sent_at            TEXT,
	last_error         TEXT,
	certificate_id     TEXT REFERENCES certificates (id) ON DELETE SET NULL,
	certificate_batch_id TEXT REFERENCES certificate_batches (id) ON DELETE SET NULL,
	created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_uq
	ON notification_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS notification_outbox_status_idx
	ON notification_outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
	id           TEXT PRIMARY KEY,
	event_id     TEXT REFERENCES events (id) ON DELETE SET NULL,
	registration_id TEXT REFERENCES registrations (id) ON DELETE SET NULL,
	actor_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
	action       TEXT NOT NULL,
	note         TEXT,
	before       TEXT CHECK (before IS NULL OR json_valid(before)),
	after        TEXT CHECK (after IS NULL OR json_valid(after)),
	entity_type  TEXT,
	entity_id    TEXT,
	outcome      TEXT CHECK (outcome IN ('success', 'failure')),
	request_id   TEXT,
	created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

CREATE INDEX IF NOT EXISTS audit_created_idx ON admin_audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON admin_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON admin_audit_log (actor_id);

CREATE TABLE IF NOT EXISTS community_profiles (
	id                     TEXT PRIMARY KEY,
	user_id                TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
	account_type           TEXT CHECK (account_type IN ('student', 'faculty', 'alumni', 'external')),
	sr_number              TEXT,
	department             TEXT,
	semester               TEXT,
	graduation_year        TEXT,
	ieee_member_id         TEXT,
	ieee_member            INTEGER NOT NULL DEFAULT 0 CHECK (ieee_member IN (0, 1)),
	institutional_verified INTEGER NOT NULL DEFAULT 0 CHECK (institutional_verified IN (0, 1)),
	verified_at            TEXT,
	verified_by            TEXT REFERENCES users (id) ON DELETE SET NULL,
	created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
--
-- One per table. `recursive_triggers` is OFF by default, so the UPDATE inside
-- the trigger body does not re-fire it.

DROP TRIGGER IF EXISTS users_touch;
CREATE TRIGGER users_touch AFTER UPDATE ON users
BEGIN UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS societies_touch;
CREATE TRIGGER societies_touch AFTER UPDATE ON societies
BEGIN UPDATE societies SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS execom_touch;
CREATE TRIGGER execom_touch AFTER UPDATE ON execom
BEGIN UPDATE execom SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS events_touch;
CREATE TRIGGER events_touch AFTER UPDATE ON events
BEGIN UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS event_private_details_touch;
CREATE TRIGGER event_private_details_touch AFTER UPDATE ON event_private_details
BEGIN UPDATE event_private_details SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS event_sessions_touch;
CREATE TRIGGER event_sessions_touch AFTER UPDATE ON event_sessions
BEGIN UPDATE event_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS event_volunteers_touch;
CREATE TRIGGER event_volunteers_touch AFTER UPDATE ON event_volunteers
BEGIN UPDATE event_volunteers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS coupons_touch;
CREATE TRIGGER coupons_touch AFTER UPDATE ON coupons
BEGIN UPDATE coupons SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS registrations_touch;
CREATE TRIGGER registrations_touch AFTER UPDATE ON registrations
BEGIN UPDATE registrations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS payments_touch;
CREATE TRIGGER payments_touch AFTER UPDATE ON payments
BEGIN UPDATE payments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS payment_attempts_touch;
CREATE TRIGGER payment_attempts_touch AFTER UPDATE ON payment_attempts
BEGIN UPDATE payment_attempts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS payment_refunds_touch;
CREATE TRIGGER payment_refunds_touch AFTER UPDATE ON payment_refunds
BEGIN UPDATE payment_refunds SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS payment_webhook_events_touch;
CREATE TRIGGER payment_webhook_events_touch AFTER UPDATE ON payment_webhook_events
BEGIN UPDATE payment_webhook_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS event_waitlist_touch;
CREATE TRIGGER event_waitlist_touch AFTER UPDATE ON event_waitlist
BEGIN UPDATE event_waitlist SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS registration_cancellation_requests_touch;
CREATE TRIGGER registration_cancellation_requests_touch AFTER UPDATE ON registration_cancellation_requests
BEGIN UPDATE registration_cancellation_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS certificate_templates_touch;
CREATE TRIGGER certificate_templates_touch AFTER UPDATE ON certificate_templates
BEGIN UPDATE certificate_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS certificate_batches_touch;
CREATE TRIGGER certificate_batches_touch AFTER UPDATE ON certificate_batches
BEGIN UPDATE certificate_batches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS certificates_touch;
CREATE TRIGGER certificates_touch AFTER UPDATE ON certificates
BEGIN UPDATE certificates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS organization_assignments_touch;
CREATE TRIGGER organization_assignments_touch AFTER UPDATE ON organization_assignments
BEGIN UPDATE organization_assignments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS blogs_touch;
CREATE TRIGGER blogs_touch AFTER UPDATE ON blogs
BEGIN UPDATE blogs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS notification_outbox_touch;
CREATE TRIGGER notification_outbox_touch AFTER UPDATE ON notification_outbox
BEGIN UPDATE notification_outbox SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS community_profiles_touch;
CREATE TRIGGER community_profiles_touch AFTER UPDATE ON community_profiles
BEGIN UPDATE community_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;
