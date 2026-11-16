/**
 * Migrate a PocketBase `pb_data` directory into the SQLite schema.
 *
 *   tsx scripts/migrate-pb-to-sqlite.ts --source <data.db> [--storage <dir>]
 *                                       [--target <out.db>] [--uploads <dir>]
 *                                       [--id-map <out.json>] [--apply] [--force]
 *
 * Dry-run by default: reads the source, builds the id map, runs every
 * verification assertion, and reports — without writing anything. `--apply`
 * performs the write.
 *
 * Design notes
 * ------------
 * * **Source is read-only.** The PocketBase database is opened with
 *   `fileMustExist` and never written. The staging instance is live.
 * * **Files come from the filesystem, not HTTP.** We have volume access, so
 *   copying `storage/` avoids needing a superuser token at all — which is
 *   better for the "never print credentials" rule and avoids rate limits.
 *   `storage/{collectionId}/{recordId}/{filename}` maps through the same id map
 *   as the rows.
 * * **One transaction.** `PRAGMA defer_foreign_keys = ON` handles the
 *   execom↔organization_assignments and certificates self-reference cycles;
 *   `PRAGMA foreign_key_check` runs before COMMIT.
 * * **Ids are remapped to UUIDs** and the map is written to JSON so a re-run or
 *   an audit can resolve old ids.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Args {
	source: string;
	storage: string | null;
	target: string;
	uploads: string | null;
	idMapPath: string | null;
	apply: boolean;
	force: boolean;
}

function parseArgs(argv: string[]): Args {
	const get = (flag: string): string | undefined => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const has = (flag: string): boolean => argv.includes(flag);

	const source = get("--source");
	if (!source) {
		throw new Error("--source <path to data.db> is required");
	}
	return {
		source: resolve(source),
		storage: get("--storage") ? resolve(get("--storage") as string) : null,
		target: resolve(get("--target") ?? "./data/portal.db"),
		uploads: get("--uploads") ? resolve(get("--uploads") as string) : null,
		idMapPath: get("--id-map") ? resolve(get("--id-map") as string) : null,
		apply: has("--apply"),
		force: has("--force"),
	};
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

/**
 * PocketBase stores dates as `2026-06-09 08:06:11.111Z` (space separator).
 * The schema expects ISO-8601 with `T`, so lexical order stays chronological.
 */
function isoDate(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	// `2026-06-09 08:06:11.111Z` -> `2026-06-09T08:06:11.111Z`
	const normalised = raw.includes(" ") && /^\d{4}-\d{2}-\d{2} /.test(raw)
		? raw.replace(" ", "T")
		: raw;
	const time = Date.parse(normalised);
	return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** PocketBase booleans are already 0/1 integers, but accept real booleans too. */
function boolInt(value: unknown): number {
	if (value === true || value === 1 || value === "1" || value === "true") return 1;
	return 0;
}

/** Empty string means "unset" in PocketBase. */
function nullable(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value);
	return raw === "" ? null : raw;
}

function requireString(value: unknown, fallback = ""): string {
	if (value === null || value === undefined) return fallback;
	return String(value);
}

/** A multi-relation is stored as a JSON array string. */
function idArray(value: unknown): string[] {
	if (value === null || value === undefined || value === "") return [];
	const raw = String(value);
	if (raw.startsWith("[")) {
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
		} catch {
			return [];
		}
	}
	return [raw];
}

// ---------------------------------------------------------------------------
// Id map
// ---------------------------------------------------------------------------

type IdMap = Map<string, Map<string, string>>;

function buildIdMap(
	source: Database.Database,
	collections: { pb: string; table: string }[],
): IdMap {
	const map: IdMap = new Map();
	for (const spec of collections) {
		const rows = source.prepare(sqlForCollection(spec.pb).selectIds).all() as { id: string }[];
		const inner = new Map<string, string>();
		for (const row of rows) inner.set(String(row.id), randomUUID());
		map.set(spec.pb, inner);
	}
	return map;
}

function remap(map: IdMap, collection: string, pbId: unknown): string | null {
	if (pbId === null || pbId === undefined) return null;
	const raw = String(pbId);
	if (!raw) return null;
	const found = map.get(collection)?.get(raw);
	if (!found) {
		throw new Error(`Unmapped id ${raw} in collection ${collection}`);
	}
	return found;
}

