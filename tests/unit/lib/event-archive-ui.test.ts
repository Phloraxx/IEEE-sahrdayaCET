import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("event programme UI", () => {
  it("opens with a compact programme schedule while keeping the complete index searchable and bounded", () => {
    const source = read("src/features/events/EventsPageClient.tsx");

    expect(source).not.toContain("EventHeroSection");
    expect(source).not.toContain("function FeaturedEvent");
    expect(source).toContain('title="Upcoming programme"');
    expect(source).toContain('const ARCHIVE_PAGE_SIZE = 10');
    expect(source).toContain('useState<ArchiveFilter>("past")');
    expect(source).toContain('placeholder="Search events"');
    expect(source).toContain('const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const');
    expect(source).toContain('aria-label="Filter by society"');
    expect(source).toContain('visibleArchiveEvents = filteredArchiveEvents.slice(0, visibleArchiveCount)');
    expect(source).toContain("archiveGroups");
    expect(source).toContain("Past, present, next.");
    expect(source).toContain("Show more");
    expect(source).not.toContain("InfiniaTeaserSection");

    const route = read("src/routes/events.tsx");
    expect(route).toContain("const appUrl = APP_URL;");
    expect(route).not.toContain('typeof window !== "undefined" ? window.location.origin : APP_URL');
  });

  it("opens real event pages directly and keeps them crawlable", () => {
    const client = read("src/features/events/EventsPageClient.tsx");
    const list = read("src/components/events/EventListSection.tsx");
    const card = read("src/components/events/AnnotatedEventCard.tsx");
    const detailRoute = read("src/routes/events.$slug.tsx");

    expect(client).not.toContain("EventDetailModal");
    expect(client).not.toContain("selectedEventId");
    expect(list).not.toContain("onSelectEvent: (event: ExtendedEvent) => void");
    expect(card).toContain("to={\`/events/\${event.slug}\`}");
    expect(card).not.toContain("e.preventDefault()");
    expect(card).not.toContain("onSelect(event)");

    expect(detailRoute).toContain("fetchEventBySlug");
    expect(detailRoute).toContain('rel="canonical"');
    expect(detailRoute).toContain('type="application/ld+json"');
    expect(detailRoute).toContain("Reserve your place");
    expect(detailRoute).toContain("eventArtwork ? (");
    expect(detailRoute).toContain("EventArtworkPreview");
    expect(detailRoute).toContain("EventBannerFallback");
    expect(detailRoute).toContain('data-testid="event-programme-hero"');
  });

  it("uses a light responsive schedule with inline artwork and no duplicated preview rail", () => {
    const list = read("src/components/events/EventListSection.tsx");
    const card = read("src/components/events/AnnotatedEventCard.tsx");
    const styles = read("src/styles/events.css");
    const fallback = read("src/components/events/EventBannerFallback.tsx");
    const artworkPreview = read("src/components/events/EventArtworkPreview.tsx");
    const barrel = read("src/components/events/index.ts");

    expect(barrel).not.toContain("EventHeroSection");
    expect(list).toContain("Live programme");
    expect(list).toContain('aria-live="polite"');
    expect(list).not.toContain("activeEventId");
    expect(list).not.toContain("Programme preview");
    expect(list).not.toContain("AnimatePresence");
    expect(list).not.toContain("aspect-[4/5]");
    expect(card).toContain("formatEventTime");
    expect(card).toContain("Time TBA");
    expect(card).toContain("EventArtworkPreview");
    expect(card).toContain("EventBannerFallback");
    expect(card).toContain("data-next");
    expect(card).not.toContain("onActivate");
    expect(styles).not.toContain("event-programme-hero");
    expect(styles).not.toContain("event-programme-grid");
    expect(fallback).toContain("SOCIETY_COLORS");
    expect(fallback).not.toContain("bg-linear-to-br");
    expect(artworkPreview).toContain("object-contain");
    expect(artworkPreview).toContain("blur-2xl");
  });
});
