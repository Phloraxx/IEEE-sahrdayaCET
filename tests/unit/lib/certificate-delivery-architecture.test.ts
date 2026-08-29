import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const issuance = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance.pb.js"), "utf8");
const delivery = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery.pb.js"), "utf8");
const helpers = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-delivery-helpers.js"), "utf8");
const notifications = readFileSync(resolve(process.cwd(), "pb_hooks/notification-helpers.js"), "utf8");
const adminOperations = readFileSync(resolve(process.cwd(), "pb_hooks/admin-operations-helpers.js"), "utf8");
const deliveryMigration = readFileSync(resolve(process.cwd(), "pb_migrations/202608290003_certificate_delivery_outbox.js"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/features/admin/events/certificate-delivery-panel.tsx"), "utf8");

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

  it("renders Send and delivery as a separate admin surface", () => {
    expect(panel).toContain('title="Send & delivery"');
    expect(panel).toContain("Queue {queueableCount} email");
    expect(panel).toContain("Retry failed");
    expect(panel).toContain("canSend");
  });
});
