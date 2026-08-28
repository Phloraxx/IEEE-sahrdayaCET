import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("execom architecture invariants", () => {
  it("keeps the homepage execom intentionally hardcoded", () => {
    const homepage = read("src/components/Execom.tsx");
    expect(homepage).toContain('image: "/Execom/midhun-pm/midhun-pm.jpg"');
    expect(homepage).toContain('portfolio: "https://midhunpm.in"');
    expect(homepage).not.toContain("fetchExecomData");
  });

  it("drives the full directory portfolio from PocketBase", () => {
    const client = read("src/features/execom/ExecomClient.tsx");
    const reader = read("src/server/public/execom.server.ts");
    expect(client).not.toContain("PORTFOLIO_BY_MEMBER_NAME");
    expect(client).not.toContain("midhunpm.in");
    expect(client).toContain("href={member.portfolio}");
    expect(client).toContain("Open profile for ${member.name}");
    expect(reader).toContain("linkedin,instagram,portfolio");
    expect(reader).toContain("portfolio: record.portfolio");
    expect(client).toContain("...Array.from(remaining).sort()");
    expect(client).toContain('useState("all")');
    expect(client).toContain('type ViewMode = "grid" | "roster"');
    expect(client).toContain('data-testid="execom-grid"');
    expect(client).toContain('data-testid="execom-roster"');
    expect(client).toContain('placeholder="Search the roster…"');
  });

  it("keeps member-specific structured data off the directory route", () => {
    const route = read("src/routes/full-execom.tsx");
    expect(route).not.toContain("midhunPersonSchema");
    expect(route).not.toContain('"@type": "Person"');
  });

  it("defines and edits portfolio through the PocketBase schema", () => {
    const baseline = read("pb_migrations/202607200000_baseline_schema.js");
    const migration = read("pb_migrations/202608030001_execom_portfolio.js");
    const form = read("src/features/admin/execom/execom-form.tsx");
    expect(baseline).toContain('{ type: "url", name: "portfolio" }');
    expect(migration).toContain('new URLField({ name: "portfolio" })');
    expect(form).toContain('fd.set("portfolio", form.portfolio.trim())');
    expect(form).toContain('id="ex-portfolio"');
  });
});
