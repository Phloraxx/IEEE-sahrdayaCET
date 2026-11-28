/**
 * Synthetic schema fixtures for the SQLite migration tests.
 *
 * Nothing here reads a real database and nothing is seeded with real data: the
 * rows are invented names and UUID-shaped ids.
 *
 * Why these exist
 * ---------------
 * `sqlite/schema.sql` is the schema this build creates and upgrades *to*. To
 * prove the upgrade, a test needs the shape it upgrades *from* — the shipped v1
 * — and SQLite has no way to ask for "the schema as of version 1". So v1 is
 * written out below from the committed file's history: the identity tables, and
 * the three objects v2 changes (`certificates`, `notification_outbox`,
 * `certificates_reg_batch_uq`).
 *
 * The rest of the tables in {@link V1_SCHEMA} are deliberately thin. They exist
 * so that `sqlite/schema.sql` leaves them alone — which is also what the upgrade
 * test checks: a table the migration does not need to touch must keep its exact
 * `CREATE` text. Keeping them thin makes that assertion fail loudly the moment
 * the migration starts rebuilding something it should not.
 *
 * Both suites import this file: the repository suite builds its "older database"
 * from it, and the migration suite uses it to build v1 and v2 fixtures.
 */

const TIMESTAMP_DEFAULT = "strftime('%Y-%m-%dT%H:%M:%fZ')";

/**
 * A v1 database.
 *
 * Exact where v2 differs; minimal elsewhere. Columns that `sqlite/schema.sql`
 * later indexes are present, so applying the current baseline to this fixture
 * succeeds and the upgrade isolates the objects v2 really changes.
 */
