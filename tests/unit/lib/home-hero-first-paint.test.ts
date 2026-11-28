import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The hero's paper background, painted by `.hero-stage` before any JS runs. */
const HERO_BACKGROUND = "#f3f4ef";

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** WCAG 2.1 contrast ratio between two `#rrggbb` colours. */
function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The `<h1>` element exactly as the component renders it (not the header comment). */
function heroHeading(hero: string): string {
  const start = hero.search(/<h1[\s>]/);
  if (start < 0) return "";
  const end = hero.indexOf("</h1>", start);
  return end < 0 ? "" : hero.slice(start, end + "</h1>".length);
}

describe("home hero first paint", () => {
  it("keeps the server-painted wordmark readable on its background", () => {
    // IEEE blue wordmark: large text needs 3:1, real text here must clear 4.5:1.
    expect(contrastRatio("#00629b", HERO_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    // Slate tagline and ornament copy.
    expect(contrastRatio("#1e293b", HERO_BACKGROUND)).toBeGreaterThanOrEqual(7);
  });

  it("paints the hero background from CSS instead of waiting for hydration", () => {
    const css = read("src/features/globals.css");
    // The star canvas only exists after hydration; the paper behind the
    // wordmark must not depend on it, or the first paint is a blank region.
    expect(css).toMatch(/\.hero-stage \{[^}]*background: #f3f4ef;/);
  });

  it("renders the wordmark opaque, with no reveal hook and no animation", () => {
    const hero = read("src/components/Hero.tsx");
    const h1 = heroHeading(hero);
    // The h1 must paint in its final state straight from the server document.
    expect(h1).toContain("IEEE");
    expect(h1).not.toContain("data-hero-reveal");
    expect(h1).not.toMatch(/opacity/);
    expect(h1).not.toMatch(/animation/);
    // No framer-motion element anywhere: its `initial` state was the
    // transparent start the server used to ship.
    expect(hero).not.toMatch(/from ["']framer-motion["']/);
    expect(hero).not.toContain("<motion.");
    expect(hero).not.toContain("initial=");
  });

  it("keeps the reveal for subordinate rows only, and it never starts transparent", () => {
    const hero = read("src/components/Hero.tsx");
    const css = read("src/features/globals.css");
    // The tagline and the three words animate; the wordmark does not.
    expect(hero.match(/data-hero-reveal/g)?.length).toBeGreaterThanOrEqual(2);
    expect(hero).toContain("hero-reveal 0.6s");
    // Motion is a transform only: the keyframes carry no opacity frame at all,
    // so neither the wordmark nor the tagline is ever invisible.
    const keyframes = /@keyframes hero-reveal \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(keyframes).toContain("transform: translate3d(0, var(--hero-reveal-shift, 12px), 0)");
    expect(keyframes).not.toContain("opacity");
    // Reduced motion shows the final geometry.
    expect(css).toContain("[data-hero-reveal] { animation: none !important; transform: none; }");
  });

  it("keeps the wordmark in Press Start 2P with static stepped depth and radial lift", () => {
    const hero = read("src/components/Hero.tsx");
    const css = read("src/features/globals.css");
    expect(hero).toContain("font-pixel text-5xl sm:text-7xl md:text-8xl lg:text-9xl text-ieee-blue");
    expect(hero).toContain("font-pixel text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900");
    expect(hero).toContain("textShadow:");
    expect(hero).toContain("radial-gradient");
    expect(css).toContain("background-image: radial-gradient");
    expect(hero).toContain("useHydratedReducedMotion");
  });
});
