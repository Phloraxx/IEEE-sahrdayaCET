import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listAdminUsers` backs `/api/admin/users`.
 *
 * The bug this replaced: the page listed through `collection("users")`, which is
 * a self policy, so an admin saw exactly one row and the search box could never
 * match anything else. These tests pin the admin-only guard, the search
 * semantics, and the fact that a `%` in the query is a literal, not a wildcard.
 */

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db.server", () => ({ query, withTransaction: vi.fn() }));
vi.mock("@/server/workspace/service", () => ({
	loadAssignments: vi.fn().mockResolvedValue([]),
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
	hasCapability: () => true,
	hasEventCapability: () => true,
	activeAssignments: () => [],
	capabilitiesForRole: () => [],
}));

const { listAdminUsers } = await import("@/server/admin/service");

const admin = { id: "admin-1", role: "admin" };

/** The SQL and bindings of the Nth query call, without the loose mock typing. */
function call(index: number): [string, unknown[]] {
  const entry = query.mock.calls[index] as [string, unknown[]] | undefined;
  if (!entry) throw new Error(`expected a query at index ${index}`);
  return entry;
}

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index}`,
    name: `User ${index}`,
    email: `user${index}@sahrdaya.ac.in`,
    role: "user",
    avatar: null,
    created_at: "2026-01-01T00:00:00.000Z",
    registrations_count: index,
  }));
}

/** The count query runs first, then the page query. */
function prime(count: number, page = rows(count)) {
  query
    .mockResolvedValueOnce({ rows: [{ count }] })
    .mockResolvedValueOnce({ rows: page });
}

describe("listAdminUsers", () => {
  beforeEach(() => query.mockReset());

  it("refuses a non-admin, even one with capabilities", async () => {
    await expect(listAdminUsers({ id: "u1", role: "chair" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("returns every user, not just the caller", async () => {
    prime(100, rows(40));
    const result = await listAdminUsers(admin);
    expect(result.total).toBe(100);
    expect(result.users).toHaveLength(40);
    expect(result.hasMore).toBe(true);
  });

  it("maps rows to the shape the page consumes", async () => {
    prime(1, rows(1));
    const result = await listAdminUsers(admin);
    expect(result.users[0]).toEqual({
      id: "user-0",
      name: "User 0",
      email: "user0@sahrdaya.ac.in",
      role: "user",
      avatar: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      registrationsCount: 0,
    });
  });

  it("searches with instr, so a % is a literal and not a wildcard", async () => {
    prime(0, []);
    await listAdminUsers(admin, { q: "100%" });

    const [sql, params] = call(0);
    expect(params).toEqual(["100%", "100%"]);
    expect(sql).toContain("instr(lower(");
    expect(sql).not.toContain("LIKE");
  });

  it("lowercases the search term so matching is case-insensitive", async () => {
    prime(0, []);
    await listAdminUsers(admin, { q: "Adithyan" });
    const [, params] = call(0);
    expect(params).toEqual(["adithyan", "adithyan"]);
  });

  it("filters by role only when it is a real role", async () => {
    prime(0, []);
    await listAdminUsers(admin, { role: "all" });
    expect(call(0)[0]).not.toContain("u.role = ?");

    query.mockReset();
    prime(0, []);
    await listAdminUsers(admin, { role: "admin" });
    expect(call(0)[0]).toContain("u.role = ?");
    expect(call(0)[1]).toEqual(["admin"]);
  });

  it("caps perPage at 100 so a caller cannot request the whole table", async () => {
    prime(0, []);
    const result = await listAdminUsers(admin, { perPage: 5000 });
    expect(result.perPage).toBe(100);
    expect(call(1)[1]).toContain(100);
  });

  it("clamps a bad page to 1 rather than a negative offset", async () => {
    prime(0, []);
    const result = await listAdminUsers(admin, { page: -3 });
    expect(result.page).toBe(1);
    expect(call(1)[1]).toContain(0);
  });
});
