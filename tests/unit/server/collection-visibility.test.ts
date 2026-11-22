import { describe, expect, it } from "vitest";

import { COLLECTION_POLICIES, scopePredicate } from "../../../src/server/collections/policy";

describe("collection publication visibility", () => {
	it("declares publication state for the content collections", () => {
		expect(COLLECTION_POLICIES.events!.publicRead?.sql).toContain("published");
		expect(COLLECTION_POLICIES.societies!.publicRead?.sql).toContain("is_hidden");
		expect(COLLECTION_POLICIES.events!.publicRead?.capability).toBe("events.edit");
		expect(COLLECTION_POLICIES.blogs).toBeUndefined();
	});

	it("strips execom contact details without the manage capability", () => {
		expect(COLLECTION_POLICIES.execom!.publicOmit).toEqual(["email", "phone"]);
		expect(COLLECTION_POLICIES.execom!.publicOmitBypass).toBe("execom.manage");
	});

	it("builds an OR predicate for a scoped reader", () => {
		const predicate = scopePredicate(
			{ societyIds: ["s1"], eventIds: ["e1"] },
			{ societyColumn: "society_id", eventColumn: "id" },
		);
		expect(predicate?.sql).toBe("(society_id IN (?) OR id IN (?))");
		expect(predicate?.params).toEqual(["s1", "e1"]);
	});

	it("uses only the half of the scope that is populated", () => {
		const predicate = scopePredicate(
			{ societyIds: [], eventIds: ["e1"] },
			{ societyColumn: "society_id", eventColumn: "id" },
		);
		expect(predicate?.sql).toBe("(id IN (?))");
		expect(predicate?.params).toEqual(["e1"]);
	});

	it("returns null for an empty scope, which callers treat as public-only", () => {
		expect(
			scopePredicate({ societyIds: [], eventIds: [] }, { societyColumn: "society_id" }),
		).toBeNull();
	});
});
