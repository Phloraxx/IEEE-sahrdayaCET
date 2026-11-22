import { describe, expect, it } from "vitest";
import { htmlToPlainText, sanitizeRichHtml } from "../../../src/lib/rich-text";

describe("rich text helpers", () => {
  it("preserves editor formatting while stripping executable HTML", () => {
    const result = sanitizeRichHtml(
      '<p>Hello <strong>world</strong></p><script>alert(1)</script><img src=x onerror="alert(2)">',
    );

    expect(result).toContain("<p>Hello <strong>world</strong></p>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("demotes legacy article h1 headings so the page title remains the only h1", () => {
    const result = sanitizeRichHtml("<h1>Legacy section title</h1><p>Body</p>");
    expect(result).toContain("<h2>Legacy section title</h2>");
    expect(result).not.toContain("<h1>");
  });

  it("removes unsafe link protocols and hardens allowed links", () => {
    const result = sanitizeRichHtml(
      '<p><a href="javascript:alert(1)" target="_blank">bad</a><a href="https://ieee.org" target="_blank">good</a></p>',
    );

    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="https://ieee.org"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("reduces stored HTML to one line of plain text", () => {
    expect(htmlToPlainText("<p>Two\n  words</p><p>and more</p>")).toBe("Two words and more");
    expect(htmlToPlainText(null)).toBe("");
  });
});
