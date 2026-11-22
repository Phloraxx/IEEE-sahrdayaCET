import { describe, expect, it } from "vitest";

import { allowedOrigins, isMutationOriginAllowed } from "../../../src/server/http/origin";

const base = {
	allowedOrigins: "https://ieeesahrdaya.com,https://www.ieeesahrdaya.com",
	siteUrl: "https://ieeesahrdaya.com",
	nodeEnv: "production",
};

function post(origin?: string, method = "POST") {
	const headers: Record<string, string> = {};
	if (origin !== undefined) headers.Origin = origin;
	return new Request("https://ieeesahrdaya.com/api/events/x/register", { method, headers });
}

describe("mutation origin guard", () => {
	it("allows safe methods regardless of origin", () => {
		expect(isMutationOriginAllowed(post("https://evil.example", "GET"), base)).toBe(true);
		expect(isMutationOriginAllowed(post("https://evil.example", "HEAD"), base)).toBe(true);
		expect(isMutationOriginAllowed(post("https://evil.example", "OPTIONS"), base)).toBe(true);
	});

	it("allows a configured origin and the deployment's own origin", () => {
		expect(isMutationOriginAllowed(post("https://ieeesahrdaya.com"), base)).toBe(true);
		expect(isMutationOriginAllowed(post("https://www.ieeesahrdaya.com"), base)).toBe(true);
		expect(
			isMutationOriginAllowed(post("http://127.0.0.1:3992"), {
				appUrl: "http://127.0.0.1:3992",
				nodeEnv: "production",
			}),
		).toBe(true);
	});

	it("rejects a cross-site origin and the null origin", () => {
		expect(isMutationOriginAllowed(post("https://evil.example"), base)).toBe(false);
		expect(isMutationOriginAllowed(post("null"), base)).toBe(false);
		expect(isMutationOriginAllowed(post("http://ieeesahrdaya.com"), base)).toBe(false);
	});

	it("allows a request without Origin, because no browser can attach a cross-site cookie", () => {
		expect(isMutationOriginAllowed(post(undefined), base)).toBe(true);
	});

	it("normalises a trailing path in a configured value", () => {
		expect(allowedOrigins({ allowedOrigins: "https://x.test/some/path" }).has("https://x.test")).toBe(
			true,
		);
	});

	it("accepts the Vite dev origins only outside production", () => {
		expect(allowedOrigins({ nodeEnv: "development" }).has("http://localhost:5173")).toBe(true);
		expect(allowedOrigins({ nodeEnv: "production" }).has("http://localhost:5173")).toBe(false);
	});
});
