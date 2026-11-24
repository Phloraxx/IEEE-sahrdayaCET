import { describe, expect, it } from "vitest";

import {
	readinessProbe,
	readinessReport,
	type ReadinessDependencies,
} from "../../../src/server/readiness.server";

const HOUR = 60 * 60 * 1000;

function deps(overrides: Partial<ReadinessDependencies> = {}): ReadinessDependencies {
	return {
		probeDatabase: async () => {},
		lastTickMs: () => 1_000,
		lastError: () => "",
		expectJobs: true,
		latestBackupMs: () => 1_000,
		now: () => 2_000,
		...overrides,
	};
}

const saved = {
	GIT_COMMIT: process.env.GIT_COMMIT,
	GIT_TREE: process.env.GIT_TREE,
	DEPLOY_ENV: process.env.DEPLOY_ENV,
};

function withEnv(values: Record<string, string>, fn: () => Promise<void>) {
	return (async () => {
		Object.assign(process.env, values);
		try {
			await fn();
		} finally {
			Object.assign(process.env, saved);
		}
	})();
}

const sha = (char: string) => char.repeat(40);

describe("readiness is gated only on minimum viable service", () => {
	it("is ready when the database answers and the build is identified", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b"), DEPLOY_ENV: "staging" }, async () => {
			const report = await readinessReport(deps());
			expect(report.ready).toBe(true);
			expect(report.status).toBe("ok");
			expect(report.blocked).toBe(false);
			expect(report.degraded).toBe(false);
		});
	});

	it("is NOT taken down by a stale backup", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(
				deps({ now: () => 100 * HOUR, latestBackupMs: () => 1 * HOUR }),
			);
			expect(report.ready).toBe(true);
			expect(report.status).toBe("ok");
			expect(report.degraded).toBe(true);
			const backups = report.checks.find((check) => check.name === "backups");
			expect(backups?.status).toBe("fail");
			expect(backups?.role).toBe("diagnostic");
			expect(readinessProbe(report).ok).toBe(true);
		});
	});

	it("is NOT taken down by a paused job runner", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(
				deps({ now: () => 100 * HOUR, lastTickMs: () => 1 * HOUR }),
			);
			expect(report.ready).toBe(true);
			expect(report.checks.find((check) => check.name === "jobs")?.status).toBe("fail");
			expect(report.degraded).toBe(true);
		});
	});

	it("is NOT taken down by a recorded job error", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(deps({ lastError: () => "mail: relay refused" }));
			expect(report.ready).toBe(true);
			expect(report.checks.find((check) => check.name === "jobs")?.status).toBe("warn");
		});
	});

	it("is taken down when the database probe throws, and keeps the reason internal", async () => {
		const report = await readinessReport(
			deps({
				probeDatabase: async () => {
					throw new Error("SQLITE_PATH=/srv/secret is readonly");
				},
			}),
		);
		expect(report.ready).toBe(false);
		expect(report.status).toBe("unavailable");
		expect(report.checks.find((check) => check.name === "database")?.detail).toContain("readonly");

		const probe = JSON.stringify(readinessProbe(report));
		expect(probe).not.toContain("SQLITE_PATH");
		expect(probe).not.toContain("secret");
		expect((JSON.parse(probe) as { checks: Record<string, string> }).checks.database).toBe("fail");
	});

	it("fails on a schema older than this build requires", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(
				deps({ probeSchema: async () => ({ applied: 1, required: 2 }) }),
			);
			expect(report.ready).toBe(false);
			const schema = report.checks.find((check) => check.name === "schema");
			expect(schema?.status).toBe("fail");
			expect(schema?.detail).toContain("1");
		});
	});

	it("accepts a schema at or newer than this build", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			expect(
				(await readinessReport(deps({ probeSchema: async () => ({ applied: 2, required: 2 }) })))
					.ready,
			).toBe(true);
			expect(
				(await readinessReport(deps({ probeSchema: async () => ({ applied: 5, required: 2 }) })))
					.ready,
			).toBe(true);
		});
	});

	it("warns, but stays ready, when the schema version cannot be read", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(
				deps({
					probeSchema: async () => {
						throw new Error("no such pragma");
					},
				}),
			);
			expect(report.ready).toBe(true);
			expect(report.checks.find((check) => check.name === "schema")?.status).toBe("warn");
		});
	});

	it("stays ready for a source build but reports it as degraded", async () => {
		await withEnv({ GIT_COMMIT: "", GIT_TREE: "" }, async () => {
			const report = await readinessReport(deps());
			expect(report.ready).toBe(true);
			expect(report.identity.commit).toBe("");
			expect(report.checks.find((check) => check.name === "identity")?.status).toBe("warn");
			expect(report.degraded).toBe(true);
		});
	});
});

describe("fresh startup and jobs disabled", () => {
	it("is ready immediately after boot, before the first backup exists", async () => {
		await withEnv({ GIT_COMMIT: sha("a"), GIT_TREE: sha("b") }, async () => {
			const report = await readinessReport(
				deps({ lastTickMs: () => 0, latestBackupMs: () => 0, now: () => 1_000 }),
			);
			// The runner has not ticked and there is no archive: fresh startup must
			// still serve, because the first tick is up to a minute away.
			expect(report.ready).toBe(true);
			expect(report.checks.find((check) => check.name === "backups")?.status).toBe("ok");
			expect(report.checks.find((check) => check.name === "jobs")?.status).toBe("fail");
		});
	});

	it("is ready on staging with jobs intentionally disabled", async () => {
		await withEnv(
			{ GIT_COMMIT: sha("a"), GIT_TREE: sha("b"), DEPLOY_ENV: "staging" },
			async () => {
				const report = await readinessReport(
					deps({ expectJobs: false, lastTickMs: () => 0, latestBackupMs: () => 0 }),
				);
				expect(report.ready).toBe(true);
				expect(report.degraded).toBe(false);
				expect(report.checks.find((check) => check.name === "jobs")?.status).toBe("ok");
				const probe = readinessProbe(report);
				expect(probe.ok).toBe(true);
				expect(probe.environment).toBe("staging");
			},
		);
	});
});

describe("readiness probe", () => {
	it("never serialises a detail, a commit SHA or a path", async () => {
		await withEnv(
			{ GIT_COMMIT: sha("c"), GIT_TREE: sha("d"), DEPLOY_ENV: "production" },
			async () => {
				const report = await readinessReport(
					deps({
						probeDatabase: async () => {
							throw new Error("/app/data/portal.db is locked");
						},
					}),
				);
				const probe = JSON.stringify(readinessProbe(report));
				expect(probe).not.toContain("/app/data");
				expect(probe).not.toContain("locked");
				expect(probe).not.toContain(sha("c"));
				const parsed = JSON.parse(probe) as Record<string, unknown>;
				expect(parsed).toMatchObject({
					ok: false,
					status: "unavailable",
					service: "web",
					environment: "production",
				});
				expect((parsed.build as string).length).toBe(16);
			},
		);
	});

	it("reports an empty build for a source build", async () => {
		await withEnv({ GIT_COMMIT: "", GIT_TREE: "" }, async () => {
			const report = await readinessReport(deps());
			expect(report.fingerprint).toBe("");
			expect(report.identity.kind).toBe("unknown");
		});
	});

	it("carries render-cache size only when supplied", async () => {
		const report = await readinessReport(deps());
		expect(readinessProbe(report).renderCache).toBeUndefined();
		expect(readinessProbe(report, { entries: 2, bytes: 10 }).renderCache).toEqual({
			entries: 2,
			bytes: 10,
		});
	});
});
