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

  it("syncs migrations without leaving deleted repository files active", () => {
    const compose = read("docker-compose.pb.yml");
    expect(compose).toContain("./pb_migrations:/migrations-src:ro");
    expect(compose).toContain("POCKETBASE_MIGRATION_DIR=/pocketbase/migrations");
    expect(compose).toContain(".repo-managed-migrations");
    expect(compose).toContain('rm -f "/pocketbase/migrations/$$relative_path"');
    expect(compose).toContain("fingerprint_sources");
  });

  it("keeps route and mutation authorization server-enforced", () => {
    const api = read("src/routes/api/-blogs.ts");
    const route = read("src/routes/admin.blogs.tsx");

    expect(api).toContain('requireRole(["admin", "content"], ctx.pb)');
    expect(api).toContain("export const checkBlogEditorAccess");
    expect(api).not.toContain('requireRole(["admin"], ctx.pb)');
    expect(api).not.toContain("published_at: z.string()");
    expect(route).toContain("await checkBlogEditorAccess()");
    expect(route).not.toContain("context as { user?");
  });

  it("enforces published-content and slug invariants on partial updates", () => {
    const source = read("src/routes/api/-blogs.ts");
    expect(source).toContain(
      "const effectivePublished = updateData.published ?? existingPublished",
    );
    expect(source).toContain(
      "if (effectivePublished) assertPublishableContent(effectiveContent)",
    );
    expect(source).toContain("await assertUniqueBlogSlug(ctx.pb, slug, id)");
    expect(source).toContain("A blog post with this slug already exists");
  });

  it("does not cap the public blog archive to the old first 50 posts", () => {
    const source = read("src/routes/api/-blogs.ts");
    expect(source).toContain('collection("blogs").getFullList');
    expect(source).not.toContain('collection("blogs").getList(1, 50');
  });

  it("renders a complete archive and clears stale contextual story state", () => {
    const archive = read("src/features/blog/BlogClientV2.tsx");
    const footer = read("src/components/Footer.tsx");
    const contextual = read("src/components/blog/ContextualBlogLinks.tsx");
    const eventModal = read("src/components/events/EventDetailModal.tsx");

    expect(archive).toContain("All stories");
    expect(archive).toContain("filtered.map((post)");
    expect(footer).toContain("ContextualBlogLinks");
    expect(contextual).toContain("setBlogs([])");
    expect(eventModal).toContain("setRelatedBlogs([])");
  });
});