// ---------------------------------------------------------------------------
// Collection specs
// ---------------------------------------------------------------------------

interface Spec {
	/** PocketBase collection name — also the table name in data.db. */
	pb: string;
	/** Target table. */
	table: string;
	/** Target columns, in insert order. */
	columns: string[];
	/**
	 * Columns whose name matches a relation but which hold an external id.
	 * `payment_webhook_events.event_id` is the *provider's* webhook event id,
	 * not a row in `events`.
	 */
	externalIdColumns?: string[];
}

/**
 * Insert order respects foreign keys. Cycles are handled by
 * `PRAGMA defer_foreign_keys = ON` rather than by reordering.
 */
const SPECS: Spec[] = [
	{ pb: "users", table: "users", columns: ["id", "email", "email_verified", "name", "display_name", "avatar", "role", "google_sub", "last_login_at", "created_at", "updated_at"] },
	{ pb: "societies", table: "societies", columns: ["id", "name", "slug", "bio", "logo", "banner", "is_hidden", "default_whatsapp_link", "created_at", "updated_at"] },
	{ pb: "execom", table: "execom", columns: ["id", "name", "position", "society_id", "photo", "section_id", "sort_order", "batch", "department", "linkedin", "instagram", "section", "email", "phone", "portfolio", "user_id", "term", "role_code", "active_from", "active_until", "assignment_id", "created_at", "updated_at"] },
	{ pb: "events", table: "events", columns: ["id", "title", "slug", "description", "date", "end_date", "time_tbc", "timezone", "venue", "location_address", "price", "base_fee_paise", "society_id", "banner", "status", "max_capacity", "registration_open", "registration_start", "registration_deadline", "registration_mode", "check_in_enabled", "contact_email", "contact_phone", "tags", "is_deleted", "form_template", "registered_count", "checked_in_count", "collect_ieee_member", "external_form_url", "external_link", "whatsapp_link", "coupons", "approval_status", "approval_note", "submitted_by", "submitted_at", "approved_by", "approved_at", "approval_revision", "finance_approval_status", "finance_approval_note", "finance_approved_by", "finance_approved_at", "attendance_mode", "allow_self_cancellation", "self_cancellation_until", "refund_request_until", "refund_policy", "waitlist_enabled", "waitlist_offer_minutes", "waitlist_reserved_count", "eligible_semesters", "eligible_programmes", "ieee_member_discount_percent", "requirements", "attendee_note", "attendance_qualification_locked", "attendance_qualification_version", "attendance_qualification_locked_at", "attendance_qualification_locked_by", "attendance_qualification_snapshot", "created_at", "updated_at"] },
	{ pb: "event_private_details", table: "event_private_details", columns: ["id", "event_id", "virtual_join_url", "join_instructions", "whatsapp_group_url", "created_at", "updated_at"] },
	{ pb: "event_sessions", table: "event_sessions", columns: ["id", "event_id", "title", "starts_at", "ends_at", "venue", "sort_order", "attendance_enabled", "check_in_enabled", "required_for_certificate", "attendance_weight", "created_by", "created_at", "updated_at"] },
	{ pb: "coupons", table: "coupons", columns: ["id", "event_id", "society_id", "code", "discount_percent", "max_uses", "used_count", "expires_at", "is_active", "description", "created_at", "updated_at"] },
	{ pb: "registrations", table: "registrations", columns: ["id", "user_id", "event_id", "user_name", "user_email", "user_phone", "form_responses", "payment_status", "registration_status", "ticket_id", "checked_in", "checked_in_at", "payment_ticket_id", "amount", "payment_data", "registration_date", "coupon_code", "discount_amount", "registration_source", "internal_notes", "created_by", "base_fee_paise", "discount_paise", "final_fee_paise", "programme_code", "semester", "ieee_member", "ieee_member_id", "discount_source", "created_at", "updated_at"] },
	{ pb: "payments", table: "payments", columns: ["id", "registration_id", "event_id", "provider", "provider_order_id", "receipt", "status", "base_fee_paise", "discount_paise", "final_fee_paise", "collected_paise", "refunded_paise", "currency", "captured_payment_id", "payment_method", "confirmation_source", "captured_at", "hold_expires_at", "last_synced_at", "manual_review", "review_reason", "created_at", "updated_at"] },
	{ pb: "payment_attempts", table: "payment_attempts", columns: ["id", "payment_id", "provider_payment_id", "status", "amount_paise", "method", "error_code", "error_description", "provider_created_at", "captured_at", "created_at", "updated_at"] },
	{ pb: "payment_refunds", table: "payment_refunds", columns: ["id", "payment_id", "provider_refund_id", "idempotency_key", "amount_paise", "status", "reason", "source", "requested_by", "requested_at", "processed_at", "failed_at", "attempts", "last_attempt_at", "failure_reason", "created_at", "updated_at"] },
	{ pb: "payment_webhook_events", table: "payment_webhook_events", externalIdColumns: ["event_id"], columns: ["id", "event_id", "event_type", "entity_type", "entity_id", "payload_hash", "status", "attempts", "last_error", "provider_created_at", "processed_at", "received_at", "updated_at"] },
	{ pb: "attendance_records", table: "attendance_records", columns: ["id", "event_id", "session_id", "registration_id", "type", "occurred_at", "operator_id", "source", "device_id", "idempotency_key", "note", "created_at"] },
	{ pb: "event_waitlist", table: "event_waitlist", columns: ["id", "event_id", "user_id", "status", "active_key", "joined_at", "offered_at", "offer_expires_at", "accepted_registration", "programme_code", "semester", "created_at", "updated_at"] },
	{ pb: "registration_cancellation_requests", table: "registration_cancellation_requests", columns: ["id", "registration_id", "event_id", "user_id", "kind", "active_key", "status", "reason", "requested_at", "decision_at", "decision_by", "resolution_note", "resolved_at", "created_at", "updated_at"] },
	{ pb: "certificate_templates", table: "certificate_templates", columns: ["id", "name", "scope_type", "society_id", "event_id", "certificate_type", "version", "status", "source_background", "source_signatures", "render_base", "canvas_width", "canvas_height", "layout", "email_subject", "email_html", "email_text", "created_by", "published_by", "published_at", "content_hash", "created_at", "updated_at"] },
	{ pb: "certificate_batches", table: "certificate_batches", columns: ["id", "event_id", "template_id", "audience_type", "audience_config", "audience_fingerprint", "status", "recipient_count", "issued_count", "email_eligible_count", "queued_count", "sent_count", "failed_count", "missing_email_count", "created_by", "issued_by", "issued_at", "send_started_at", "completed_at", "note", "idempotency_key", "audience_snapshot", "created_at", "updated_at"] },
	{ pb: "certificates", table: "certificates", columns: ["id", "event_id", "registration_id", "batch_id", "template_id", "certificate_type", "credential_id", "verification_token", "recipient_name_snapshot", "recipient_email_snapshot", "event_title_snapshot", "issuer_name_snapshot", "issued_at", "status", "revoked_at", "revoked_by", "revocation_reason", "metadata_version", "supersedes", "superseded_by", "created_at", "updated_at"] },
	{ pb: "organization_assignments", table: "organization_assignments", columns: ["id", "user_id", "role_code", "title", "scope_type", "society_id", "event_id", "term", "starts_at", "ends_at", "active", "source", "created_by", "notes", "source_execom", "created_at", "updated_at"] },
	{ pb: "blogs", table: "blogs", columns: ["id", "title", "slug", "excerpt", "content", "cover_url", "read_minutes", "topic_label", "published_at", "published", "category", "society_id", "event_id", "created_at", "updated_at"] },
	{ pb: "notification_outbox", table: "notification_outbox", columns: ["id", "registration_id", "kind", "status", "recipient", "dedupe_key", "attempts", "next_attempt_at", "last_attempt_at", "sent_at", "last_error", "certificate_id", "certificate_batch_id", "created_at", "updated_at"] },
	{ pb: "admin_audit_log", table: "admin_audit_log", columns: ["id", "event_id", "registration_id", "actor_id", "action", "note", "before", "after", "entity_type", "entity_id", "outcome", "request_id", "created_at"] },
	{ pb: "community_profiles", table: "community_profiles", columns: ["id", "user_id", "account_type", "sr_number", "department", "semester", "graduation_year", "ieee_member_id", "ieee_member", "institutional_verified", "verified_at", "verified_by", "created_at", "updated_at"] },
];

