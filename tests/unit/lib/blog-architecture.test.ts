import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blog architecture invariants", () => {
  it("allows both admin and content editors in PocketBase blog rules", () => {
    const rules = read("scripts/migrate-pb-rules.ts");
    expect(rules).toContain('published = true || @request.auth.role = "admin" || @request.auth.role = "content"');
    expect(rules).toContain('deleteRule: `@request.auth.role = "admin" || @request.auth.role = "content"`');
  });

  it("keeps server-side blog mutations restricted to admin/content editors", () => {
    const source = read("src/routes/api/-blogs.ts");
    expect(source).toContain('requireRole(["admin", "content"], ctx.pb)');
    expect(source).not.toContain('requireRole(["admin"], ctx.pb)');
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
