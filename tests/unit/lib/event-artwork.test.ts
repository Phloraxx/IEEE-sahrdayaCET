import { describe, expect, it } from "vitest";
import {
  getEventSocietySlug,
  resolveEventArtwork,
  resolveEventSocialImagePath,
} from "@/lib/event-artwork";

describe("event artwork resolution", () => {
  it("uses the curated WiTech image across public event surfaces", () => {
    const event = {
      slug: "witech-ideathon-2026-agentic-ai",
      bannerUrl: "https://example.test/old-poster.webp",
      society: { slug: "wie" },
    };
    expect(resolveEventArtwork(event)).toEqual({
      src: "/images/wie/witech-feature.webp",
      fit: "cover",
    });
    expect(resolveEventSocialImagePath(event)).toBe(
      "/images/wie/witech-feature.webp",
    );
  });

  it("preserves designed WIE fallbacks instead of weak uploaded media", () => {
    expect(
      resolveEventArtwork({
        slug: "tink-her-hack-3-0",
        bannerUrl: "https://example.test/compressed.webp",
        society: { slug: "WIE" },
      }),
    ).toBeNull();
  });

  it("uses the revised SustainX registration artwork across public event surfaces", () => {
    const event = {
      slug: "sustainx",
      bannerUrl: "https://example.test/old-sustainx-poster.jpeg",
      society: { slug: "sb" },
    };
    expect(resolveEventArtwork(event)).toEqual({
      src: "/media/sustainx/sustainx-campaign-registration.webp",
      fit: "contain",
    });
    expect(resolveEventSocialImagePath(event)).toBe(
      "/media/sustainx/sustainx-campaign-registration.webp",
    );
  });

  it("uses ordinary uploaded banners for other societies", () => {
    const event = {
      slug: "example-event",
      bannerUrl: "https://example.test/banner.webp",
      society: { slug: "cs" },
    };
    expect(getEventSocietySlug(event)).toBe("cs");
    expect(resolveEventArtwork(event)).toEqual({
      src: event.bannerUrl,
      fit: "cover",
    });
  });

  it("uses the official WIE social image when a WIE record has no artwork", () => {
    expect(
      resolveEventSocialImagePath({
        slug: "tink-her-hack-3-0",
        society: { slug: "wie" },
      }),
    ).toBe("/images/wie/ieee-wie-official-background.webp");
  });
});
