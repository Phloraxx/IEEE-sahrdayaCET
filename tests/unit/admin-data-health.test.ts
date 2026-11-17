import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `dataHealth` projects each check as an issue row, because the admin page
 * renders a triage list rather than raw counts. These tests pin the projection
 * and the clean-database case, which is the one that regressed silently: the
 * page used to spin forever because the client threw before it ever fetched.
 */

const { query, loadAssignments, hasCapability } = vi.hoisted(() => ({
	query: vi.fn(),
	loadAssignments: vi.fn(),
	hasCapability: vi.fn(),
}));

vi.mock("@/lib/db.server", () => ({ query }));
vi.mock("@/server/workspace/service", () => ({
	loadAssignments,
	WorkspaceError: class WorkspaceError extends Error {
		status: number;
		code: string;
		constructor(status: number, code: string, message: string) {
			super(message);
			this.status = status;
			this.code = code;
		}
	},
}));
vi.mock("@/server/authz/capabilities", () => ({
	hasCapability,
	activeAssignments: () => [],
	capabilitiesForRole: () => [],
}));

const { dataHealth } = await import("@/server/admin/service");

const actor = { id: "admin-1", role: "admin" };

/** Queue the four queries `dataHealth` issues, in order. */
function primeQueries({
	counts = [] as Array<{ table_name: string; count: number }>,
	integrity = "ok",
	foreignKeys = [] as unknown[],
	paidWithoutTicket = 0,
} = {}) {
	query
		.mockResolvedValueOnce({ rows: counts })
		.mockResolvedValueOnce({ rows: [{ integrity_check: integrity }] })
		.mockResolvedValueOnce({ rows: foreignKeys })
		.mockResolvedValueOnce({ rows: [{ count: paidWithoutTicket }] });
}

describe("dataHealth", () => {
	beforeEach(() => {
		query.mockReset();
		loadAssignments.mockReset().mockResolvedValue([]);
		hasCapability.mockReset().mockReturnValue(true);
	});

	it("reports no issues for a clean database", async () => {
		primeQueries({
			counts: [
				{ table_name: "users", count: 100 },
				{ table_name: "events", count: 82 },
			],
		});

		const report = await dataHealth(actor);

		expect(report.issues).toEqual([]);
		expect(report.integrity).toBe("ok");
		expect(report.foreignKeyViolations).toBe(0);
		expect(report.paidWithoutTicket).toBe(0);
	});

	it("always returns a checkedAt the page can format", async () => {
		primeQueries();
		const report = await dataHealth(actor);
		expect(Number.isFinite(Date.parse(report.checkedAt))).toBe(true);
	});

	it("maps table counts to the camelCase keys the client type declares", async () => {
		primeQueries({
			counts: [
				{ table_name: "users", count: 100 },
				{ table_name: "events", count: 82 },
				{ table_name: "registrations", count: 6 },
				{ table_name: "societies", count: 15 },
				{ table_name: "organization_assignments", count: 3 },
				{ table_name: "payment_attempts", count: 1 },
				{ table_name: "admin_audit_log", count: 28 },
			],
		});

		const report = await dataHealth(actor);

		expect(report.counts).toEqual({
			users: 100,
			events: 82,
			registrations: 6,
			societies: 15,
			organizationAssignments: 3,
			paymentAttempts: 1,
			auditLogEntries: 28,
		});
	});

	it("defaults a missing table to 0 rather than undefined", async () => {
		primeQueries({ counts: [{ table_name: "users", count: 5 }] });
		const report = await dataHealth(actor);
		expect(report.counts.events).toBe(0);
		expect(report.counts.auditLogEntries).toBe(0);
	});

	it("raises a critical issue when the integrity check is not ok", async () => {
		primeQueries({ integrity: "database disk image is malformed" });
		const report = await dataHealth(actor);
		const issue = report.issues.find((row) => row.id === "integrity");
		expect(issue?.severity).toBe("critical");
		expect(issue?.detail).toContain("malformed");
	});

	it("raises a critical issue per foreign-key violation", async () => {
		primeQueries({ foreignKeys: [{ table: "registrations", rowid: 3, parent: "events" }] });
		const report = await dataHealth(actor);
		const issue = report.issues.find((row) => row.id === "foreign-keys");
		expect(issue?.severity).toBe("critical");
		expect(issue?.title).toContain("1 orphaned foreign-key row");
	});

	it("raises a warning with a deep link when a paid registration has no ticket", async () => {
		primeQueries({ paidWithoutTicket: 2 });
		const report = await dataHealth(actor);
		const issue = report.issues.find((row) => row.id === "paid-without-ticket");
		expect(issue?.severity).toBe("warning");
		expect(issue?.href).toBe("/admin/registrations?paymentStatus=paid");
		expect(issue?.title).toContain("2 paid registrations");
	});

	it("refuses an actor without reports.view", async () => {
		hasCapability.mockReturnValue(false);
		await expect(dataHealth({ id: "u1", role: "user" })).rejects.toMatchObject({
			status: 403,
			code: "FORBIDDEN",
		});
		expect(query).not.toHaveBeenCalled();
	});
});
