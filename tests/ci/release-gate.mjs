/**
 * The release gate, end to end, on a host.
 *
 *   1. build the app (`bun run build`, unless RELEASE_GATE_SKIP_BUILD=1 for when
 *      the caller already built it — CI does, in an earlier step);
 *   2. seed a synthetic database with `tests/ci/seed.mjs`;
 *   3. start a fake Google token/userinfo provider on loopback;
 *   4. start the compiled server on loopback with every provider faked and the
 *      job runner off, preloading `tests/ci/release-gate-preload.mjs` so the
 *      app's own `fetch` calls reach the fake provider;
 *   5. run the two `release-gate-*.e2e.ts` specs (HTTP contract + browser);
 *   6. stop everything and delete the gate database.
 *
 * Deliberately not the whole Playwright suite: that needs staging fixtures and
 * real OAuth, and it stays documented as a local, manually-run suite. This
 * script is the deterministic, self-contained subset a release is gated on.
 *
 * Safety: loopback only; a temporary data directory; the seed refuses any path
 * that is not named `release-gate*.sqlite`; nothing reads an environment file,
 * a backup or a PocketBase volume.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
// Locally the host Bun may be older than the CI pin; when this script runs under
// 1.4.5 (CI, or `npx bun@1.4.5 tests/ci/release-gate.mjs`), reuse that binary so
// child processes run the same version. Nothing is downloaded here.
const hostBunIsPinned = /^1\.4\.5/.test(process.versions.bun || "");
const bun = process.env.RELEASE_GATE_BUN || (hostBunIsPinned ? process.execPath : "bun");
if (!/^1\.4\.5/.test(process.versions.bun || "") && !process.env.RELEASE_GATE_BUN) {
	console.warn(
		`[release-gate] host bun is ${process.versions.bun}; CI pins 1.4.5. ` +
			"Run `npx bun@1.4.5 tests/ci/release-gate.mjs` (or set RELEASE_GATE_BUN) to match CI.",
	);
}
const port = Number(process.env.RELEASE_GATE_PORT || 3210);
const appUrl = `http://127.0.0.1:${port}`;
const providerPort = Number(process.env.RELEASE_GATE_PROVIDER_PORT || 0) || undefined;
const dataDir = process.env.RELEASE_GATE_DATA_DIR?.trim() || mkdtempSync(join(tmpdir(), "release-gate-"));
const keepData = process.env.RELEASE_GATE_KEEP === "1" || Boolean(process.env.RELEASE_GATE_DATA_DIR);

function log(message) {
	console.log(`[release-gate] ${message}`);
}

function child(command, args, env, capture = false) {
	let output = "";
	const proc = spawn(command, args, {
		cwd: root,
		env: { ...process.env, ...env },
		stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
	});
	if (capture) {
		proc.stdout.on("data", (chunk) => {
			output += chunk.toString();
			process.stdout.write(chunk);
		});
	}
	const done = new Promise((resolveDone, reject) => {
		proc.on("error", reject);
		proc.on("exit", (code, signal) => {
			if (code === 0) resolveDone(output);
			else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}`));
		});
	});
	return { proc, done };
}

async function waitForHealth(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(`${url}/healthz`)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 250));
	}
	throw new Error(`${url}/healthz did not become healthy within ${timeoutMs} ms`);
}

/** The identity the fake provider returns for a successful exchange. */
const providerIdentity = {
	sub: "release-gate-provider-subject",
	email: "provider-user@example.test",
	email_verified: true,
	name: "Release Gate Provider User",
};

const fakeProvider = createServer((request, response) => {
	if (request.method === "POST" && request.url === "/token") {
		// Consume the form body so the socket is read cleanly.
		request.resume();
		request.on("end", () => {
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ access_token: "release-gate-access-token", id_token: null }));
		});
		return;
	}
	if (request.method === "GET" && request.url === "/userinfo") {
		if (request.headers.authorization !== "Bearer release-gate-access-token") {
			response.writeHead(401, { "Content-Type": "application/json" });
			response.end(JSON.stringify({ error: "unauthorized" }));
			return;
		}
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(providerIdentity));
		return;
	}
	response.writeHead(404, { "Content-Type": "application/json" });
	response.end(JSON.stringify({ error: "not found" }));
});

