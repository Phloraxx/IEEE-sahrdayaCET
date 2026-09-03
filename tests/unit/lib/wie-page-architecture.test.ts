import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventHref } from "@/features/societies/wie/WIEActivitySection";

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
    type EventInput = Parameters<typeof eventHref>[0];
    expect(eventHref({ slug: "witech-2026" } as EventInput)).toBe(
      "/events/witech-2026",
    );
    expect(eventHref({ slug: "" } as EventInput)).toBe("/events");

    const activity = read("src/features/societies/wie/WIEActivitySection.tsx");
    expect(activity).not.toContain("Hover Popup Overlay");
    expect(activity).not.toContain("group-hover:pointer-events-auto");
  });

  it("does not mix Infinia or the funding request into public WIE copy", () => {
    const publicCopy = [
      read("src/features/societies/wie/WIEPage.tsx"),
      read("src/features/societies/wie/WIEActivitySection.tsx"),
      read("src/features/societies/wie/WIETeamContactSections.tsx"),
    ].join("\n").toLowerCase();
    expect(publicCopy).not.toContain("infinia");
    expect(publicCopy).not.toContain("funding");
  });

  it("retains curated and designed-fallback media states", () => {
    const activity = read("src/features/societies/wie/WIEActivitySection.tsx");
    const media = read("src/lib/wie-media.ts");
    const eventRoute = read("src/routes/events.$slug.tsx");
    expect(activity).toContain("No public activity has been published yet.");
    expect(activity).toContain("getWieEventArtwork(event.slug, event.bannerUrl)");
    expect(media).toContain("DESIGNED_FALLBACK_WIE_EVENT_SLUGS");
    expect(media).toContain('"witech-ideathon-2026-agentic-ai"');
    expect(eventRoute).toContain("resolveEventArtwork(event)");
    expect(eventRoute).not.toContain('from "@/lib/wie-media"');
    expect(activity).toContain("aria-label={`${event.title} event artwork`}");
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
