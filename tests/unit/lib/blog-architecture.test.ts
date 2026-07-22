import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("blog architecture invariants", () => {
  it("keeps public SSR reads credential-free", () => {
    const source = read("src/lib/blog-public.server.ts");
    expect(source).toContain("createPublicPB()");
    expect(source).toContain('collection("blogs").getFullList');
    expect(source).not.toContain("authWithPassword");
    expect(source).not.toContain("superuser");
  });

  it("uses PocketBase rules for content-editor ownership", () => {
    const migration = read("pb_migrations/202607220001_rewrite_access_rules.js");
    expect(migration).toContain('@request.auth.role = "content" && relation = @request.auth.id');
    expect(migration).toContain('@request.body.relation = @request.auth.id');
    expect(migration).toContain('@request.body.relation:changed = false');
  });

  it("keeps admin mutations on the PocketBase SDK instead of a React BFF", () => {
    const client = read("src/lib/admin-blog-client.ts");
    expect(client).toContain('collection("blogs").create');
    expect(client).toContain('collection("blogs").update');
    expect(client).toContain('collection("blogs").delete');
    expect(existsSync(resolve(process.cwd(), "src/routes/api"))).toBe(false);
  });

  it("keeps the full public archive and stable unique slugs", () => {
    const publicSource = read("src/lib/blog-public.server.ts");
    const baseline = read("pb_migrations/202607200000_baseline_schema.js");
    expect(publicSource).toContain("getFullList");
    expect(baseline).toContain("idx_blogs_slug_unique");
  });

  it("renders canonical Article metadata on blog detail pages", () => {
    const route = read("src/routes/blog.$slug.tsx");
    expect(route).toContain('rel="canonical"');
    expect(route).toContain('"@type": "BlogPosting"');
    expect(route).toContain('property: "og:type", content: "article"');
  });
});
