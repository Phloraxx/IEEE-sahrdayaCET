/**
 * Workspace authorization model — TypeScript port of `pb_hooks/workspace-authorization.js`.
 *
 * Phase 0 ships the *model*: the role/capability tables and the pure decision
 * functions. Enforcement (route guards, SQL scope predicates) lands in later
 * phases, but the semantics are fixed here so nothing drifts.
 *
 * Design difference from the PocketBase version
 * ---------------------------------------------
 * The hook version reaches into the PocketBase record API (`record.getString`,
 * `app.findRecordsByFilter`) inside every function. This port takes plain data
 * instead:
 *
 *   - `Actor` is `{ id, role }` — the two fields the model actually reads.
 *   - `Assignment` is a normalised row.
 *   - Society chair ids are passed in, because the legacy `chair` fallback needs
 *     them and this module must not do I/O.
 *
 * That makes every function pure and unit-testable without a database, and it
 * means later phases can resolve the data in one query and pass it down rather
 * than issuing a query per capability check.
 *
 * Two generations coexist, exactly as they do in the PocketBase rules
 * -------------------------------------------------------------------
 * 1. The legacy `users.role` column: `admin` | `chair` | `user` | `content`.
 * 2. The newer assignment/capability system: 6 canonical roles, 20 legacy role
 *    codes aliased onto them, scoped to branch / society / event.
 *
 * Both are live. `admin` short-circuits everything; `chair` gets the legacy
 * capability set but only for societies it chairs; `content` gets the content
 * capabilities. Assignments add on top.
 */

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const ALL_CAPABILITIES = [
	"workspace.view",
	"events.view",
	"events.create",
	"events.edit",
	"events.publish",
	"events.cancel",
	"events.archive",
	"events.complete",
	"registrations.view",
	"registrations.manage",
	"registrations.manual",
	"checkin.manage",
	"finance.view",
	"finance.manage",
	"societies.view",
	"societies.edit",
	"assignments.manage",
	"content.manage",
	"execom.manage",
	"reports.view",
	"technical.manage",
	"certificates.view",
	"certificates.manage_templates",
	"certificates.issue",
	"certificates.send",
	"certificates.revoke",
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

/** The legacy `users.role` values. */
export const USER_ROLES = ["admin", "chair", "user", "content"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Canonical roles
// ---------------------------------------------------------------------------

export const CANONICAL_ROLE_CAPABILITIES = {
	organizer: [
		"workspace.view",
		"events.view",
		"events.create",
		"events.edit",
		"events.publish",
		"events.cancel",
		"events.archive",
		"events.complete",
		"registrations.view",
		"registrations.manage",
		"registrations.manual",
		"checkin.manage",
		"assignments.manage",
		"societies.view",
		"societies.edit",
		"reports.view",
		"certificates.view",
		"certificates.manage_templates",
		"certificates.issue",
		"certificates.send",
		"certificates.revoke",
	],
	finance: ["workspace.view", "events.view", "finance.view", "finance.manage"],
	registration_staff: [
		"workspace.view",
		"events.view",
		"registrations.view",
		"registrations.manage",
		"registrations.manual",
	],
	checkin_staff: ["workspace.view", "events.view", "registrations.view", "checkin.manage"],
	content_editor: ["workspace.view", "events.view", "societies.view", "content.manage"],
} as const satisfies Record<string, readonly Capability[]>;

export type CanonicalRole = keyof typeof CANONICAL_ROLE_CAPABILITIES;

/**
 * Historical role codes, aliased onto canonical roles so existing records keep
 * working without a data rewrite. Copied verbatim from the PocketBase hook.
 */
export const ROLE_ALIASES: Record<string, CanonicalRole> = {
	branch_chair: "organizer",
	branch_vice_chair: "organizer",
	branch_secretary: "organizer",
	branch_joint_secretary: "organizer",
	branch_counselor: "organizer",
	branch_faculty_coordinator: "organizer",
	branch_treasurer: "finance",
	branch_content: "content_editor",
	branch_webmaster: "content_editor",
	society_faculty: "organizer",
	society_chair: "organizer",
	society_vice_chair: "organizer",
	society_secretary: "organizer",
	society_treasurer: "finance",
	society_content: "content_editor",
	event_lead: "organizer",
	event_registration: "registration_staff",
	event_checkin: "checkin_staff",
	event_content: "content_editor",
	event_finance: "finance",
};

/**
 * `society_team` was a genuine view-only historical assignment. It is not
 * offered for new grants, but retaining its narrow capabilities avoids silently
 * escalating or breaking an existing directory assignment.
 */
export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
	...CANONICAL_ROLE_CAPABILITIES,
	society_team: ["workspace.view", "events.view", "societies.view"],
};

// Apply the aliases so ROLE_CAPABILITIES is complete.
for (const [alias, canonical] of Object.entries(ROLE_ALIASES)) {
	ROLE_CAPABILITIES[alias] = CANONICAL_ROLE_CAPABILITIES[canonical];
}

/** What a legacy `chair` gets, before society scoping is applied. */
export const LEGACY_CHAIR_CAPABILITIES: readonly Capability[] = [
	"workspace.view",
	"events.view",
	"events.create",
	"events.edit",
	"events.publish",
	"events.cancel",
	"events.archive",
	"events.complete",
	"registrations.view",
	"registrations.manage",
	"registrations.manual",
	"checkin.manage",
	"finance.view",
	"societies.view",
	"societies.edit",
	"reports.view",
	"certificates.view",
	"certificates.manage_templates",
	"certificates.issue",
	"certificates.send",
	"certificates.revoke",
];

/** Which scopes each canonical role may be granted at. */
export const CANONICAL_ROLE_SCOPES: Record<CanonicalRole, readonly ScopeType[]> = {
	organizer: ["branch", "society", "event"],
	finance: ["branch", "society", "event"],
	registration_staff: ["event"],
	checkin_staff: ["event"],
	content_editor: ["branch", "society", "event"],
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type ScopeType = "branch" | "society" | "event";

/** The acting user. `role` is the legacy `users.role` column. */
export interface Actor {
	id: string;
	role: string;
}

/** A normalised `organization_assignments` row. */
export interface Assignment {
	id: string;
	userId: string;
	roleCode: string;
	scopeType: string;
	societyId: string | null;
	eventId: string | null;
	active: boolean;
	startsAt: string | null;
	endsAt: string | null;
	source: string | null;
}

/** What a capability is being checked against. */
export interface ScopeContext {
	societyId?: string;
	eventId?: string;
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function contains<T>(values: readonly T[], value: T): boolean {
	return values.includes(value);
}

/** Resolve a role code (canonical or alias) to its canonical role, or "". */
export function canonicalRoleCode(roleCode: string | null | undefined): CanonicalRole | "" {
	const raw = String(roleCode ?? "");
	if (Object.hasOwn(CANONICAL_ROLE_CAPABILITIES, raw)) return raw as CanonicalRole;
	return ROLE_ALIASES[raw] ?? "";
}

/**
 * The role code to persist for a grant at a given scope.
 *
 * A canonical role is stored as the scope-appropriate alias (e.g. `organizer`
 * at society scope becomes `society_chair`), because the PocketBase rules and
 * the directory UI both key off the concrete code.
 */
export function storageRoleCode(
	roleCode: string | null | undefined,
	scopeType: string | null | undefined,
): string {
	const raw = String(roleCode ?? "");
	const scope = String(scopeType ?? "");
	const canonical = canonicalRoleCode(raw);

	if (raw === "society_team" && scope === "society") return "society_team";
	if (!canonical || !contains(CANONICAL_ROLE_SCOPES[canonical], scope as ScopeType)) return "";

	// An existing alias keeps its own code, provided its scope matches.
	if (Object.hasOwn(ROLE_ALIASES, raw)) {
		return roleScopeType(raw, scope) === scope ? raw : "";
	}

	const preferred: Record<string, Partial<Record<CanonicalRole, string>>> = {
		branch: { organizer: "branch_secretary", finance: "branch_treasurer", content_editor: "branch_content" },
		society: { organizer: "society_chair", finance: "society_treasurer", content_editor: "society_content" },
		event: {
			organizer: "event_lead",
			finance: "event_finance",
			registration_staff: "event_registration",
			checkin_staff: "event_checkin",
			content_editor: "event_content",
		},
	};
	return preferred[scope]?.[canonical] ?? "";
}

/** Which scope a concrete role code belongs to. */
export function roleScopeType(roleCode: string | null | undefined, scopeType?: string): string {
	const raw = String(roleCode ?? "");
	if (raw.startsWith("branch_")) return "branch";
	if (raw.startsWith("society_")) return "society";
	if (raw.startsWith("event_")) return "event";

	const canonical = canonicalRoleCode(raw);
	const scope = String(scopeType ?? "");
	if (canonical && scope && contains(CANONICAL_ROLE_SCOPES[canonical], scope as ScopeType)) {
		return scope;
	}
	return "";
}

/** Is this role code grantable at this scope? */
export function validRoleCode(roleCode: string | null | undefined, scopeType?: string): boolean {
	const raw = String(roleCode ?? "");
	const scope = String(scopeType ?? "");

	if (Object.hasOwn(ROLE_CAPABILITIES, raw)) {
		if (!scope) return true;
		return roleScopeType(raw, scope) === scope;
	}
	const canonical = canonicalRoleCode(raw);
	return !!canonical && (!scope || contains(CANONICAL_ROLE_SCOPES[canonical], scope as ScopeType));
}

/** The legacy role of the actor. */
export function authRole(actor: Actor | null | undefined): string {
	return actor?.id ? String(actor.role ?? "") : "";
}

// ---------------------------------------------------------------------------
// Assignment evaluation
// ---------------------------------------------------------------------------

function parseDate(value: string | null | undefined): number | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isFinite(time) ? time : null;
}

/** Active means: flagged active, and now is inside [startsAt, endsAt]. */
export function assignmentActive(assignment: Assignment, nowMs?: number): boolean {
	if (!assignment.active) return false;
	const now = typeof nowMs === "number" ? nowMs : Date.now();
	const start = parseDate(assignment.startsAt);
	const end = parseDate(assignment.endsAt);
	if (start !== null && start > now) return false;
	if (end !== null && end < now) return false;
	return true;
}

/** Does an assignment's scope cover the requested context? */
export function scopeMatches(assignment: Assignment, context: ScopeContext = {}): boolean {
	switch (assignment.scopeType) {
		case "branch":
			return true;
		case "society":
			return !!assignment.societyId && assignment.societyId === String(context.societyId ?? "");
		case "event":
			return !!assignment.eventId && assignment.eventId === String(context.eventId ?? "");
		default:
			return false;
	}
}

/** Capabilities granted by a single assignment's role code. */
export function capabilitiesForRole(roleCode: string): readonly Capability[] {
	return ROLE_CAPABILITIES[roleCode] ?? ROLE_CAPABILITIES[canonicalRoleCode(roleCode)] ?? [];
}

/** Filter to the assignments currently in force. */
export function activeAssignments(
	assignments: readonly Assignment[],
	nowMs?: number,
): Assignment[] {
	return assignments.filter((row) => assignmentActive(row, nowMs));
}

// ---------------------------------------------------------------------------
// Legacy role fallbacks
// ---------------------------------------------------------------------------

/**
 * A legacy `chair` owns a society when its id is in `societies.chairs`.
 *
 * `societyChairIds` is passed in rather than looked up, so this stays pure.
 */
export function legacyChairOwnsSociety(
	actor: Actor | null | undefined,
	societyId: string | null | undefined,
	societyChairIds: readonly string[] = [],
): boolean {
	if (authRole(actor) !== "chair" || !societyId) return false;
	return societyChairIds.includes(String(actor?.id ?? ""));
}

/**
 * Capabilities from the legacy `users.role` column alone.
 *
 * `admin` gets everything; `content` gets the content pair; `chair` gets the
 * legacy set but only inside a society it chairs (except `workspace.view`).
 */
export function legacyHasCapability(
	actor: Actor | null | undefined,
	capability: Capability,
	context: ScopeContext = {},
	societyChairIds: readonly string[] = [],
): boolean {
	const role = authRole(actor);
	if (role === "admin") return true;
	if (role === "content") {
		return capability === "workspace.view" || capability === "content.manage";
	}
	if (role !== "chair" || !contains(LEGACY_CHAIR_CAPABILITIES, capability)) return false;
	if (capability === "workspace.view") return true;
	return legacyChairOwnsSociety(actor, context.societyId, societyChairIds);
}

// ---------------------------------------------------------------------------
// The decision functions
// ---------------------------------------------------------------------------

/**
 * Does `actor` hold `capability` in `context`?
 *
 * Legacy role first (it is the cheaper check), then any active assignment whose
 * role grants the capability and whose scope covers the context.
 */
export function hasCapability(
	actor: Actor | null | undefined,
	capability: Capability,
	context: ScopeContext = {},
	assignments: readonly Assignment[] = [],
	societyChairIds: readonly string[] = [],
	nowMs?: number,
): boolean {
	if (!actor?.id || !capability) return false;
	if (legacyHasCapability(actor, capability, context, societyChairIds)) return true;

	for (const row of activeAssignments(assignments, nowMs)) {
		if (!capabilitiesForRole(row.roleCode).includes(capability)) continue;
		if (scopeMatches(row, context)) return true;
	}
	return false;
}

/** Build the context for an event. */
export function eventContext(
	event: { id?: string; societyId?: string | null } | null | undefined,
): ScopeContext {
	if (!event) return { eventId: "", societyId: "" };
	return { eventId: event.id ?? "", societyId: event.societyId ?? "" };
}

/** `hasCapability` with an event's scope. */
export function hasEventCapability(
	actor: Actor | null | undefined,
	capability: Capability,
	event: { id?: string; societyId?: string | null } | null | undefined,
	assignments: readonly Assignment[] = [],
	societyChairIds: readonly string[] = [],
	nowMs?: number,
): boolean {
	return hasCapability(
		actor,
		capability,
		eventContext(event),
		assignments,
		societyChairIds,
		nowMs,
	);
}

/**
 * May the actor enter the admin workspace at all?
 *
 * Deliberately `workspace.view` only: the individual screens and their APIs do
 * their own capability checks, this is the gate that stops a signed-in ordinary
 * member from receiving the admin shell.
 */
export function hasWorkspaceAccess(
	actor: Actor | null | undefined,
	assignments: readonly Assignment[] = [],
	nowMs?: number,
): boolean {
	// `effectiveCapabilities` rather than `hasCapability(..., {})`: a society- or
	// event-scoped assignment grants workspace access *inside that scope*, and the
	// question here is only whether the actor may enter at all.
	return effectiveCapabilities(actor, assignments, nowMs).includes("workspace.view");
}

/** Every capability the actor holds, sorted. */
export function effectiveCapabilities(
	actor: Actor | null | undefined,
	assignments: readonly Assignment[] = [],
	nowMs?: number,
): Capability[] {
	if (!actor?.id) return [];
	const role = authRole(actor);
	if (role === "admin") return [...ALL_CAPABILITIES];

	const out = new Set<Capability>();
	if (role === "content") {
		out.add("workspace.view");
		out.add("content.manage");
	}
	if (role === "chair") {
		for (const capability of LEGACY_CHAIR_CAPABILITIES) out.add(capability);
	}
	for (const row of activeAssignments(assignments, nowMs)) {
		for (const capability of capabilitiesForRole(row.roleCode)) out.add(capability);
	}
	return [...out].sort();
}

/**
 * Does the actor manage assignments at a scope that outranks the target?
 *
 * Used to stop a society manager from granting roles at branch scope, or an
 * event manager from granting society-scope roles.
 */
export function hasHigherScopeAssignmentManager(
	actor: Actor | null | undefined,
	assignments: readonly Assignment[],
	scopeType: string,
	societyId?: string | null,
	eventSocietyId?: string | null,
	nowMs?: number,
): boolean {
	const targetSociety = String(societyId ?? eventSocietyId ?? "");
	for (const row of activeAssignments(assignments, nowMs)) {
		if (!capabilitiesForRole(row.roleCode).includes("assignments.manage")) continue;
		if (row.scopeType === "branch") return true;
		if (
			scopeType === "event" &&
			row.scopeType === "society" &&
			row.societyId === targetSociety
		) {
			return true;
		}
	}
	return false;
}

/** May the actor manage assignments at this scope? */
export function mayManageAssignments(
	actor: Actor | null | undefined,
	assignments: readonly Assignment[],
	scopeType: string,
	societyId?: string | null,
	event?: { id?: string; societyId?: string | null } | null,
	nowMs?: number,
): boolean {
	if (authRole(actor) === "admin") return true;
	if (scopeType === "branch") {
		return hasCapability(actor, "assignments.manage", {}, assignments, [], nowMs);
	}
	if (scopeType === "society") {
		return hasCapability(
			actor,
			"assignments.manage",
			{ societyId: societyId ?? "" },
			assignments,
			[],
			nowMs,
		);
	}
	if (scopeType === "event") {
		if (!event) return false;
		return hasEventCapability(
			actor,
			"assignments.manage",
			event,
			assignments,
			[],
			nowMs,
		);
	}
	return false;
}

/**
 * May the actor grant `roleCode` at this scope?
 *
 * Branch scope is admin-only. Society scope: organizer/finance need a
 * higher-scope manager; content_editor does not. Event scope: organizer/finance
 * need a higher-scope manager; the staff roles do not.
 */
export function mayGrantRole(
	actor: Actor | null | undefined,
	assignments: readonly Assignment[],
	roleCode: string,
	scopeType: string,
	societyId?: string | null,
	event?: { id?: string; societyId?: string | null } | null,
	nowMs?: number,
): boolean {
	if (authRole(actor) === "admin") return true;

	const accessRole = canonicalRoleCode(roleCode);
	if (!validRoleCode(roleCode, scopeType)) return false;
	if (roleScopeType(roleCode, scopeType) !== scopeType) return false;
	if (!mayManageAssignments(actor, assignments, scopeType, societyId, event, nowMs)) return false;
	if (scopeType === "branch") return false;

	const higherScopeManager = hasHigherScopeAssignmentManager(
		actor,
		assignments,
		scopeType,
		societyId,
		event?.societyId ?? null,
		nowMs,
	);

	if (scopeType === "society") {
		if (accessRole === "organizer" || accessRole === "finance") return higherScopeManager;
		return accessRole === "content_editor";
	}
	if (scopeType === "event") {
		if (accessRole === "organizer" || accessRole === "finance") return higherScopeManager;
		return (
			accessRole === "registration_staff" ||
			accessRole === "checkin_staff" ||
			accessRole === "content_editor"
		);
	}
	return false;
}
