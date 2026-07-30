import { describe, expect, it } from "vitest";
import {
  estimateBlogReadMinutes,
  hasReadableBlogContent,
  normalizeBlogSlug,
  resolveBlogPublishedAt,
  sanitizeBlogCoverUrl,
  sanitizeBlogHtml,
} from "../../../src/lib/blog-content";

describe("blog content helpers", () => {
  it("preserves editor formatting while stripping executable HTML", () => {
    const result = sanitizeBlogHtml(
      '<p>Hello <strong>world</strong></p><script>alert(1)</script><img src=x onerror="alert(2)">',
    );

    expect(result).toContain("<p>Hello <strong>world</strong></p>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("demotes legacy article h1 headings so the page title remains the only h1", () => {
    const result = sanitizeBlogHtml("<h1>Legacy section title</h1><p>Body</p>");
    expect(result).toContain("<h2>Legacy section title</h2>");
    expect(result).not.toContain("<h1>");
  });

  it("accepts only HTTP(S) cover URLs", () => {
    expect(sanitizeBlogCoverUrl("https://example.com/cover.jpg")).toBe(
      "https://example.com/cover.jpg",
    );
    expect(sanitizeBlogCoverUrl("http://example.com/cover.jpg")).toBe(
      "http://example.com/cover.jpg",
    );
    expect(sanitizeBlogCoverUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeBlogCoverUrl("data:image/svg+xml,<svg></svg>")).toBe("");
    expect(sanitizeBlogCoverUrl("ftp://example.com/cover.jpg")).toBe("");
  });

  it("removes unsafe link protocols and hardens allowed links", () => {
    const result = sanitizeBlogHtml(
      '<p><a href="javascript:alert(1)" target="_blank">bad</a><a href="https://ieee.org" target="_blank">good</a></p>',
    );

    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="https://ieee.org"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("distinguishes formatting-only HTML from readable article content", () => {
    expect(hasReadableBlogContent("<p><br></p><hr>")).toBe(false);
    expect(hasReadableBlogContent("<p>Readable story</p>")).toBe(true);
  });

  it("estimates a minimum one-minute reading time", () => {
    expect(estimateBlogReadMinutes("<p>Hello world</p>")).toBe(1);
    expect(estimateBlogReadMinutes(`<p>${"word ".repeat(401)}</p>`)).toBe(3);
  });

  it("normalizes slugs consistently", () => {
    expect(normalizeBlogSlug("  Hello, IEEE Sahrdaya!  ")).toBe("hello-ieee-sahrdaya");
  });

  it("sets a publication date only on the first publish transition", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const first = resolveBlogPublishedAt({
      nextPublished: true,
      existingPublished: false,
      now,
    });
    expect(first).toBe("2026-07-21 12:00:00.000Z");

    const stable = resolveBlogPublishedAt({
      nextPublished: true,
      existingPublished: true,
      existingPublishedAt: "2026-07-01 08:00:00.000Z",
      now,
    });
    expect(stable).toBe("2026-07-01 08:00:00.000Z");
  });
});