// ---------------------------------------------------------------------------
// Identifier allowlist
// ---------------------------------------------------------------------------
//
// Table and column names cannot be bound as parameters, so they are
// interpolated. Every interpolation goes through these guards, which reject
// anything not declared in SPECS — so the only strings that can reach SQL are
// the literals in this file, not data from the source database.

const KNOWN_COLLECTIONS = new Set(SPECS.map((spec) => spec.pb));
const KNOWN_TABLES = new Set(SPECS.map((spec) => spec.table));
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Quote a PocketBase collection name, refusing anything not in SPECS. */
function pbTable(name: string): string {
	if (!KNOWN_COLLECTIONS.has(name)) {
		throw new Error(`refusing to interpolate unknown collection: ${name}`);
	}
	return `"${name}"`;
}

/** Quote a target table name, refusing anything not in SPECS. */
function targetTable(name: string): string {
	if (!KNOWN_TABLES.has(name)) {
		throw new Error(`refusing to interpolate unknown table: ${name}`);
	}
	return `"${name}"`;
}

/** Quote a column list, validating each identifier. */
function quotedColumns(columns: readonly string[]): string {
	return columns
		.map((column) => {
			if (!IDENTIFIER.test(column)) throw new Error(`invalid column name: ${column}`);
			return `"${column}"`;
		})
		.join(", ");
}

