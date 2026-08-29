import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = read("src/routes/admin.events.$id.tsx");
const panel = read("src/features/admin/events/certificate-template-panel.tsx");
const client = read("src/lib/data/certificate-templates.client.ts");
const permissions = read("pb_hooks/admin-operations-helpers.js");

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

  it("keeps publication separate from future recipient issuance", () => {
    expect(panel).toContain("Save draft");
    expect(panel).toContain("Publish");
    expect(panel).not.toContain("Issue certificates");
    expect(panel).not.toContain("Send certificates");
  });
});