export const V1_SCHEMA = `
-- Identity -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
	id             TEXT PRIMARY KEY,
	email          TEXT NOT NULL,
	email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
	name           TEXT,
	display_name   TEXT,
	avatar         TEXT,
	role           TEXT NOT NULL DEFAULT 'user'
	               CHECK (role IN ('admin', 'chair', 'user', 'content')),
	google_sub     TEXT,
	last_login_at  TEXT,
	created_at     TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	updated_at     TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT})
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq
	ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TABLE IF NOT EXISTS sessions (
	id           TEXT PRIMARY KEY,
	token_hash   TEXT NOT NULL UNIQUE,
	user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at   TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	expires_at   TEXT NOT NULL,
	last_seen_at TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	user_agent   TEXT,
	ip_hash      TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- Directory ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS societies (
	id        TEXT PRIMARY KEY,
	name      TEXT NOT NULL,
	slug      TEXT NOT NULL,
	bio       TEXT,
	logo      TEXT,
	banner    TEXT,
	is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
	default_whatsapp_link TEXT,
	created_at TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	updated_at TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT})
);
CREATE UNIQUE INDEX IF NOT EXISTS societies_slug_uq ON societies (slug);

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
	-- field being marked required. 8 of those are publicly visible completed
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
	waitlist_offer_minutes          INTEGER NOT NULL DEFAULT 60,
	waitlist_reserved_count         INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_reserved_count >= 0),
	eligible_semesters              TEXT CHECK (eligible_semesters IS NULL OR json_valid(eligible_semesters)),
	eligible_programmes             TEXT CHECK (eligible_programmes IS NULL OR json_valid(eligible_programmes)),
	ieee_member_discount_percent    INTEGER NOT NULL DEFAULT 0,
	requirements                    TEXT CHECK (requirements IS NULL OR json_valid(requirements)),
	attendee_note                   TEXT,
	attendance_qualification_locked INTEGER NOT NULL DEFAULT 0,
	attendance_qualification_version INTEGER NOT NULL DEFAULT 0,
	attendance_qualification_locked_at TEXT,
	attendance_qualification_locked_by TEXT REFERENCES users (id) ON DELETE SET NULL,
	attendance_qualification_snapshot TEXT,
	created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);
CREATE UNIQUE INDEX IF NOT EXISTS events_slug_uq ON events (slug);
CREATE INDEX IF NOT EXISTS events_status_date_idx ON events (status, date);
CREATE INDEX IF NOT EXISTS events_society_idx ON events (society_id);
CREATE INDEX IF NOT EXISTS events_deleted_idx ON events (is_deleted);

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
CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_uq
	ON registrations (user_id, event_id)
	WHERE registration_status <> 'cancelled' AND user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS attendance_records (
	id              TEXT PRIMARY KEY,
	event_id        TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
	session_id      TEXT NOT NULL REFERENCES event_sessions (id) ON DELETE CASCADE,
	registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE RESTRICT,
	type            TEXT NOT NULL
	                CHECK (type IN ('present', 'entry', 'exit', 'manual_add', 'manual_remove')),
	occurred_at     TEXT NOT NULL,
	operator_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
	source          TEXT NOT NULL CHECK (source IN ('scanner', 'manual', 'system')),
	device_id       TEXT,
	idempotency_key TEXT,
	note            TEXT,
	created_at      TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT})
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_idem_uq
	ON attendance_records (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendance_registration_idx
	ON attendance_records (registration_id, occurred_at);
CREATE INDEX IF NOT EXISTS attendance_session_idx
	ON attendance_records (session_id, occurred_at);

-- Certificates ---------------------------------------------------------------
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
	updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);
CREATE INDEX IF NOT EXISTS certificate_templates_scope_idx
	ON certificate_templates (scope_type, society_id, event_id);
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

-- v1: a certificate always belonged to a registration. No volunteer_id, and the
-- unique index over (registration_id, batch_id) says so plainly.
CREATE TABLE IF NOT EXISTS certificates (
	id                       TEXT PRIMARY KEY,
	event_id                 TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
	registration_id          TEXT NOT NULL REFERENCES registrations (id) ON DELETE RESTRICT,
	batch_id                 TEXT NOT NULL REFERENCES certificate_batches (id) ON DELETE RESTRICT,
	template_id              TEXT NOT NULL REFERENCES certificate_templates (id) ON DELETE RESTRICT,
	certificate_type         TEXT NOT NULL
	                         CHECK (certificate_type IN ('participation', 'completion', 'achievement',
	                                                     'appreciation', 'volunteer', 'speaker')),
	credential_id            TEXT NOT NULL,
	verification_token       TEXT NOT NULL,
	recipient_name_snapshot  TEXT NOT NULL,
	recipient_email_snapshot TEXT,
	event_title_snapshot     TEXT NOT NULL,
	issuer_name_snapshot     TEXT,
	issued_at                TEXT NOT NULL,
	status                   TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'superseded')),
	revoked_at               TEXT,
	revoked_by               TEXT REFERENCES users (id) ON DELETE SET NULL,
	revocation_reason        TEXT,
	metadata_version         INTEGER NOT NULL DEFAULT 1 CHECK (metadata_version >= 1),
	supersedes               TEXT REFERENCES certificates (id) ON DELETE SET NULL,
	superseded_by            TEXT REFERENCES certificates (id) ON DELETE SET NULL,
	created_at               TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	updated_at               TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT})
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_credential_uq ON certificates (credential_id);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_token_uq ON certificates (verification_token);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_reg_batch_uq
	ON certificates (registration_id, batch_id);
CREATE INDEX IF NOT EXISTS certificates_event_idx ON certificates (event_id, status);

-- v1: an outbox row always came from a registration, and carried no certificate
-- link.
CREATE TABLE IF NOT EXISTS notification_outbox (
	id              TEXT PRIMARY KEY,
	registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
	kind            TEXT NOT NULL CHECK (kind IN ('ticket', 'receipt', 'certificate')),
	status          TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'stubbed', 'failed')),
	recipient       TEXT NOT NULL,
	dedupe_key      TEXT NOT NULL,
	attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	next_attempt_at TEXT,
	last_attempt_at TEXT,
	sent_at         TEXT,
	last_error      TEXT,
	created_at      TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT}),
	updated_at      TEXT NOT NULL DEFAULT (${TIMESTAMP_DEFAULT})
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_uq
	ON notification_outbox (dedupe_key);
CREATE INDEX IF NOT EXISTS notification_outbox_status_idx
	ON notification_outbox (status, next_attempt_at);

-- Every other table in the baseline, reduced to the columns its indexes use.
-- v2 changes none of them; they are here so re-applying sqlite/schema.sql during
-- the upgrade has nothing to create and nothing to complain about.
CREATE TABLE IF NOT EXISTS society_chairs (
	society_id TEXT NOT NULL REFERENCES societies (id) ON DELETE CASCADE,
	user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (society_id, user_id)
);
CREATE INDEX IF NOT EXISTS society_chairs_user_idx ON society_chairs (user_id);

CREATE TABLE IF NOT EXISTS event_private_details (
	id                 TEXT PRIMARY KEY,
	event_id           TEXT NOT NULL UNIQUE REFERENCES events (id) ON DELETE CASCADE,
	virtual_join_url   TEXT,
	join_instructions  TEXT,
	whatsapp_group_url TEXT,
	created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
	updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
);

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
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_uq
	ON payment_webhook_events (event_id);
CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
	ON payment_webhook_events (status);

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
CREATE INDEX IF NOT EXISTS cancellation_event_idx
	ON registration_cancellation_requests (event_id, status);

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
CREATE INDEX IF NOT EXISTS oa_scope_idx
	ON organization_assignments (scope_type, society_id, event_id);

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
CREATE INDEX IF NOT EXISTS blogs_published_idx ON blogs (published, published_at);

CREATE TABLE IF NOT EXISTS blog_authors (
	blog_id TEXT NOT NULL REFERENCES blogs (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	PRIMARY KEY (blog_id, user_id)
);
CREATE INDEX IF NOT EXISTS blog_authors_user_idx ON blog_authors (user_id);

-- Everything below is unchanged by v2. It is here so the upgrade has untouched
-- tables to leave untouched.
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

DROP TRIGGER IF EXISTS users_touch;
CREATE TRIGGER users_touch AFTER UPDATE ON users
BEGIN UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS events_touch;
CREATE TRIGGER events_touch AFTER UPDATE ON events
BEGIN UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;

DROP TRIGGER IF EXISTS certificates_touch;
CREATE TRIGGER certificates_touch AFTER UPDATE ON certificates
BEGIN UPDATE certificates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = NEW.id; END;
`;

