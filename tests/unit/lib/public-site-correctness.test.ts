import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public site correctness invariants", () => {
  it("uses the same visible 13-society source on Home and the directory", () => {
    const home = read("src/server/public/home.server.ts");
    const directory = read("src/server/public/societies.server.ts");
    const route = read("src/routes/index.tsx");
    const execom = read("src/components/Execom.tsx");
    expect(home).toContain('filter: "isHidden=false"');
    expect(directory).toContain('filter: "isHidden=false"');
    expect(route).toContain("<Execom societyCount={societies.length}");
    expect(execom).toContain('["Societies", societyCount]');
  });

  it("keeps the handpicked Event Showcase explicitly curated", () => {
    const showcase = read("src/components/EventsShowcase.tsx");
    expect(showcase).toContain("const eventImages = [");
    expect(showcase).toContain("'/Events/");
    expect(showcase).not.toContain("fetchEvents(");
  });

  it("renders programme calendar parts with shared India-time helpers", () => {
    const index = read("src/features/events/EventsPageClient.tsx");
    const row = read("src/components/events/AnnotatedEventCard.tsx");
    expect(index).toContain("formatDay(event.date)");
    expect(index).toContain("formatMonthYear(event.date)");
    expect(index).not.toContain("date.getDate()");
    expect(row).toContain("formatWeekdayLong(event.date)");
    expect(row).not.toContain("date.getDate()");
  });
  it("uses structured time-TBC data from schema through public and registration paths", () => {
    const migration = read("pb_migrations/202608280001_event_time_tbc.js");
    const publicEvents = read("src/server/public/events.server.ts");
    const registration = read("src/server/public/registration.server.ts");
    const form = read("src/features/admin/events/event-form.tsx");
    expect(migration).toContain('new BoolField({ name: "timeTbc" })');
    expect(migration).toContain('"hardware-hackathon-2026"');
    expect(publicEvents).toContain("timeTbc");
    expect(registration).toContain("timeTbc");
    expect(form).toContain("Time to be confirmed");
    expect(form).toContain("timeTbc: form.timeTbc");
  });

  it("keeps PocketBase registration/payment expiry semantics aligned with time-TBC events", () => {
    const helper = read("pb_hooks/event-time-helpers.js");
    expect(helper).toContain('event.getBool("timeTbc")');
    for (const path of [
      "pb_hooks/registration-create.pb.js",
      "pb_hooks/registration-status.pb.js",
      "pb_hooks/pricing-preview.pb.js",
    ]) {
      const source = read(path);
      expect(source).toContain('event-time-helpers.js');
      expect(source).toContain('eventTime.eventEndDate(event)');
    }
    expect(existsSync(resolve(process.cwd(), "pb_hooks/coupon-preview.pb.js"))).toBe(false);
  });
});

describe("Home redesign invariants", () => {
  it("uses real Home programme and blog data instead of the old fake bento feed", () => {
    const route = read("src/routes/index.tsx");
    const now = read("src/components/home/NowAtSahrdaya.tsx");
    expect(route).toContain("<NowAtSahrdaya");
    expect(route).toContain("<LatestSignals");
    expect(route).not.toContain("<WhatsHappening");
    expect(now).toContain('to={`/events/${lead.slug}`}');
    expect(route).not.toContain("Call for Papers");
  });

  it("keeps the four-part Home narrative and curated showcase semantics", () => {
    const people = read("src/components/Execom.tsx");
    const showcase = read("src/components/EventsShowcase.tsx");
    const signals = read("src/components/home/LatestSignals.tsx");
    expect(read("src/components/home/NowAtSahrdaya.tsx")).toContain('index="01"');
    expect(people).toContain('index="02"');
    expect(showcase).toContain('index="03"');
    expect(signals).toContain('index="04"');
    expect(showcase).toContain("Deliberately curated visual archive");
    expect(showcase).toContain("Curated selection");
  });

  it("uses data-backed Home people statistics", () => {
    const route = read("src/routes/index.tsx");
    const people = read("src/components/Execom.tsx");
    expect(route).toContain("rosterCount={execomCount}");
    expect(route).toContain("upcomingCount={upcomingCount}");
    expect(people).toContain('["Roster", rosterCount]');
    expect(people).toContain('["Societies", societyCount]');
    expect(people).toContain('["Upcoming", upcomingCount]');
    expect(people).not.toContain("100+");
  });
});

describe("Event detail redesign invariants", () => {
  it("inherits the programme system and always has an artwork surface", () => {
    const detail = read("src/routes/events.$slug.tsx");
    expect(detail).toContain('data-testid="event-programme-hero"');
    expect(detail).toContain("Programme / {formatYear(event.date)}");
    expect(detail).toContain("<EventArtworkPreview");
    expect(detail).toContain("<EventBannerFallback");
    expect(detail).toContain("Programme identity");
  });

  it("keeps registration logic intact and adds a programme handoff", () => {
    const detail = read("src/routes/events.$slug.tsx");
    expect(detail).toContain("getMyEventRegistration(event.id)");
    expect(detail).toContain("registrationAvailable");
    expect(detail).toContain("getEventLifecycleSnapshot(event)");
    expect(detail).toContain("lifecycle.registration.available");
    expect(detail).toContain('data-testid="related-events"');
    expect(detail).toContain("More from the programme.");
    expect(detail).toContain("future.length > 0 ? future");
  });
});
