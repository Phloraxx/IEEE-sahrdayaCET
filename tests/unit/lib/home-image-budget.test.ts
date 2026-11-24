import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The homepage's cold-load image budget, at the source level. Browser
 * behaviour (SSR sections, no-JS visibility, native lazy loading, gallery
 * derivatives, fallback) is covered by `tests/e2e/home-first-paint.e2e.ts`.
 */
describe("home page cold-load images", () => {
  it("serves Execom portraits from ?w= variants at card size", () => {
    const carousel = read("src/components/Execom.tsx");
    expect(carousel).toContain("buildSrcSet");
    expect(carousel).toContain("PORTRAIT_SIZES");
    expect(carousel).toContain("sizes={portraitSrcSet ? PORTRAIT_SIZES : undefined}");
    // ~200px cards on phones, 270px above `sm`; no larger variant is painted.
    expect(carousel).toContain('const PORTRAIT_SIZES = "(min-width: 640px) 270px, 200px";');

    // The same directory on /full-execom used the original uploads.
    const directory = read("src/features/execom/ExecomClient.tsx");
    expect(directory).toContain("buildSrcSet");
    expect(directory).toContain("EXECOM_PORTRAIT_SIZES");
    // Society member portraits are uploads too.
    expect(read("src/components/societies/SocietyDetailView.tsx")).toContain("buildSrcSet");
  });

  it("keeps the gallery in the document and defers only through native lazy loading", () => {
    const gallery = read("src/components/EventsShowcase.tsx");
    // All three marquee copies stay mounted: no section or copy is withheld
    // from the server document, and no frame is dropped for performance.
    expect(gallery).toContain("const copies = reduceMotion ? [0] : [0, 1, 2];");
    expect(gallery).toContain("loading={eager ? 'eager' : 'lazy'}");
    expect(gallery).toContain("sizes={GALLERY_SIZES}");
    expect(gallery).toContain("(min-width: 640px) 260px, 166px");
    // Seven curated frames at the two widths their 166/260px cards can paint.
    expect(gallery.match(/widths: \[320, 480\]/g)).toHaveLength(7);
    // The original stays the `src`, so a missing derivative still renders.
    expect(gallery).toContain("<img src={src} srcSet={srcSet}");
  });

  it("sizes the home lead artwork from upload variants instead of a bare src", () => {
    const news = read("src/components/home/NowAtSahrdaya.tsx");
    expect(news).toContain("buildSrcSet");
    expect(news).toContain("LEAD_VISUAL_SIZES");
    expect(news).toContain('loading="lazy"');
  });

  it("does not defer or omit homepage sections", () => {
    const route = read("src/routes/index.tsx");
    // Every section is server-rendered in document order; nothing mounts on
    // approach, so crawlers and no-JS visitors get the whole page.
    expect(route).toContain("<NowAtSahrdaya events={upcomingEvents}");
    expect(route).toContain("<Execom members={loaderData.coreTeam ?? []} />");
    expect(route).toContain("<EventsShowcase />");
    expect(route).not.toContain("useProximityMount");
    expect(route).not.toContain("HomeSectionPlaceholder");
  });
});
