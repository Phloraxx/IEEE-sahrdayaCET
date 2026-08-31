import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const issuance = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance.pb.js"), "utf8");
const delivery = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery.pb.js"), "utf8");
const helpers = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery-helpers.js"), "utf8");
const notifications = readFileSync(resolve(process.cwd(), "pb_hooks/notification-helpers.js"), "utf8");
const adminOperations = readFileSync(resolve(process.cwd(), "pb_hooks/admin-operations-helpers.js"), "utf8");
const deliveryMigration = readFileSync(resolve(process.cwd(), "pb_migrations/202608290003_certificate_delivery_outbox.js"), "utf8");
const observabilityMigration = readFileSync(resolve(process.cwd(), "pb_migrations/202608300001_certificate_delivery_observability.js"), "utf8");
const mailProvider = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-mail-provider.js"), "utf8");
const mailReadiness = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-mail-readiness.js"), "utf8");
const compose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");
const deliveryClient = readFileSync(resolve(process.cwd(), "src/lib/data/certificate-delivery.client.ts"), "utf8");
const mailEvents = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-mail-events.js"), "utf8");
const resendWebhook = readFileSync(resolve(process.cwd(), "src/routes/api.webhooks.resend.ts"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/features/admin/events/certificate-delivery-panel.tsx"), "utf8");
const releasePreflight = readFileSync(resolve(process.cwd(), "scripts/certificate-release-preflight.sh"), "utf8");
const productionRunbook = readFileSync(resolve(process.cwd(), "docs/certificate-production-runbook.md"), "utf8");

describe("certificate delivery architecture", () => {
  it("keeps Issue free of outbox or send behavior", () => {
    expect(issuance).not.toContain("notification_outbox");
    expect(issuance).not.toContain("certificate.batch-send");
    expect(delivery).toContain("/certificate-batches/{batchId}/send");
  });

  it("requires an explicit send capability for outbound delivery commands", () => {
    expect(helpers).toContain('"certificates.send"');
    expect(delivery).toContain('h.routeContext($app, e, "send")');
    expect(adminOperations).toContain('"certificates.send"');
  });

  it("deduplicates one outbox job per immutable certificate", () => {
    expect(helpers).toContain('"certificate:" + certificate.id');
    expect(helpers).toContain('record.set("certificate", certificate.id)');
    expect(helpers).toContain('record.set("registration", certificate.getString("registration"))');
  });

  it("indexes certificate delivery jobs directly by batch for reconciliation", () => {
    expect(deliveryMigration).toContain('name: "certificateBatch"');
    expect(deliveryMigration).toContain('idx_notification_outbox_certificate_batch');
    expect(helpers).toContain('certificateBatch = {:batch}');
    expect(helpers).toContain('record.set("certificateBatch", certificate.getString("batch"))');
    expect(helpers).not.toContain('certificate.batch = {:batch}');
    expect(helpers).not.toContain('\n      "created",\n      0,');
  });

  it("reuses the established mail safety worker and public credential resources", () => {
    expect(notifications).toContain('kind === "certificate"');
    expect(helpers).toContain('require(__hooks + "/mail-delivery.js").prepare');
    expect(helpers).toContain('verificationUrl + "/certificate.pdf"');
    expect(helpers).not.toContain("renderBase");
    expect(helpers).not.toContain("sourceBackground");
  });

  it("keeps test-email provider sends independent of an outbox record", () => {
    expect(mailProvider).toContain('{ name: "mode", value: "test" }');
    expect(mailProvider).toContain("sendWithResend(delivery, key, record.id)");
    expect(mailProvider).toContain('sendWithResend(delivery, "certificate-test:" + $security.randomString(24), "")');
  });

  it("distinguishes transport acceptance from provider-confirmed delivery", () => {
    expect(observabilityMigration).toContain('name: "providerStatus"');
    expect(observabilityMigration).toContain('name: "deliveredCount"');
    expect(observabilityMigration).toContain('name: "mail_delivery_events"');
    expect(mailProvider).toContain('CERTIFICATE_MAIL_PROVIDER');
    expect(mailProvider).toContain('"Idempotency-Key"');
    expect(mailEvents).toContain('"email.delivered": "delivered"');
    expect(mailEvents).toContain('"email.bounced": "bounced"');
    expect(resendWebhook).toContain('verifyResendWebhook');
    expect(resendWebhook).toContain('svix-signature');
    expect(panel).toContain('label="Delivered"');
    expect(panel).toContain('Accepted by SMTP');
  });


  it("checks mail readiness before certificate jobs are queued", () => {
    expect(delivery).toContain('/certificate-mail/readiness');
    expect(delivery).toContain('"MAIL_NOT_READY"');
    expect(mailReadiness).toContain('readyToQueue: safety.ready && provider.transportReady');
    expect(mailReadiness).toContain('trackingMode: trackingReady ? "delivery_tracked" : "accepted_only"');
    expect(mailReadiness).toContain('smtp.enabled === true');
    expect(mailReadiness).toContain('smtpHost.length > 0');
    expect(mailReadiness).toContain('smtpPort > 0');
    expect(mailReadiness).toContain('validEmail(sender)');
    expect(compose).toContain('RESEND_WEBHOOK_CONFIGURED: ${RESEND_WEBHOOK_SECRET:+1}');
    expect(deliveryClient).toContain('/certificate-mail/readiness');
    expect(panel).toContain('Mail transport ready');
    expect(panel).toContain('Mail not ready');
  });

  it("fails closed on release identity and separates pre-deploy from runtime checks", () => {
    expect(releasePreflight).toContain('EXPECTED_SHA="${EXPECTED_SHA:-}"');
    expect(releasePreflight).toContain('git -C "$REPO_DIR" rev-parse HEAD');
    expect(releasePreflight).toContain('status --porcelain --untracked-files=all');
    expect(releasePreflight).toContain('CHECK_RUNTIME="${CHECK_RUNTIME:-1}"');
    expect(releasePreflight).toContain('PocketBase admin is not public');
    expect(productionRunbook).toContain('CHECK_RUNTIME=0');
    expect(productionRunbook).toContain('CHECK_RUNTIME=1');
    expect(productionRunbook).toContain('CD `TESTED_SHA`');
  });

  it("renders Send and delivery as a separate admin surface", () => {
    expect(panel).toContain('title="Send & delivery"');
    expect(panel).toContain("Queue ${queueableCount} email");
    expect(panel).toContain("Retry failed");
    expect(panel).toContain("canSend");
  });
});
