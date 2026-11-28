/**
 * Integration safety: which outbound integrations may act in this deployment.
 *
 * The repository rule — "never copy production OAuth, payment, SMTP or other
 * integration secrets into staging" — used to be a rule for operators with
 * nothing enforcing it. This module is the enforcement half. It reads *only the
 * environment the process already has*; it never connects to a provider, resolves
 * a hostname or guesses whether a value is live.
 *
 * The rule, revised 2026-11-24 after review:
 *
 *   **Production may act.** `DEPLOY_ENV=production` is where the production
 *   environment file, the production merchant and a real domain are legitimate;
 *   the runtime has no business second-guessing that. `paygate.ts` treats
 *   production as permitted and every non-production deployment as denied until
 *   it declares `PAYGATE_SANDBOX=true`.
 *
 *   **Everything else must declare a sandbox.** Staging that inherited a
 *   production `.env` cannot create real payment sessions, apply their webhooks
 *   or present a pending payment as actionable, until an operator writes
 *   `PAYGATE_SANDBOX=true` against a sandbox endpoint.
 *
 *   **Mail.** `live` is refused outside production by the mail policy whatever
 *   this module says. Here the job is narrower: notice that a non-production
 *   deployment has a non-`disabled` mode *and* a transport, so an inherited
 *   relay is visible in `/admin/data-health` and the boot log rather than
 *   assumed harmless.
 *
 * Nothing here blocks a deployment. A staging box with a wrongly inherited
 * credential still boots, serves public pages and its admin UI; only the
 * specific integration that would spend real money or send real mail refuses,
 * and the reason is reported. Fail closed on the money path, visible everywhere
 * else.
 */

import { getConfig, isProductionDeployment, paymentConfigured, webhookConfigured } from "@/server/payments/paygate";

export type IntegrationStatus = "configured" | "disabled" | "blocked";

export interface IntegrationReport {
	name: "paygate" | "mail";
	status: IntegrationStatus;
	/** Why, in one line. Safe for an authenticated admin, never for a probe. */
	reason: string;
}

function clean(value: unknown): string {
	return String(value ?? "").trim();
}

/** Which integrations are inactive, and why. Pure: reads the environment only. */
export function integrationReport(): IntegrationReport[] {
	const reports: IntegrationReport[] = [];
	const production = isProductionDeployment();
	const config = getConfig();
	const hasEndpoint = Boolean(config.url);
	const hasKey = config.apiKey.length > 0;

	if (!hasEndpoint && !hasKey) {
		reports.push({ name: "paygate", status: "disabled", reason: "no endpoint or API key configured" });
	} else if (production) {
		reports.push({
			name: "paygate",
			status: paymentConfigured(config) ? "configured" : "blocked",
			reason: paymentConfigured(config)
				? "production deployment; a live endpoint is permitted here"
				: "production is missing a usable endpoint or API key",
		});
	} else if (!config.sandbox) {
		reports.push({
			name: "paygate",
			status: "blocked",
			reason: "non-production deployment without PAYGATE_SANDBOX=true; paid initiation, webhooks and status are refused",
		});
	} else {
		reports.push({
			name: "paygate",
			status: "configured",
			reason: "sandbox endpoint declared for this non-production deployment",
		});
	}

	// A webhook secret without a usable config is a half-configured integration
	// worth naming: the route answers 503, so a provider retrying sees failures.
	if (hasKey && config.webhookSecret.length > 0 && !webhookConfigured(config)) {
		reports.push({
			name: "paygate",
			status: "blocked",
			reason: "a webhook secret is present but the deployment cannot act on PayGate, so callbacks are refused",
		});
	}

	const mode = clean(process.env.MAIL_DELIVERY_MODE).toLowerCase() || "disabled";
	const hasSmtp = clean(process.env.SMTP_HOST).length > 0;
	if (mode === "disabled") {
		reports.push({ name: "mail", status: "disabled", reason: "MAIL_DELIVERY_MODE is disabled" });
	} else if (mode === "live" && !production) {
		reports.push({
			name: "mail",
			status: "blocked",
			reason: "live delivery is refused outside production",
		});
	} else if (!hasSmtp) {
		reports.push({ name: "mail", status: "blocked", reason: "no SMTP_HOST configured" });
	} else if (!production) {
		reports.push({
			name: "mail",
			status: "configured",
			reason: `mode ${mode}: messages are rewritten and never go to the real recipient`,
		});
	} else {
		reports.push({ name: "mail", status: "configured", reason: `mode ${mode}` });
	}

	return reports;
}

/**
 * Resolve and report once at boot, before the first request. Safe to call again
 * (a test, a CLI script); nothing is cached beyond the process environment.
 */
export function applyIntegrationGuard(): IntegrationReport[] {
	return integrationReport();
}

/** Short description of a deployment's integrations, for the boot log. */
export function describeIntegrations(reports: IntegrationReport[]): string {
	return reports.map((report) => `${report.name}=${report.status}`).join(" ");
}
