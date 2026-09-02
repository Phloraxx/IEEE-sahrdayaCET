import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "pb_migrations/202608290001_certificate_core.js"),
  "utf8",
);

describe("certificate schema architecture", () => {
  it("creates the three authoritative certificate collections", () => {
    expect(migration).toContain('name: "certificate_templates"');
    expect(migration).toContain('name: "certificate_batches"');
    expect(migration).toContain('name: "certificates"');
  });

  it("keeps certificate collections closed to direct client CRUD", () => {
    const blocks = migration.split("new Collection({").slice(1, 4);
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).toContain("listRule: null");
      expect(block).toContain("viewRule: null");
      expect(block).toContain("createRule: null");
      expect(block).toContain("updateRule: null");
      expect(block).toContain("deleteRule: null");
    }
  });

  it("protects source assets and makes credential identifiers unique", () => {
    expect(migration).toContain('name: "sourceBackground"');
    expect(migration).toContain('name: "sourceSignatures"');
    expect(migration).toContain("protected: true");
    expect(migration).toContain("idx_certificates_credential_id");
    expect(migration).toContain("idx_certificates_verification_token");
    expect(migration).toContain("idx_certificates_active_registration_type");
  });

  it("extends the existing outbox instead of introducing a second queue", () => {
    expect(migration).toContain('findCollectionByNameOrId("notification_outbox")');
    expect(migration).toContain('["ticket", "receipt", "certificate"]');
    expect(migration).toContain('name: "certificate"');
  });

  it("stores correction history without mutating old credentials", () => {
    expect(migration).toContain('name: "supersedes"');
    expect(migration).toContain('name: "supersededBy"');
    expect(migration).toContain('["active", "revoked", "superseded"]');
  });
});
