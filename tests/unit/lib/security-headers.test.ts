import { describe, expect, it } from "vitest";

import { securityHeaders } from "../../../src/lib/security-headers";

describe("security headers", () => {
	it("always pins HTTPS, so a missing DEPLOY_ENV cannot drop HSTS", () => {
		for (const env of [undefined, "", "staging", "production", "preview"]) {
			expect(securityHeaders({ deployEnv: env })["Strict-Transport-Security"]).toBe(
				"max-age=31536000",
			);
		}
	});

	it("keeps the baseline protections", () => {
		const headers = securityHeaders({ deployEnv: "production" });
		expect(headers["X-Content-Type-Options"]).toBe("nosniff");
		expect(headers["X-Frame-Options"]).toBe("DENY");
		expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
		expect(headers["Permissions-Policy"]).toContain("geolocation=()");
	});

	it("marks non-production hosts noindex and leaves production indexable", () => {
		expect(securityHeaders({ deployEnv: "staging" })["X-Robots-Tag"]).toBe("noindex, nofollow");
		expect(securityHeaders({ deployEnv: undefined })["X-Robots-Tag"]).toBe("noindex, nofollow");
		expect(securityHeaders({ deployEnv: "production" })["X-Robots-Tag"]).toBeUndefined();
	});
});