/**
 * Every statement the migration runs, built once from SPECS.
 *
 * Building them here means no DB call site ever interpolates: the statements
 * are frozen strings produced from module-level literals, and the accessors
 * below reject any name that is not in SPECS. Nothing read from the source
 * database can reach SQL text.
 */
interface SpecSql {
	selectIds: string;
	selectAll: string;
	count: string;
	insert: string;
}

const SQL_BY_COLLECTION = new Map<string, SpecSql>(
	SPECS.map((spec) => [
		spec.pb,
		{
			selectIds: `SELECT id FROM ${pbTable(spec.pb)}`,
			selectAll: `SELECT * FROM ${pbTable(spec.pb)}`,
			count: `SELECT count(*) AS n FROM ${pbTable(spec.pb)}`,
			insert: `INSERT INTO ${targetTable(spec.table)} (${quotedColumns(spec.columns)}) VALUES (${spec.columns.map(() => "?").join(", ")})`,
		},
	]),
);

const SQL_BY_TABLE = new Map<string, SpecSql>(
	SPECS.map((spec) => [spec.table, SQL_BY_COLLECTION.get(spec.pb) as SpecSql]),
);

function sqlForCollection(name: string): SpecSql {
	const entry = SQL_BY_COLLECTION.get(name);
	if (!entry) throw new Error(`no SQL for collection: ${name}`);
	return entry;
}

function sqlForTable(name: string): SpecSql {
	const entry = SQL_BY_TABLE.get(name);
	if (!entry) throw new Error(`no SQL for table: ${name}`);
	return entry;
}

/** PB column name -> target column name, where they differ. */
const COLUMN_ALIASES: Record<string, string> = {
	// PocketBase's autodate fields are `created` / `updated`, not `created_at`.
	created: "created_at",
	updated: "updated_at",
	user: "user_id",
	event: "event_id",
	society: "society_id",
	registration: "registration_id",
	payment: "payment_id",
	template: "template_id",
	batch: "batch_id",
	actor: "actor_id",
	operator: "operator_id",
	decisionBy: "decision_by",
	verifiedBy: "verified_by",
	createdBy: "created_by",
	issuedBy: "issued_by",
	revokedBy: "revoked_by",
	publishedBy: "published_by",
	submittedBy: "submitted_by",
	approvedBy: "approved_by",
	financeApprovedBy: "finance_approved_by",
	lockedBy: "attendance_qualification_locked_by",
	sourceExecom: "source_execom",
	assignment: "assignment_id",
	certificate: "certificate_id",
	certificateBatch: "certificate_batch_id",
	acceptedRegistration: "accepted_registration",
};

