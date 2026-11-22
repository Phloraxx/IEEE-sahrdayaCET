import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("generic society detail system", () => {
  it("keeps hidden societies and draft/deleted activity out of the public payload", () => {
    // Phase 1: the PocketBase rules became SQL predicates in the repo layer.
    const repo = read("src/server/public/repo.server.ts");
    expect(repo).toContain("is_hidden = 0");
    expect(repo).toContain("status IN ('published', 'completed')");
    expect(repo).toContain("is_deleted = 0");
    // And the society page must not reach PocketBase at all.
    const server = read("src/server/public/society-detail.server.ts");
    expect(server).not.toContain("createPublicPB");
  });

  it("uses the shared profile system without the fabricated advisor quote", () => {
    const view = read("src/components/societies/SocietyDetailView.tsx");
    expect(view).toContain('data-testid="society-profile-hero"');
    expect(view).toContain('id="people"');
    expect(view).toContain('id="activity"');
    expect(view).toContain('to={`/events/${featuredEvent.slug}`}');
    expect(view).toContain("Continue through the directory");
    expect(view).not.toContain("Faculty Advisor Message");
    expect(view).not.toContain("Our goal is to provide a nurturing environment");
  });

  it("keeps WIE on its bespoke route while generic pages use the profile view", () => {
    const genericRoute = read("src/routes/societies_.$slug.tsx");
    const wieRoute = read("src/routes/societies_.wie.tsx");
    expect(genericRoute).toContain("SocietyDetailView");
    expect(genericRoute).toContain("getLatestPublishedBlogsForSociety");
    expect(wieRoute).toContain("WIEPage");
    expect(wieRoute).not.toContain("SocietyDetailView");
  });

  it("reuses directory accent identities for the generic profile system", () => {
    const palette = read("src/lib/society-presentation.ts");
    for (const slug of ["cas", "css", "cs", "edsoc", "embs", "ies", "ias", "npss", "pes", "ras", "sight", "sps", "wie"]) {
      expect(palette).toContain(`${slug}:`);
    }
  });
});
