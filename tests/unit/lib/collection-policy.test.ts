import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COLLECTION_POLICIES } from "@/server/collections/policy";

/**
 * Structural invariants for the generic collection endpoint.
 *
 * These are the rules that, when broken, turn `/api/collections/:name` into an
 * open reader. They are asserted over the whole policy table rather than one
 * entry at a time, so a policy added later cannot reintroduce the bug.
 */

const entries = Object.entries(COLLECTION_POLICIES);

describe("collection policy invariants", () => {
	it("gives every self-scoped policy an owner column", () => {
		// The loaders only apply the self-scope when `ownerColumn` is set. A
		// `read: "self"` policy without one is not "self" at all — it is public to
		// every signed-in user. That is exactly how registrations leaked.
		const broken = entries
			.filter(([, policy]) => policy.read === "self" && !policy.ownerColumn)
			.map(([name]) => name);
		expect(broken, "self policies without an ownerColumn").toEqual([]);
	});

	it("gives every self-scoped write policy an owner column", () => {
		const broken = entries
			.filter(([, policy]) => policy.write === "self" && !policy.ownerColumn)
			.map(([name]) => name);
		expect(broken, "self write policies without an ownerColumn").toEqual([]);
	});

	it("does not expose registrations through the collection endpoint", () => {
		// Nothing in the client reads `collection("registrations")`; the attendee
		// surfaces go through /api/my-events and /api/events/:id/my-registration,
		// which scope by `user_id = ?` in SQL. The policy entry was pure attack
		// surface and leaked every row.
		expect(COLLECTION_POLICIES.registrations).toBeUndefined();
	});

	it("only names tables that exist in the schema", () => {
		const schema = readFileSync(resolve(process.cwd(), "sqlite/schema.sql"), "utf8");
		const missing = entries
			.map(([, policy]) => policy.table)
			.filter((table) => !new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(schema));
		expect(missing, "policies pointing at a table the schema does not create").toEqual([]);
	});

	it("requires a capability for every capability-gated policy", () => {
		const broken = entries
			.filter(
				([, policy]) =>
					(policy.read === "capability" && !policy.readCapability) ||
					(policy.write === "capability" && !policy.writeCapability),
			)
			.map(([name]) => name);
		expect(broken, "capability policies without a capability").toEqual([]);
	});
});