/** Rows a v1 database that has been in use would have. Every one must survive. */
export const V1_SEED = `
INSERT INTO users (id, email, role, google_sub) VALUES
	('u-1', 'chair@example.test', 'chair', 'fixture-google-chair'),
	('u-2', 'student@example.test', 'user', 'fixture-google-student');

INSERT INTO societies (id, name, slug) VALUES ('s-1', 'IEEE SBC', 'ieee-sbc');
INSERT INTO events (id, title, slug, date, society_id, status) VALUES
	('e-1', 'Fixture Event', 'fixture-event', '2026-01-01T00:00:00.000Z', 's-1', 'completed');
INSERT INTO event_sessions (id, event_id, title, starts_at) VALUES
	('sess-1', 'e-1', 'Session 1', '2026-01-01T10:00:00.000Z');
INSERT INTO registrations (id, user_id, event_id, registration_status) VALUES
	('r-1', 'u-2', 'e-1', 'confirmed');
INSERT INTO attendance_records (id, event_id, session_id, registration_id, type, occurred_at, source) VALUES
	('a-1', 'e-1', 'sess-1', 'r-1', 'present', '2026-01-01T10:05:00.000Z', 'manual');

INSERT INTO certificate_templates (id, name, scope_type, status, certificate_type) VALUES
	('t-1', 'Participation', 'branch', 'published', 'participation');
INSERT INTO certificate_batches (id, event_id, template_id, audience_type, status) VALUES
	('b-1', 'e-1', 't-1', 'confirmed', 'sent');
INSERT INTO certificates (
	id, event_id, registration_id, batch_id, template_id, certificate_type,
	credential_id, verification_token, recipient_name_snapshot, event_title_snapshot,
	issued_at, status
) VALUES
	('c-1', 'e-1', 'r-1', 'b-1', 't-1', 'participation',
	 'IEEESB-2026-FIXTURE0001', 'fixture-token-000000000000000000000001',
	 'Fixture Student', 'Fixture Event', '2026-01-02T00:00:00.000Z', 'active');

INSERT INTO notification_outbox (id, registration_id, kind, status, recipient, dedupe_key, sent_at) VALUES
	('n-1', 'r-1', 'ticket', 'sent', 'student@example.test', 'ticket:r-1', '2026-01-01T00:00:00.000Z'),
	('n-2', 'r-1', 'receipt', 'pending', 'student@example.test', 'receipt:r-1', NULL);

INSERT INTO admin_audit_log (id, action) VALUES ('log-1', 'event.publish');
INSERT INTO community_profiles (id, user_id) VALUES ('p-1', 'u-2');
`;