/** Target columns that hold a relation, and the collection they point at. */
const RELATIONS: Record<string, string> = {
	user_id: "users",
	created_by: "users",
	actor_id: "users",
	operator_id: "users",
	decision_by: "users",
	verified_by: "users",
	issued_by: "users",
	revoked_by: "users",
	published_by: "users",
	submitted_by: "users",
	approved_by: "users",
	finance_approved_by: "users",
	attendance_qualification_locked_by: "users",
	event_id: "events",
	session_id: "event_sessions",
	society_id: "societies",
	registration_id: "registrations",
	payment_id: "payments",
	template_id: "certificate_templates",
	batch_id: "certificate_batches",
	certificate_id: "certificates",
	certificate_batch_id: "certificate_batches",
	accepted_registration: "registrations",
	source_execom: "execom",
	assignment_id: "organization_assignments",
	supersedes: "certificates",
	superseded_by: "certificates",
};

const BOOLEAN_COLUMNS = new Set([
	"email_verified", "is_hidden", "time_tbc", "registration_open", "check_in_enabled",
	"is_deleted", "collect_ieee_member", "allow_self_cancellation", "waitlist_enabled",
	"attendance_qualification_locked", "attendance_enabled", "required_for_certificate",
	"checked_in", "ieee_member", "manual_review", "is_active", "active",
	"institutional_verified", "published",
]);

const DATE_COLUMNS = new Set([
	"created_at", "updated_at", "date", "end_date", "registration_start", "registration_deadline",
	"self_cancellation_until", "refund_request_until", "submitted_at", "approved_at",
	"finance_approved_at", "attendance_qualification_locked_at", "starts_at", "ends_at",
	"expires_at", "checked_in_at", "registration_date", "captured_at", "hold_expires_at",
	"last_synced_at", "provider_created_at", "requested_at", "processed_at", "failed_at",
	"last_attempt_at", "occurred_at", "joined_at", "offered_at", "offer_expires_at",
	"decision_at", "resolved_at", "published_at", "issued_at", "send_started_at",
	"completed_at", "next_attempt_at", "last_attempt_at", "sent_at", "verified_at",
	"active_from", "active_until", "last_login_at",
]);

/** `registered_count` -> `registeredCount` (PocketBase field naming). */
function toCamelCase(key: string): string {
	return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * NOT NULL numeric columns, and the value to use when PocketBase has none.
 *
 * `waitlist_offer_minutes` has a CHECK (15..10080) and one staging event stores
 * 0, so it falls back to the schema default rather than failing the constraint.
 */
const NOT_NULL_NUMERIC_DEFAULTS: Record<string, number> = {
	waitlist_offer_minutes: 60,
	version: 1,
	metadata_version: 1,
};

/**
 * Columns declared NOT NULL whose PocketBase value is legitimately empty.
 *
 * `users.role` is the only one: 92 of 99 staging users have no role set, which
 * PocketBase treats as the default. Mapping empty to the schema default keeps
 * the NOT NULL guarantee without inventing a role.
 */
const NOT_NULL_DEFAULTS: Record<string, string> = {
	role: "user",
};

const JSON_COLUMNS = new Set([
	"form_template", "coupons", "eligible_semesters", "eligible_programmes", "requirements",
	"attendance_qualification_snapshot", "form_responses", "payment_data", "audience_config",
	"audience_snapshot", "layout", "before", "after",
]);

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(
	spec: Spec,
	row: Record<string, unknown>,
	idMap: IdMap,
	fallbackTimestamp: string,
): unknown[] {
	// PB columns are the field names; build a lookup from target column to the
	// PB column that supplies it.
	const pbByTarget = new Map<string, string>();
	for (const [pbCol, targetCol] of Object.entries(COLUMN_ALIASES)) {
		pbByTarget.set(targetCol, pbCol);
	}

	return spec.columns.map((column) => {
		// `id` always comes from the map.
		if (column === "id") return remap(idMap, spec.pb, row.id);

		// PocketBase field names are camelCase (`registeredCount`); the target is
		// snake_case. Try the explicit alias, then the exact name (a few PB fields
		// really are snake_case, e.g. `display_name`), then the camelCase form.
		const pbColumn = pbByTarget.get(column) ?? column;
		let raw = row[pbColumn];
		if (raw === undefined) raw = row[toCamelCase(column)];

		if (column === "google_sub") return row.__googleSub ?? null;
		if (column === "created_at" || column === "updated_at") {
			return isoDate(raw) ?? fallbackTimestamp;
		}
		if (RELATIONS[column] && !spec.externalIdColumns?.includes(column)) {
			return remap(idMap, RELATIONS[column], raw);
		}
		if (BOOLEAN_COLUMNS.has(column)) return boolInt(raw);
		if (DATE_COLUMNS.has(column)) return isoDate(raw);
		if (JSON_COLUMNS.has(column)) return nullable(raw);
		if (column.endsWith("_paise") || column === "amount" || column === "discount_amount") {
			const n = Number(raw);
			return Number.isFinite(n) ? n : 0;
		}
		if (column in NOT_NULL_NUMERIC_DEFAULTS) {
			const n = Number(raw);
			const fallback = NOT_NULL_NUMERIC_DEFAULTS[column] as number;
			if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n)) return fallback;
			// `waitlist_offer_minutes` is CHECKed to 15..10080.
			if (column === "waitlist_offer_minutes" && (n < 15 || n > 10080)) return fallback;
			return n;
		}
		if (typeof raw === "number") return raw;
		if (NOT_NULL_DEFAULTS[column] && (raw === null || raw === undefined || raw === "")) {
			return NOT_NULL_DEFAULTS[column];
		}
		return nullable(raw);
	});
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

