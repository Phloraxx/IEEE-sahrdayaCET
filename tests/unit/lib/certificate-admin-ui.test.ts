import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = read("src/routes/admin.events.$id.tsx");
const panel = read("src/features/admin/events/certificate-template-panel.tsx");
const client = read("src/lib/data/certificate-templates.client.ts");
const issuancePanel = read("src/features/admin/events/certificate-issuance-panel.tsx");
const issuanceClient = read("src/lib/data/certificate-issuance.client.ts");
const permissions = read("pb_hooks/admin-operations-helpers.js");
const templateRoutes = read("pb_hooks/certificate-templates.pb.js");
const deliveryHelpers = read("pb_hooks/certificate-delivery-helpers.js");

describe("certificate event-admin UI architecture", () => {
  it("keeps certificates inside the existing event workspace", () => {
    expect(route).toContain('"certificates"');
    expect(route).toContain("<CertificateTemplatePanel");
    expect(route).toContain('permissions["certificates.view"]');
  });

  it("exposes the scoped certificate capabilities to event operations", () => {
    for (const capability of ["certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.revoke"]) {
      expect(permissions).toContain(`"${capability}"`);
    }
  });

  it("uses the command surface instead of certificate collection CRUD", () => {
    expect(client).toContain("/api/app/certificate-templates/");
    expect(client).toContain("/api/app/events/");
    expect(client).not.toContain('collection("certificate_templates")');
    expect(client).not.toContain('collection("certificates")');
  });

  it("keeps the editor constrained to dynamic certificate fields", () => {
    expect(panel).toContain("Participant name");
    expect(panel).toContain("Credential ID");
    expect(panel).toContain("Verification QR");
    expect(panel).toContain("Flattened render base");
    expect(panel).toContain("Published artwork is read-only");
  });

  it("keeps template publication separate from reviewed recipient issuance", () => {
    expect(panel).toContain("Save draft");
    expect(panel).toContain("Publish");
    expect(panel).toContain("<CertificateIssuancePanel");
    expect(issuancePanel).toContain("Recipients → Review → Issue");
    expect(issuancePanel).toContain("I confirm these are the people who should receive this certificate, and I reviewed any name-fit warnings above.");
    expect(issuancePanel).toContain("No email has been sent yet.");
  });

  it("keeps test email sample-only, self-addressed, and outside credential/outbox issuance", () => {
    expect(client).toContain("/test-email");
    expect(panel).toContain("TEST / NOT VALID");
    expect(panel).toContain("creates no credential or outbox job");
    expect(templateRoutes).toContain('action: "certificate.template-test-email"');
    expect(deliveryHelpers).toContain('auth.getString("email")');
    expect(deliveryHelpers).toContain('credentialId: "TEST-NOT-VALID"');
    expect(deliveryHelpers).toContain('require(__hooks + "/mail-delivery.js").prepare');
    expect(deliveryHelpers).not.toContain('dedupeKey", "certificate-test:');
  });

  it("surfaces name-fit preflight during template and recipient review", () => {
    expect(panel).toContain("Name-fit review recommended");
    expect(issuancePanel).toContain("Name review");
    expect(issuancePanel).toContain("authoritative renderer still refuses clipping");
    expect(issuanceClient).toContain("renderWarnings");
  });

  it("uses certificate-scoped commands for recipient review and issue", () => {
    expect(issuanceClient).toContain("/certificates/candidates");
    expect(issuanceClient).toContain("/certificates/audience/preview");
    expect(issuanceClient).toContain("/certificates/issue");
    expect(issuanceClient).not.toContain('collection("registrations")');
    expect(issuancePanel).not.toContain("Send certificates");
  });
});