/**
 * Rows for a shipped v2 database: {@link V1_SEED} plus the two things only v2
 * can hold — a volunteer and their certificate.
 */
export const V2_SEED = `
INSERT INTO users (id, email, role, google_sub) VALUES
	('u-1', 'chair@example.test', 'chair', 'fixture-google-chair'),
	('u-2', 'student@example.test', 'user', 'fixture-google-student');

INSERT INTO societies (id, name, slug) VALUES ('s-1', 'IEEE SBC', 'ieee-sbc');
INSERT INTO events (id, title, slug, date, society_id, status) VALUES
	('e-1', 'Fixture Event', 'fixture-event', '2026-01-01T00:00:00.000Z', 's-1', 'completed');
INSERT INTO event_sessions (id, event_id, title, starts_at) VALUES
	('sess-1', 'e-1', 'Session 1', '2026-01-01T10:00:00.000Z');
INSERT INTO registrations (id, user_id, event_id, registration_status) VALUES
	('r-1', 'u-2', 'e-1', 'confirmed');
INSERT INTO attendance_records (id, event_id, session_id, registration_id, type, occurred_at, source) VALUES
	('a-1', 'e-1', 'sess-1', 'r-1', 'present', '2026-01-01T10:05:00.000Z', 'manual');

INSERT INTO certificate_templates (id, name, scope_type, certificate_type, status) VALUES
	('t-1', 'Participation', 'branch', 'participation', 'published'),
	('t-vol', 'Volunteer', 'branch', 'volunteer', 'published');
INSERT INTO certificate_batches (id, event_id, template_id, audience_type, status) VALUES
	('b-1', 'e-1', 't-1', 'confirmed', 'sent'),
	('b-vol', 'e-1', 't-vol', 'selected', 'sent');
INSERT INTO event_volunteers (id, event_id, name, email) VALUES
	('v-1', 'e-1', 'Fixture Volunteer', 'volunteer@example.test');
INSERT INTO certificates (
	id, event_id, registration_id, volunteer_id, batch_id, template_id, certificate_type,
	credential_id, verification_token, recipient_name_snapshot, event_title_snapshot,
	issued_at, status
) VALUES
	('c-1', 'e-1', 'r-1', NULL, 'b-1', 't-1', 'participation',
	 'IEEESB-2026-FIXTURE0001', 'fixture-token-000000000000000000000001',
	 'Fixture Student', 'Fixture Event', '2026-01-02T00:00:00.000Z', 'active'),
	('c-vol', 'e-1', NULL, 'v-1', 'b-vol', 't-vol', 'volunteer',
	 'IEEESB-2026-FIXTURE0002', 'fixture-token-000000000000000000000002',
	 'Fixture Volunteer', 'Fixture Event', '2026-01-02T00:00:00.000Z', 'active');

INSERT INTO notification_outbox (id, registration_id, kind, status, recipient, dedupe_key, sent_at, certificate_id) VALUES
	('n-1', 'r-1', 'ticket', 'sent', 'student@example.test', 'ticket:r-1', '2026-01-01T00:00:00.000Z', NULL),
	('n-2', 'r-1', 'receipt', 'pending', 'student@example.test', 'receipt:r-1', NULL, NULL),
	('n-vol', NULL, 'certificate', 'sent', 'volunteer@example.test', 'certificate:c-vol', '2026-01-02T00:00:00.000Z', 'c-vol');

INSERT INTO admin_audit_log (id, action) VALUES ('log-1', 'event.publish');
INSERT INTO community_profiles (id, user_id) VALUES ('p-1', 'u-2');
`;