interface FileCopy {
	sourcePath: string;
	targetPath: string;
	bytes: number;
}

/** Collection id -> collection name, read from the source `_collections`. */
function collectionIdToName(source: Database.Database): Map<string, string> {
	const rows = source.prepare("SELECT id, name FROM _collections").all() as {
		id: string;
		name: string;
	}[];
	return new Map(rows.map((r) => [r.id, r.name]));
}

/** Collection name -> uploads subdirectory. */
const UPLOAD_DOMAIN: Record<string, string> = {
	events: "events",
	societies: "societies",
	execom: "execom",
	users: "users",
	certificate_templates: "certificates",
};

/**
 * Plan the file copies.
 *
 * PocketBase writes `storage/{collectionId}/{recordId}/{filename}` plus a
 * `{filename}.attrs` sidecar. The sidecars are metadata, not media — counting
 * them is the classic 2× error, so they are skipped explicitly.
 */
function planFiles(
	storageDir: string,
	idMap: IdMap,
	uploadsDir: string,
	collectionNames: Map<string, string>,
): FileCopy[] {
	const copies: FileCopy[] = [];
	if (!existsSync(storageDir)) return copies;

	for (const collectionId of readdirSync(storageDir)) {
		const collectionName = collectionNames.get(collectionId) ?? collectionId;
		const domain = UPLOAD_DOMAIN[collectionName] ?? "misc";
		const collectionDir = join(storageDir, collectionId);
		if (!statSync(collectionDir).isDirectory()) continue;

		for (const recordId of readdirSync(collectionDir)) {
			const recordDir = join(collectionDir, recordId);
			if (!statSync(recordDir).isDirectory()) continue;

			const newRecordId = idMap.get(collectionName)?.get(recordId);
			if (!newRecordId) continue; // record not migrated

			for (const filename of readdirSync(recordDir)) {
				if (filename.endsWith(".attrs")) continue;
				const sourcePath = join(recordDir, filename);
				if (!statSync(sourcePath).isFile()) continue;

				// Never reuse the original name: several contain personal names,
				// which is both a PII leak and a traversal risk.
				const ext = extname(filename).toLowerCase();
				const targetPath = join(uploadsDir, domain, newRecordId, `${randomUUID()}${ext}`);
				copies.push({ sourcePath, targetPath, bytes: statSync(sourcePath).size });
			}
		}
	}
	return copies;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

interface Check {
	name: string;
	ok: boolean;
	detail: string;
}

/**
 * Count real media files under a PocketBase storage tree.
 *
 * Excludes `*.attrs` sidecars and everything inside a `thumbs_*` directory.
 * Counting either is the classic 2x/3x error: a single upload produces one
 * media file, one `.attrs`, and one thumbnail directory.
 */
function countMediaFiles(storageDir: string): number {
	if (!storageDir || !existsSync(storageDir)) return 0;
	let total = 0;
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			const stats = statSync(full);
			if (stats.isDirectory()) {
				if (entry.startsWith("thumbs_")) continue;
				walk(full);
			} else if (!entry.endsWith(".attrs")) {
				total += 1;
			}
		}
	};
	walk(storageDir);
	return total;
}

