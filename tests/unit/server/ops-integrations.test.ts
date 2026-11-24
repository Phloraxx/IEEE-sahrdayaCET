import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyIntegrationGuard, integrationReport } from "../../../src/server/integrations.server";
import {
	getConfig,
	isProductionDeployment,
	paymentConfigured,
	paygateActive,
	setIsSandboxOverride,
	webhookConfigured,
} from "../../../src/server/payments/paygate";

const KEYS = [
	"DEPLOY_ENV",
	"PAYGATE_URL",
	"PAYGATE_API_KEY",
	"PAYGATE_WEBHOOK_SECRET",
	"PAYGATE_SANDBOX",
	"MAIL_DELIVERY_MODE",
	"SMTP_HOST",
	"SMTP_USERNAME",
] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function isolate(values: Partial<Record<(typeof KEYS)[number], string>>) {
	for (const key of KEYS) delete process.env[key];
	Object.assign(process.env, values);
	setIsSandboxOverride(null);
}

beforeEach(() => {
	isolate({});
});

afterEach(() => {
	for (const key of KEYS) {
		const value = saved[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	setIsSandboxOverride(null);
});

const LONG_KEY = "k".repeat(40);
const LONG_SECRET = "s".repeat(40);
const LIVE_ENDPOINT = "https://paygate.example.com";

/** Exactly what a staging stack would see if it inherited production's .env. */
const INHERITED_PRODUCTION = {
	DEPLOY_ENV: "staging",
	PAYGATE_URL: LIVE_ENDPOINT,
	PAYGATE_API_KEY: LONG_KEY,
	PAYGATE_WEBHOOK_SECRET: LONG_SECRET,
	SMTP_HOST: "smtp.gmail.com",
	SMTP_USERNAME: "prod-relay@ieeesahrdaya.com",
} as const;

describe("environment scoping", () => {
	it("treats DEPLOY_ENV as the only declaration of production", () => {
		isolate({ DEPLOY_ENV: "production" });
		expect(isProductionDeployment()).toBe(true);
		isolate({ DEPLOY_ENV: "Production" });
		expect(isProductionDeployment()).toBe(true);
		isolate({ DEPLOY_ENV: "staging" });
		expect(isProductionDeployment()).toBe(false);
		isolate({});
		expect(isProductionDeployment()).toBe(false);
	});
});

describe("production may act", () => {
	it("permits initiation and webhooks with a configured live endpoint", () => {
		isolate({
			DEPLOY_ENV: "production",
			PAYGATE_URL: LIVE_ENDPOINT,
			PAYGATE_API_KEY: LONG_KEY,
			PAYGATE_WEBHOOK_SECRET: LONG_SECRET,
		});
		const config = getConfig();
		expect(config.production).toBe(true);
		expect(paymentConfigured(config)).toBe(true);
		expect(webhookConfigured(config)).toBe(true);
		expect(paygateActive(config)).toBe(true);
		expect(integrationReport().find((r) => r.name === "paygate")?.status).toBe("configured");
	});

	it("does not need PAYGATE_SANDBOX in production", () => {
		isolate({
			DEPLOY_ENV: "production",
			PAYGATE_URL: LIVE_ENDPOINT,
			PAYGATE_API_KEY: LONG_KEY,
			PAYGATE_SANDBOX: "false",
		});
		expect(paymentConfigured(getConfig())).toBe(true);
	});

	it("is still blocked in production without an endpoint or key", () => {
		isolate({ DEPLOY_ENV: "production", PAYGATE_URL: LIVE_ENDPOINT, PAYGATE_API_KEY: "short" });
		expect(paymentConfigured(getConfig())).toBe(false);
	});
});

describe("staging with inherited production defaults", () => {
	it("refuses initiation, webhooks and status alike", () => {
		isolate(INHERITED_PRODUCTION);
		const config = getConfig();
		expect(config.production).toBe(false);
		expect(paymentConfigured(config)).toBe(false);
		expect(webhookConfigured(config)).toBe(false);
		expect(paygateActive(config)).toBe(false);
	});

	it("reports PayGate as blocked with a reason an operator can act on", () => {
		isolate(INHERITED_PRODUCTION);
		applyIntegrationGuard();
		const paygate = integrationReport().find((r) => r.name === "paygate");
		expect(paygate?.status).toBe("blocked");
		expect(paygate?.reason).toContain("PAYGATE_SANDBOX");
	});

	it("names a half-configured webhook secret separately", () => {
		isolate({ ...INHERITED_PRODUCTION, PAYGATE_WEBHOOK_SECRET: LONG_SECRET });
		const blocked = integrationReport().filter(
			(r) => r.name === "paygate" && r.status === "blocked",
		);
		expect(blocked.length).toBeGreaterThanOrEqual(1);
	});

	it("permits everything once a sandbox is declared", () => {
		isolate({ ...INHERITED_PRODUCTION, PAYGATE_SANDBOX: "true" });
		const config = getConfig();
		expect(paymentConfigured(config)).toBe(true);
		expect(webhookConfigured(config)).toBe(true);
		expect(integrationReport().find((r) => r.name === "paygate")?.status).toBe("configured");
	});

	it("refuses even a declared sandbox without a usable key", () => {
		isolate({
			DEPLOY_ENV: "staging",
			PAYGATE_URL: LIVE_ENDPOINT,
			PAYGATE_API_KEY: "short",
			PAYGATE_SANDBOX: "true",
		});
		expect(paymentConfigured(getConfig())).toBe(false);
	});

	it("is disabled, not blocked, when nothing is configured", () => {
		isolate({ DEPLOY_ENV: "staging" });
		expect(integrationReport().find((r) => r.name === "paygate")?.status).toBe("disabled");
	});
});

describe("staging mail cannot deliver with production defaults", () => {
	it("refuses live delivery", () => {
		isolate({ ...INHERITED_PRODUCTION, MAIL_DELIVERY_MODE: "live" });
		expect(integrationReport().find((r) => r.name === "mail")?.status).toBe("blocked");
	});

	it("describes allowlist/redirect as rewritten, never a real recipient", () => {
		for (const mode of ["allowlist", "redirect"]) {
			isolate({ ...INHERITED_PRODUCTION, MAIL_DELIVERY_MODE: mode });
			const mail = integrationReport().find((r) => r.name === "mail");
			expect(mail?.status).toBe("configured");
			expect(mail?.reason).toContain("never go to the real recipient");
		}
	});

	it("is disabled by default", () => {
		isolate(INHERITED_PRODUCTION);
		expect(integrationReport().find((r) => r.name === "mail")?.status).toBe("disabled");
	});

	it("permits live delivery in production", () => {
		isolate({ DEPLOY_ENV: "production", SMTP_HOST: "smtp.gmail.com", MAIL_DELIVERY_MODE: "live" });
		expect(integrationReport().find((r) => r.name === "mail")?.status).toBe("configured");
	});
});

describe("what the guard never does", () => {
	it("reads no credential value back into its report", () => {
		isolate({
			...INHERITED_PRODUCTION,
			MAIL_DELIVERY_MODE: "live",
		});
		applyIntegrationGuard();
		const text = JSON.stringify(integrationReport());
		expect(text).not.toContain(LONG_KEY);
		expect(text).not.toContain(LONG_SECRET);
		expect(text).not.toContain("prod-relay@ieeesahrdaya.com");
	});
});
