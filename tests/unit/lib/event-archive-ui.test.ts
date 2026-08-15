import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("event archive UI", () => {
  it("keeps a featured/upcoming hierarchy while making the archive searchable and bounded", () => {
    const source = read("src/features/events/EventsPageClient.tsx");

    expect(source).toContain("function FeaturedEvent");
    expect(source).toContain('title="Upcoming events"');
    expect(source).toContain('const ARCHIVE_PAGE_SIZE = 10');
    expect(source).toContain('useState<ArchiveFilter>("past")');
    expect(source).toContain('placeholder="Search events"');
    expect(source).toContain('const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const');
    expect(source).toContain('aria-label="Filter by society"');
    expect(source).toContain('visibleArchiveEvents = filteredArchiveEvents.slice(0, visibleArchiveCount)');
    expect(source).toContain("Show more");
    expect(source).toContain("Explore all events");
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

  it("uses restrained editorial cards and a dedicated archive list", () => {
    const client = read("src/features/events/EventsPageClient.tsx");
    const list = read("src/components/events/EventListSection.tsx");
    const card = read("src/components/events/AnnotatedEventCard.tsx");
    const hero = read("src/components/events/EventHeroSection.tsx");

    expect(client).toContain("function ArchiveRow");
    expect(client).toContain("event-filter-scroll");
    expect(list).toContain('showHeader?: boolean');
    expect(list).toContain('showHeader = true');
    expect(list).toContain('animateCards?: boolean');
    expect(list).toContain('animateCards = true');
    expect(card).not.toContain("font-handwriting");
    expect(hero).not.toContain("animate-marquee");
    expect(hero).toContain("event-display-title");
  });
});