function verify(
	target: Database.Database,
	source: Database.Database,
	counts: Map<string, number>,
	files: FileCopy[],
	storageDir: string,
): Check[] {
	const checks: Check[] = [];
	const push = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

	const integrity = target.pragma("integrity_check", { simple: true }) as string;
	push("integrity_check", integrity === "ok", integrity);

	const fk = target.pragma("foreign_key_check") as unknown[];
	push("foreign_key_check", fk.length === 0, `${fk.length} violations`);

	const tableCount = (
		target
			.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
			.get() as { n: number }
	).n;
	push("table count", tableCount === 26, `${tableCount} tables`);

	// Per-collection counts against the source.
	for (const spec of SPECS) {
		const expected = counts.get(spec.pb) ?? 0;
		const actual = (
			target.prepare(sqlForTable(spec.table).count).get() as { n: number }
		).n;
		push(`count ${spec.table}`, actual === expected, `${actual}/${expected}`);
	}

	// google_sub coverage.
	const linked = (
		source
			.prepare("SELECT count(*) AS n FROM _externalAuths WHERE provider = 'google'")
			.get() as { n: number }
	).n;
	const withSub = (
		target.prepare("SELECT count(*) AS n FROM users WHERE google_sub IS NOT NULL").get() as {
			n: number;
		}
	).n;
	push("google_sub populated", withSub === linked, `${withSub}/${linked}`);

	// No duplicate emails.
	const dupEmails = (
		target
			.prepare(
				"SELECT count(*) AS n FROM (SELECT lower(email) e FROM users GROUP BY lower(email) HAVING count(*) > 1)",
			)
			.get() as { n: number }
	).n;
	push("unique emails", dupEmails === 0, `${dupEmails} duplicates`);

	// Files. `planFiles` skips *.attrs sidecars and thumbs_* directories, so the
	// planned count is the real media count — not the raw file count.
	const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
	const planned = files.length;
	const onDisk = countMediaFiles(storageDir);
	push("media files planned", planned > 0, `${planned}`);
	push("media files on disk", planned === onDisk, `${planned}/${onDisk}`);
	push("media bytes", totalBytes > 0, `${totalBytes}`);

	return checks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	if (!existsSync(args.source)) throw new Error(`source not found: ${args.source}`);

	console.log(`mode:    ${args.apply ? "APPLY" : "DRY RUN"}`);
	console.log(`source:  ${args.source}`);
	console.log(`target:  ${args.target}`);
	console.log(`storage: ${args.storage ?? "(none)"}`);
	console.log("");

	const source = new Database(args.source, { readonly: true, fileMustExist: true });

	// Counts from the source, used by the verification step.
	const counts = new Map<string, number>();
	for (const spec of SPECS) {
		const n = (source.prepare(sqlForCollection(spec.pb).count).get() as { n: number }).n;
		counts.set(spec.pb, n);
	}

	// google_sub comes from _externalAuths.providerId, joined on recordRef.
	const googleSubs = new Map<string, string>();
	const authRows = source
		.prepare("SELECT recordRef, providerId FROM _externalAuths WHERE provider = 'google'")
		.all() as { recordRef: string; providerId: string }[];
	for (const row of authRows) googleSubs.set(row.recordRef, row.providerId);

	const idMap = buildIdMap(source, SPECS);

	// Files are planned before the write so a missing storage dir is loud.
	const collectionNames = collectionIdToName(source);
	const files =
		args.storage && args.uploads
			? planFiles(args.storage, idMap, args.uploads, collectionNames)
			: [];

	console.log(`records: ${[...counts.values()].reduce((a, b) => a + b, 0)}`);
	console.log(`google links: ${googleSubs.size}`);
	console.log(`files planned: ${files.length}`);
	console.log("");

	if (!args.apply) {
		// Dry run still opens the target to validate the schema and run the
		// assertions against an empty database — catching schema errors early.
		const scratch = new Database(":memory:");
		scratch.exec(readFileSync(resolve("sqlite/schema.sql"), "utf8"));
		console.log("schema applies cleanly: yes");
		console.log("");
		console.log("DRY RUN — nothing written. Re-run with --apply to migrate.");
		scratch.close();
		source.close();
		return;
	}

	if (existsSync(args.target) && !args.force) {
		const existing = new Database(args.target, { readonly: true });
		const n = (existing.prepare("SELECT count(*) AS n FROM users").get() as { n: number }).n;
		existing.close();
		if (n > 0) {
			throw new Error(`target ${args.target} already has ${n} users. Pass --force to overwrite.`);
		}
	}

	if (existsSync(args.target)) unlinkSync(args.target);

	const target = new Database(args.target);
	target.pragma("journal_mode = WAL");
	target.pragma("synchronous = NORMAL");
	target.pragma("foreign_keys = ON");
	target.pragma("busy_timeout = 5000");

	target.exec(readFileSync(resolve("sqlite/schema.sql"), "utf8"));

	const fallbackTimestamp = new Date().toISOString();

	target.exec("BEGIN IMMEDIATE");
	target.pragma("defer_foreign_keys = ON");

	try {
		for (const spec of SPECS) {
			const rows = source.prepare(sqlForCollection(spec.pb).selectAll).all() as Record<
				string,
				unknown
			>[];

			// Attach google_sub for users.
			if (spec.pb === "users") {
				for (const row of rows) {
					row.__googleSub = googleSubs.get(String(row.id)) ?? null;
				}
			}

			const statement = target.prepare(sqlForTable(spec.table).insert);

			for (const row of rows) {
				statement.run(...mapRow(spec, row, idMap, fallbackTimestamp));
			}
			console.log(`  ${spec.table}: ${rows.length}`);
		}

		// Multi-relation join tables.
		const chairRows = source.prepare("SELECT id, chairs FROM societies").all() as {
			id: string;
			chairs: string;
		}[];
		const chairStmt = target.prepare(
			"INSERT OR IGNORE INTO society_chairs (society_id, user_id, sort_order) VALUES (?, ?, ?)",
		);
		let chairCount = 0;
		for (const row of chairRows) {
			idArray(row.chairs).forEach((userId, index) => {
				const societyId = remap(idMap, "societies", row.id);
				const mappedUser = remap(idMap, "users", userId);
				if (societyId && mappedUser) {
					chairStmt.run(societyId, mappedUser, index);
					chairCount += 1;
				}
			});
		}
		console.log(`  society_chairs: ${chairCount}`);

		const blogRows = source.prepare("SELECT id, relation FROM blogs").all() as {
			id: string;
			relation: string;
		}[];
		const blogStmt = target.prepare(
			"INSERT OR IGNORE INTO blog_authors (blog_id, user_id) VALUES (?, ?)",
		);
		let authorCount = 0;
		for (const row of blogRows) {
			for (const userId of idArray(row.relation)) {
				const blogId = remap(idMap, "blogs", row.id);
				const mappedUser = remap(idMap, "users", userId);
				if (blogId && mappedUser) {
					blogStmt.run(blogId, mappedUser);
					authorCount += 1;
				}
			}
		}
		console.log(`  blog_authors: ${authorCount}`);

		const violations = target.pragma("foreign_key_check") as unknown[];
		if (violations.length > 0) {
			throw new Error(`foreign_key_check found ${violations.length} violations`);
		}

		target.exec("COMMIT");
	} catch (err) {
		target.exec("ROLLBACK");
		throw err;
	}

	// Files, after the rows commit. A --force re-run must not leave the files
	// from the previous run behind, or the uploads tree doubles every time.
	if (args.uploads && existsSync(args.uploads)) {
		for (const domain of new Set(Object.values(UPLOAD_DOMAIN))) {
			const dir = join(args.uploads, domain);
			if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
		}
	}

	if (files.length > 0) {
		let copied = 0;
		for (const file of files) {
			mkdirSync(join(file.targetPath, ".."), { recursive: true });
			writeFileSync(file.targetPath, readFileSync(file.sourcePath));
			copied += 1;
		}
		console.log(`  files copied: ${copied}`);
	}

	if (args.idMapPath) {
		const serialisable: Record<string, Record<string, string>> = {};
		for (const [collection, inner] of idMap) {
			serialisable[collection] = Object.fromEntries(inner);
		}
		writeFileSync(args.idMapPath, JSON.stringify(serialisable, null, 2));
		console.log(`  id map: ${args.idMapPath}`);
	}

	console.log("");
	console.log("=== verification ===");
	const checks = verify(target, source, counts, files, args.storage ?? "");
	let failed = 0;
	for (const check of checks) {
		if (!check.ok) failed += 1;
		console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name.padEnd(28)} ${check.detail}`);
	}
	console.log("");
	console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);

	target.close();
	source.close();

	if (failed > 0) process.exitCode = 1;
}

main();
