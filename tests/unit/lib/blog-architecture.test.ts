import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blog architecture invariants", () => {
  it("allows both admin and content editors with unique public slugs", () => {
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
    expect(migration).toContain(
      'collection.addIndex("idx_blogs_slug_unique", true, "slug", "")',
    );
    expect(migration).toContain(
      'collection.removeIndex("idx_blogs_slug_unique")',
    );
  });

  it("unpublishes only the exact known legacy test article", () => {
    const migration = read(
      "pb_migrations/202607210002_unpublish_test_blog.js",
    );

    expect(migration).toContain('const TEST_BLOG_ID = "qq8mrrnc6uphmw8"');
    expect(migration).toContain('record.getString("slug") === "test-123"');
    expect(migration).toContain(
      'record.getString("title").trim().toUpperCase() === "TEST"',
    );
    expect(migration).toContain('record.set("published", false)');
    expect(migration).toContain('record.set("published", true)');
  });

  it("syncs migrations without leaving deleted repository files active", () => {
    const compose = read("docker-compose.pb.yml");
    expect(compose).toContain("./pb_migrations:/migrations-src:ro");
    expect(compose).toContain("POCKETBASE_MIGRATION_DIR=/pocketbase/migrations");
    expect(compose).toContain(".repo-managed-migrations");
    expect(compose).toContain('rm -f "/pocketbase/migrations/$$relative_path"');
    expect(compose).toContain("fingerprint_sources");
  });

  it("keeps the inline PocketBase watcher valid POSIX shell", () => {
    const compose = read("docker-compose.pb.yml");
    const marker = "      - |\n";
    const start = compose.indexOf(marker);
    const end = compose.indexOf("\n    environment:", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const shell = compose
      .slice(start + marker.length, end)
      .split("\n")
      .map((line) => line.replace(/^ {8}/, ""))
      .join("\n")
      .replace(/\$\$/g, "$");

    const syntaxCheck = spawnSync("sh", ["-n"], {
      input: shell,
      encoding: "utf8",
    });

    expect(syntaxCheck.status, syntaxCheck.stderr).toBe(0);
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
