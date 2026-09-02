import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const issuance = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance.pb.js"), "utf8");
const delivery = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery.pb.js"), "utf8");
const helpers = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery-helpers.js"), "utf8");
const notifications = readFileSync(resolve(process.cwd(), "pb_hooks/notification-helpers.js"), "utf8");
const adminOperations = readFileSync(resolve(process.cwd(), "pb_hooks/admin-operations-helpers.js"), "utf8");
const deliveryMigration = readFileSync(resolve(process.cwd(), "pb_migrations/202608290003_certificate_delivery_outbox.js"), "utf8");
const smtpCleanupMigration = readFileSync(resolve(process.cwd(), "pb_migrations/202609020001_smtp_only_certificate_delivery.js"), "utf8");
const mailReadiness = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-mail-readiness.js"), "utf8");
const compose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "src/routes.ts"), "utf8");
const deliveryClient = readFileSync(resolve(process.cwd(), "src/lib/data/certificate-delivery.client.ts"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/features/admin/events/certificate-delivery-panel.tsx"), "utf8");
const releasePreflight = readFileSync(resolve(process.cwd(), "scripts/certificate-release-preflight.sh"), "utf8");
const productionRunbook = readFileSync(resolve(process.cwd(), "docs/certificate-production-runbook.md"), "utf8");

describe("certificate delivery architecture", () => {
  it("keeps Issue separate from SMTP Send", () => {
    expect(issuance).not.toContain("notification_outbox");
    expect(delivery).toContain("/certificate-batches/{batchId}/send");
    expect(helpers).toContain("app.newMailClient().send");
    expect(notifications).toContain('kind === "certificate"');
  });

  it("requires explicit send authorization and stable dedupe", () => {
    expect(helpers).toContain('"certificates.send"');
    expect(delivery).toContain('h.routeContext($app, e, "send")');
    expect(adminOperations).toContain('"certificates.send"');
    expect(deliveryMigration).toContain('name: "certificateBatch"');
    expect(helpers).toContain('"certificate:" + certificate.id');
  });

  it("has no active Resend provider or webhook surface", () => {
    expect(existsSync(resolve(process.cwd(), "pb_hooks/certificate-mail-provider.js"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "pb_hooks/certificate-mail-events.js"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/routes/api.webhooks.resend.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/server/mail/resend-webhook.server.ts"))).toBe(false);
    expect(routes).not.toContain("api/webhooks/resend");
    expect(compose).not.toContain("RESEND_");
    expect(compose).not.toContain("CERTIFICATE_MAIL_PROVIDER");
    expect(compose).not.toContain("CERTIFICATE_MAIL_WEBHOOK_CAPABILITY_KEY");
  });

  it("removes provider-tracking schema that SMTP cannot truthfully populate", () => {
    expect(smtpCleanupMigration).toContain('mail_delivery_events');
    expect(smtpCleanupMigration).toContain('providerMessageId');
    expect(smtpCleanupMigration).toContain('providerStatus');
    expect(smtpCleanupMigration).toContain('deliveredCount');
    expect(smtpCleanupMigration).toContain('deliveryIssueCount');
    expect(smtpCleanupMigration).toContain('CREATE UNIQUE INDEX idx_mail_delivery_events_provider_event');
  });

  it("reports SMTP accepted-only readiness before queueing", () => {
    expect(mailReadiness).toContain('provider: "smtp"');
    expect(mailReadiness).toContain('trackingMode: "accepted_only"');
    expect(mailReadiness).toContain('smtp.enabled === true');
    expect(mailReadiness).toContain('readyToQueue: safety.ready && smtp.transportReady');
    expect(deliveryClient).toContain('/certificate-mail/readiness');
    expect(panel).toContain('Accepted by Gmail SMTP');
    expect(panel).toContain('accepted only');
  });

  it("fails closed on release identity and Gmail SMTP activation", () => {
    expect(releasePreflight).toContain('EXPECTED_SHA="${EXPECTED_SHA:-}"');
    expect(releasePreflight).toContain('status --porcelain --untracked-files=all');
    expect(releasePreflight).toContain('REQUIRE_MAIL_LIVE="${REQUIRE_MAIL_LIVE:-0}"');
    expect(releasePreflight).toContain('production mail mode is explicitly disabled');
    expect(releasePreflight).toContain('Gmail SMTP host is configured');
    expect(releasePreflight).toContain('smtp.gmail.com');
    expect(releasePreflight).toContain('Gmail SMTP uses STARTTLS mode');
    expect(releasePreflight).toContain('PocketBase admin is not public');
    expect(releasePreflight).toContain("sed -E 's/<[^>]+>/ /g'");
    expect(productionRunbook).toContain('smtp.gmail.com');
    expect(productionRunbook).toContain('App Password');
  });
});
