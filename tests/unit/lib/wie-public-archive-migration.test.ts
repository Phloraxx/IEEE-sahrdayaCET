import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "pb_migrations/202608020001_wie_public_archive.js"),
  "utf8",
);

const slugs = [
  "witech-ideathon-2026-agentic-ai",
  "beyond-business-building-a-brand-with-a-unique-identity",
  "gen-ai-prompt-engineering-workshop-2026",
  "pioneering-safe-cyberspace-bridging-technology-and-light-for-security",
  "cyberclash-debate-the-digital-dilemma",
  "beyond-resume-crafting-a-unique-identity-as-women-in-stem",
  "tink-her-hack-3-0",
  "elevate-her-breaking-barriers-and-building-bridges",
  "riseher-inspiring-spotlight",
];

describe("WIE public archive migration", () => {
  it("promotes the exact verified nine-record archive by stable slug", () => {
    for (const slug of slugs) expect(source).toContain(`slug: "${slug}"`);
    const declaredSlugs = [...source.matchAll(/slug: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(declaredSlugs)).toEqual(new Set(slugs));
  });

  it("is idempotent and uses the approved public contact", () => {
    expect(source).toContain('findBySlug(app, "events", item.slug)');
    expect(source).toContain('WIE_PUBLIC_EMAIL = "ieee@sahrdaya.ac.in"');
    expect(source).toContain('record.set("contactEmail", WIE_PUBLIC_EMAIL)');
  });

  it("removes the unapproved legacy society banner", () => {
    expect(source).toContain('society.set("banner", "")');
  });
});
