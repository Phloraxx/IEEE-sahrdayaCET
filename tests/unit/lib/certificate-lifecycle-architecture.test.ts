import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-lifecycle.pb.js"), "utf8");
const helpers = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-lifecycle-helpers.js"), "utf8");
const invariants = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance-invariants.pb.js"), "utf8");
const delivery = readFileSync(resolve(process.cwd(), "src/features/admin/events/certificate-delivery-panel.tsx"), "utf8");
const dialog = readFileSync(resolve(process.cwd(), "src/features/admin/events/certificate-lifecycle-dialog.tsx"), "utf8");

describe("certificate lifecycle architecture", () => {
  it("uses explicit revoke authority for both destructive lifecycle commands", () => {
    expect(helpers).toContain('"certificates.revoke"');
    expect(routes).toContain('/certificates/{certificateId}/revoke');
    expect(routes).toContain('/certificates/{certificateId}/supersede');
    expect(routes).toContain('h.routeContext($app, e)');
  });

  it("keeps lifecycle history verifiable instead of deleting credentials", () => {
    expect(routes).toContain('certificate.set("status", "revoked")');
    expect(routes).toContain('old.set("status", "superseded")');
    expect(routes).not.toContain("delete(");
    expect(invariants).toContain("Issued certificate records cannot be deleted");
    expect(invariants).toContain("Certificate lifecycle history is immutable");
  });

  it("creates replacement credentials without coupling replacement to Send", () => {
    expect(routes).toContain('status: "active"');
    expect(routes).toContain('supersedes: old.id');
    expect(routes).toContain('old.set("supersededBy", replacement.id)');
    expect(helpers).toContain('status: "issued"');
    expect(routes).not.toContain("enqueueCertificate");
    expect(routes).not.toContain("sendCertificateOutbox");
  });

  it("terminates unsent old delivery jobs when validity ends", () => {
    expect(helpers).toContain('row.set("attempts", 8)');
    expect(helpers).toContain('row.set("status", "failed")');
    expect(helpers).toContain('if (!row || row.getString("status") === "sent") return row');
  });

  it("exposes lifecycle controls only for active credentials and warns that replacement is not emailed", () => {
    expect(delivery).toContain('canRevoke && row.certificateStatus === "active"');
    expect(delivery).toContain('mode: "revoke"');
    expect(delivery).toContain('mode: "replace"');
    expect(dialog).toContain("is not emailed automatically");
    expect(dialog).toContain("It is not exposed on the public verification page");
  });
});
