import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("WIE society page architecture", () => {
  it("keeps the WIE page inside the existing society route", () => {
    const route = read("src/routes/societies_.wie.tsx");
    expect(route).toContain('fetchSocietyData("wie")');
    expect(route).toContain('path="/societies/wie"');
    expect(route).toContain("<WIEPage data={data} />");
  });

  it("keeps PocketBase as the public source of WIE events and people", () => {
    const source = read("src/server/public/society-detail.server.ts");
    expect(source).toMatch(/collection\("events"\)[\s\S]*?getFullList/);
    expect(source).toMatch(/collection\("execom"\)[\s\S]*?getFullList/);
    expect(source).toContain(
      "filter: `society = ${escapeFilterValue(society.id)}`",
    );
    expect(source).toContain("id,slug,title,description");
  });

  it("links WIE records to stable event detail routes", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx");
    expect(page).toContain(
      'return event.slug ? `/events/${event.slug}` : "/events"',
    );
    expect(page).not.toContain("Hover Popup Overlay");
    expect(page).not.toContain("group-hover:pointer-events-auto");
  });

  it("does not mix Infinia or the funding request into public WIE copy", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx").toLowerCase();
    expect(page).not.toContain("infinia");
    expect(page).not.toContain("funding");
  });

  it("retains curated and designed-fallback media states", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx");
    const media = read("src/lib/wie-media.ts");
    const eventRoute = read("src/routes/events.$slug.tsx");
    expect(page).toContain("No public activity has been published yet.");
    expect(page).toContain("getWieEventArtwork(event.slug, event.bannerUrl)");
    expect(media).toContain("DESIGNED_FALLBACK_WIE_EVENT_SLUGS");
    expect(media).toContain('"witech-ideathon-2026-agentic-ai"');
    expect(eventRoute).toContain("resolveEventArtwork(event)");
    expect(eventRoute).not.toContain('from "@/lib/wie-media"');
    expect(page).toContain("aria-label={`${event.title} event artwork`}");
  });

  it("uses the latest visible record as the featured activity", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx");
    expect(page).toContain("const featuredEvent = visibleEvents[0]");
    expect(page).not.toContain("find((event) => event.bannerUrl)");
  });

  it("does not publish an unsupported affinity-group code", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx");
    expect(page).not.toContain("SBA65601");
    expect(page).toContain("ACTIVITY ARCHIVE · {archiveYears}");
  });

  it("does not render the unapproved PocketBase society banner", () => {
    const page = read("src/features/societies/wie/WIEPage.tsx");
    const route = read("src/routes/societies_.wie.tsx");
    expect(page).not.toContain("data.society.bannerUrl");
    expect(page).toContain("WIE_OFFICIAL_BANNER_PATH");
    expect(route).toContain("ieee-wie-official-background.webp");
  });
});
