import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "pb_migrations/202608290002_certificate_issue_invariants.js"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance.pb.js"), "utf8");
const invariants = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-issuance-invariants.pb.js"), "utf8");

describe("certificate issuance architecture", () => {
  it("stores a unique idempotency key and reviewed audience snapshot", () => {
    expect(migration).toContain('name: "idempotencyKey"');
    expect(migration).toContain('name: "audienceSnapshot"');
    expect(migration).toContain("idx_certificate_batches_idempotency");
  });

  it("separates audience preview from the issue command", () => {
    expect(routes).toContain("/certificates/audience/preview");
    expect(routes).toContain("/certificates/issue");
    expect(routes).toContain("AUDIENCE_REVIEW_REQUIRED");
    expect(routes).toContain("AUDIENCE_CHANGED");
  });

  it("does not enqueue or send email during issuance", () => {
    expect(routes).not.toContain("notification_outbox");
    expect(routes).not.toContain("sendMail");
  });

  it("freezes issued batch identity while allowing later delivery counters", () => {
    expect(invariants).toContain("Issued certificate batch audience is immutable");
    expect(invariants).toContain('"audienceFingerprint"');
    expect(invariants).toContain('"audienceSnapshot"');
  });

  it("freezes issued credential identity snapshots", () => {
    expect(invariants).toContain("Issued certificate identity is immutable");
    expect(invariants).toContain('"verificationToken"');
    expect(invariants).toContain('"recipientNameSnapshot"');
    expect(invariants).toContain('"eventTitleSnapshot"');
  });
});
