import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("event programme UI", () => {
  it("uses a programme-first hierarchy while keeping the complete index searchable and bounded", () => {
    const source = read("src/features/events/EventsPageClient.tsx");

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
  it("preserves the event modal interaction while keeping crawlable detail routes", () => {
    const client = read("src/features/events/EventsPageClient.tsx");
    const list = read("src/components/events/EventListSection.tsx");
    const card = read("src/components/events/AnnotatedEventCard.tsx");
    const detailRoute = read("src/routes/events.$slug.tsx");

    expect(client).toContain("EventDetailModal");
    expect(client).toContain("selectedEventId");
    expect(client).toContain("setSelectedEventId(event.id)");
    expect(list).toContain("onSelectEvent: (event: ExtendedEvent) => void");
    expect(card).toContain('to={`/events/${event.slug}`}');
    expect(card).toContain("e.preventDefault()");
    expect(card).toContain("onSelect(event)");

    expect(detailRoute).toContain("fetchEventBySlug");
    expect(detailRoute).toContain('rel="canonical"');
    expect(detailRoute).toContain('type="application/ld+json"');
  });

  it("uses a desktop preview, poster-free programme rows, and a compact dark opener", () => {
    const list = read("src/components/events/EventListSection.tsx");
    const card = read("src/components/events/AnnotatedEventCard.tsx");
    const hero = read("src/components/events/EventHeroSection.tsx");
    const fallback = read("src/components/events/EventBannerFallback.tsx");

    expect(list).toContain("activeEventId");
    expect(list).toContain("Programme preview");
    expect(list).toContain("AnimatePresence");
    expect(card).toContain("onActivate");
    expect(card).not.toContain("resolveEventArtwork");
    expect(card).not.toContain("EventBannerFallback");
    expect(card).not.toContain("font-handwriting");
    expect(hero).toContain("event-programme-hero");
    expect(hero).toContain("What&apos;s on");
    expect(hero).not.toContain("event-display-title");
    expect(fallback).toContain("SOCIETY_COLORS");
    expect(fallback).not.toContain("bg-linear-to-br");
  });
});
