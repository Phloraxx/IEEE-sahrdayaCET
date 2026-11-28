import { describe, expect, it } from "vitest";
import { isPublicDisplayEvent, isTestOrPlaceholderEvent } from "@/lib/public-event-filter";

describe("public event filter", () => {
  it("filters out staging test records and empty placeholder stubs", () => {
    expect(
      isTestOrPlaceholderEvent({
        title: "tess",
        slug: "tess",
        venue: "sa",
        price: 2,
        date: "2026-09-04T18:03:00.000Z",
        description: "",
      }),
    ).toBe(true);

    expect(
      isTestOrPlaceholderEvent({
        title: "testss",
        slug: "testss",
        venue: "ss",
        price: 2,
        date: "2026-08-18T21:08:00.000Z",
        description: "",
      }),
    ).toBe(true);

    expect(
      isTestOrPlaceholderEvent({
        title: "Midnight QA check",
        slug: "midnight-qa-check",
        venue: "Auditorium",
        price: 2,
        date: "2026-08-18T21:00:00.000Z", // 02:30 IST
        description: "",
        banner: "",
      }),
    ).toBe(true);
  });

  it("keeps real events including short acronyms and low-fee workshops with descriptions", () => {
    expect(
      isPublicDisplayEvent({
        title: "JAM",
        slug: "jam",
        venue: "Seminar Hall",
        price: 0,
        date: "2023-10-15T09:00:00.000Z",
        description: "",
        bannerUrl: "/files/events/1/poster.jpg",
      }),
    ).toBe(true);

    expect(
      isPublicDisplayEvent({
        title: "CUDA Programming Tutorial Workshop",
        slug: "cuda-programming-tutorial-workshop-2026",
        venue: "To be confirmed",
        price: 1,
        date: "2026-09-18T18:30:00.000Z",
        description: "A focused tutorial workshop in collaboration with IEEE EdSoc.",
      }),
    ).toBe(true);
  });
});
