/**
 * Release-gate preload (server side).
 *
 * Runs inside the compiled app's own process, so the app's real `fetch` calls
 * reach a fake provider without any application change.
 *
 * Two rules keep this from becoming a production hazard:
 *
 * 1. It does nothing unless `RELEASE_GATE_PROVIDER_ORIGIN` is set. Only
 *    `tests/ci/release-gate.mjs` and the `release-gate` CI job set it.
 * 2. It rewrites exactly two hosts (Google's token and userinfo endpoints) and
 *    nothing else, and the origin it rewrites to must be loopback.
 *
 * The alternative — a configurable provider URL in `google.server.ts` — would
 * ship a switch that can redirect production's OAuth exchange. This keeps the
 * application honest: production always talks to Google, and the gate wraps
 * `fetch` from outside it.
 */
const origin = process.env.RELEASE_GATE_PROVIDER_ORIGIN?.trim();
const fakeHosts = new Map([
	["oauth2.googleapis.com", "/token"],
	["openidconnect.googleapis.com", "/userinfo"],
]);

if (origin) {
	const target = new URL(origin);
	const host = target.hostname.replace(/^\[|\]$/g, "");
	const loopback = host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
	if (target.protocol !== "http:" || !loopback) {
		throw new Error(
			`RELEASE_GATE_PROVIDER_ORIGIN must be a loopback http origin, got ${JSON.stringify(origin)}`,
		);
	}

	const realFetch = globalThis.fetch;
	globalThis.fetch = function releaseGateFetch(input, init) {
		let url = "";
		try {
			url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		} catch {
			return realFetch(input, init);
		}
		if (!/^https?:\/\//.test(url)) return realFetch(input, init);
		const parsed = new URL(url);
		const path = fakeHosts.get(parsed.hostname);
		if (!path) return realFetch(input, init);
		return realFetch(new URL(path, target).href, init);
	};
}
