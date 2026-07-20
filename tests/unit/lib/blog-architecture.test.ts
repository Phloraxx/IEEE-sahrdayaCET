import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blog architecture invariants", () => {
  it("allows both admin and content editors in PocketBase blog rules", () => {
    const rules = read("scripts/migrate-pb-rules.ts");
    const migration = read("pb_migrations/202607210001_blog_editor_rules.js");

    expect(rules).toContain(
      'published = true || @request.auth.role = "admin" || @request.auth.role = "content"',
    );
    expect(rules).toContain(
      'deleteRule: `@request.auth.role = "admin" || @request.auth.role = "content"`',
    );
    expect(migration).toContain(
      '@request.body.relation = @request.auth.id',
    );
    expect(migration).toContain(
      '@request.body.relation:changed = false',
    );
  });

  it("syncs versioned PocketBase migrations into the runtime migration directory", () => {
    const compose = read("docker-compose.pb.yml");
    expect(compose).toContain("./pb_migrations:/migrations-src:ro");
    expect(compose).toContain("POCKETBASE_MIGRATION_DIR=/pocketbase/migrations");
    expect(compose).toContain("cp -rf /migrations-src/. /pocketbase/migrations/");
    expect(compose).toContain("fingerprint_sources");
  });

  it("keeps server-side blog mutations restricted to admin/content editors", () => {
    const source = read("src/routes/api/-blogs.ts");
    expect(source).toContain('requireRole(["admin", "content"], ctx.pb)');
    expect(source).not.toContain('requireRole(["admin"], ctx.pb)');
    expect(source).not.toContain("published_at: z.string()");
  });

  it("does not cap the public blog archive to the old first 50 posts", () => {
    const source = read("src/routes/api/-blogs.ts");
    expect(source).toContain('collection("blogs").getFullList');
    expect(source).not.toContain('collection("blogs").getList(1, 50');
  });

  it("renders a complete all-stories archive and contextual related-story surfaces", () => {
    const archive = read("src/features/blog/BlogClientV2.tsx");
    const footer = read("src/components/Footer.tsx");
    const eventModal = read("src/components/events/EventDetailModal.tsx");

    expect(archive).toContain("All stories");
    expect(archive).toContain("filtered.map((post)");
    expect(footer).toContain("ContextualBlogLinks");
    expect(eventModal).toContain("Related stories");
  });
});
