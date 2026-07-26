import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("event archive UI", () => {
  it("keeps upcoming events prominent while making the archive searchable and bounded", () => {
    const source = read("src/features/events/EventsPageClient.tsx");

    expect(source).toContain('title="Upcoming Events"');
    expect(source).toContain('const ARCHIVE_PAGE_SIZE = 8');
    expect(source).toContain('useState<ArchiveFilter>("past")');
    expect(source).toContain('placeholder="Search events, venue or society"');
    expect(source).toContain('const ARCHIVE_FILTERS = ["all", "upcoming", "past"] as const');
    expect(source).toContain('aria-label="Filter event archive by society"');
    expect(source).toContain('visibleArchiveEvents = filteredArchiveEvents.slice(0, visibleArchiveCount)');
    expect(source).toContain("Load more events");

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
    expect(client).toContain("onSelectEvent={handleSelectEvent}");
    expect(list).toContain("onSelectEvent: (event: ExtendedEvent) => void");
    expect(card).toContain("onClick={() => onSelect(event)}");

    expect(detailRoute).toContain("fetchEventBySlug");
    expect(detailRoute).toContain('rel="canonical"');
    expect(detailRoute).toContain('type="application/ld+json"');
  });

  it("reuses event cards without rendering a duplicate section heading", () => {
    const client = read("src/features/events/EventsPageClient.tsx");
    const list = read("src/components/events/EventListSection.tsx");

    expect(client).toContain('showHeader={false}');
    expect(client).toContain('animateCards={false}');
    expect(list).toContain('showHeader?: boolean');
    expect(list).toContain('showHeader = true');
    expect(list).toContain('animateCards?: boolean');
    expect(list).toContain('animateCards = true');
    expect(list).toContain('{showHeader && (');
  });
});