let app = null;
let providerListening = false;
let ok = false;

try {
	if (process.env.RELEASE_GATE_SKIP_BUILD === "1") {
		log("using the existing build/");
	} else {
		log("building the app");
		await child(bun, ["run", "build"], {}).done;
	}

	log(`seeding into ${dataDir}`);
	const seedOutput = await child(bun, ["tests/ci/seed.mjs"], { RELEASE_GATE_DATA_DIR: dataDir }, true).done;
	const dbPath = /RELEASE_GATE_SQLITE_PATH=(.+)/.exec(seedOutput)?.[1]?.trim();
	if (!dbPath) throw new Error("tests/ci/seed.mjs did not print RELEASE_GATE_SQLITE_PATH");
	// The app creates a missing database on boot, so an unseeded start would come
	// up healthy and empty. Fail here instead, before the app is spawned.
	await child(bun, ["tests/ci/assert-seeded.mjs", dbPath], {}, true).done;

	await new Promise((resolveListen, reject) => {
		fakeProvider.once("error", reject);
		fakeProvider.listen(providerPort ?? 0, "127.0.0.1", resolveListen);
	});
	providerListening = true;
	const providerOrigin = `http://127.0.0.1:${fakeProvider.address().port}`;
	log(`fake Google token/userinfo provider on ${providerOrigin}`);

	// The seed is asserted before the app is started, so it already covers the
	// "missing database" case here. This is the same file the gate spec reads.
	const buildInfoPath = resolve(root, "build", "build-info.json");

	const env = {
		PORT: String(port),
		NODE_ENV: "test",
		DEPLOY_ENV: "test",
		SITE_URL: appUrl,
		APP_URL: appUrl,
		ALLOWED_ORIGINS: appUrl,
		SQLITE_PATH: dbPath,
		UPLOADS_DIR: join(dataDir, "uploads"),
		APP_SECRET: "release-gate-app-secret-0123456789abcdef",
		GOOGLE_CLIENT_ID: "release-gate.apps.example.test",
		GOOGLE_CLIENT_SECRET: "release-gate-not-a-real-secret",
		RELEASE_GATE_PROVIDER_ORIGIN: providerOrigin,
		MAIL_DELIVERY_MODE: "disabled",
		JOBS_ENABLED: "0",
		PAYGATE_URL: "",
		PAYGATE_API_KEY: "",
		PAYGATE_WEBHOOK_SECRET: "",
		RENDER_CACHE_TTL_SECONDS: "0",
	};

	log(`starting the compiled app on ${appUrl} (provenance: ${buildInfoPath})`);
	app = child(
		process.env.RELEASE_GATE_NODE || "node",
		["--import", "./tests/ci/release-gate-preload.mjs", "./node_modules/@react-router/serve/bin.js", "./build/server/index.js"],
		env,
	);
	app.proc.on("exit", (code, signal) => {
		if (!ok) console.error(`[release-gate] app exited early (${code ?? signal})`);
	});

	await waitForHealth(appUrl, 90_000);
	log("app is healthy; running the release-gate specs");

	await child(
		bun,
		// No file arguments: the dedicated config's testMatch picks exactly the
		// two gate specs. Passing paths here is fragile (Playwright resolves them
		// as regular expressions against the test dir).
		["x", "playwright", "test", "--config", "playwright.release-gate.config.ts"],
		{
			RELEASE_GATE: "1",
			RELEASE_GATE_APP_URL: appUrl,
			RELEASE_GATE_SQLITE_PATH: dbPath,
			// When CI built the image inputs, the gate also proves they landed.
			RELEASE_GATE_EXPECT_TREE: process.env.GIT_TREE || "",
			RELEASE_GATE_EXPECT_COMMIT: process.env.GIT_COMMIT || "",
			CI: process.env.CI || "",
		},
	).done;

	ok = true;
	log("release gate passed");
} catch (error) {
	console.error(`[release-gate] FAILED: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	if (app && !app.proc.killed) app.proc.kill("SIGTERM");
	if (providerListening) await new Promise((resolveClose) => fakeProvider.close(resolveClose));
	if (keepData) log(`gate data kept at ${dataDir}`);
	else rmSync(dataDir, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
