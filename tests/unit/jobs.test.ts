import { describe, expect, it } from "vitest";

import {
	DAY_MS,
	isDue,
	msUntilNextMinute,
	timestampForFilename,
} from "../../src/server/jobs/clock";

describe("job scheduling arithmetic", () => {
	it("wakes on the next wall-clock minute, never immediately", () => {
		expect(msUntilNextMinute(Date.UTC(2026, 10, 22, 10, 0, 0))).toBe(60_000);
		expect(msUntilNextMinute(Date.UTC(2026, 10, 22, 10, 0, 30, 250))).toBe(29_755);
		expect(msUntilNextMinute(Date.UTC(2026, 10, 22, 10, 0, 59, 999))).toBe(6);
	});

	it("treats a never-run job as due and otherwise uses the interval", () => {
		const now = Date.UTC(2026, 10, 22, 10, 0, 0);
		expect(isDue(0, now, DAY_MS)).toBe(true);
		expect(isDue(now - DAY_MS + 1, now, DAY_MS)).toBe(false);
		expect(isDue(now - DAY_MS, now, DAY_MS)).toBe(true);
	});

	it("writes filename-safe timestamps", () => {
		expect(timestampForFilename(Date.UTC(2026, 10, 22, 2, 20, 0))).toBe("2026-11-22T02-20-00-000Z");
	});
});
