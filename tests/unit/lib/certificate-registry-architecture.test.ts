import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-registry.pb.js"), "utf8");
const helpers = readFileSync(resolve(process.cwd(), "pb_hooks/certificate-registry-helpers.js"), "utf8");
const client = readFileSync(resolve(process.cwd(), "src/lib/data/certificate-registry.client.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/routes/admin.certificates.tsx"), "utf8");
const sidebar = readFileSync(resolve(process.cwd(), "src/components/admin/admin-sidebar.tsx"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "src/routes.ts"), "utf8");
const workspacePermissions = readFileSync(resolve(process.cwd(), "src/lib/workspace-permissions.ts"), "utf8");

describe("certificate registry architecture", () => {
  it("keeps the registry behind authenticated certificate visibility", () => {
    expect(route).toContain('/api/app/certificates/registry');
    expect(route).toContain('$apis.requireAuth("users")');
    expect(helpers).toContain('hasEventCapability(app, auth, "certificates.view", event)');
  });

  it("scopes records per event without widening certificate or PII access", () => {
    expect(helpers).toContain('canViewEvent(app, auth, event)');
    expect(helpers).toContain('.hasEventCapability(app, auth, "registrations.view", event)');
    expect(helpers).toContain('.hasEventCapability(app, auth, "certificates.send", event)');
    expect(helpers).toContain('recipientEmail: access.registrationView ?');
    expect(helpers).toContain('lastError: access.send ?');
    expect(helpers).not.toContain('revocationReason:');
    expect(page).not.toContain("revokeCertificate");
    expect(page).not.toContain("supersedeCertificate");
  });

  it("uses the established outbox schema instead of silently masking delivery state", () => {
    expect(helpers).toContain("findRecordsByFilter(\"notification_outbox\", \"kind = 'certificate'\", \"id\", 0, 0)");
    expect(helpers).not.toContain('"-created"');
    expect(helpers).not.toContain('catch (_) { rows = [] }');
  });
  it("supports operational search, filters, pagination and CSV export", () => {
    expect(helpers).toContain('query(e, "search")');
    expect(helpers).toContain('query(e, "delivery")');
    expect(helpers).toContain('perPage = clampInt');
    expect(client).toContain("listAllCertificateRegistry");
    expect(client).toContain("certificateRegistryCsv");
    expect(page).toContain("Export CSV");
    expect(page).toContain("Certificate Registry");
  });

  it("exposes and routes the registry only to workspaces with certificates.view", () => {
    expect(sidebar).toContain('href: "/admin/certificates"');
    expect(sidebar).toContain('capability: "certificates.view"');
    expect(routes).toContain('route("certificates", "routes/admin.certificates.tsx")');
    expect(workspacePermissions).toContain('path === "/admin/certificates"');
    expect(workspacePermissions).toContain('has("certificates.view")');
    expect(page).toContain('capabilities.includes("certificates.view")');
  });

  it("neutralizes spreadsheet-formula prefixes in CSV exports", () => {
    expect(client).toContain(String.raw`/^[\t ]*[=+\-@]/`);
    expect(client).toContain("? `'${text}` : text");
  });
});
