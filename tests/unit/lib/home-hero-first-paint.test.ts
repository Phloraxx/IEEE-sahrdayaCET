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

  it("stages the entrance on the masks, never on the wordmark itself", () => {
    const hero = read("src/components/Hero.tsx");
    const css = read("src/features/globals.css");
    const h1 = heroHeading(hero);
    // The heading is still opaque, unanimated text; the wrapper does the work.
    expect(h1).not.toMatch(/opacity/);
    expect(h1).not.toMatch(/animation/);
    expect(hero.match(/hero-line-mask/g)?.length).toBe(2);
    expect(hero).toContain('className="hero-word"');
    expect(hero).toContain("TAGLINE.map");
    // The line reveal is a transform only: no frame of the wordmark is
    // transparent, so the identity never disappears from the page.
    const keyframes = /@keyframes hero-line-rise \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(keyframes).toContain("transform: translate3d(0, 110%, 0)");
    expect(keyframes).not.toContain("opacity");
    // The mask clips the rise without taking any layout space, and its margin
    // is what keeps the stepped shadow from being cut at the edge.
    expect(css).toContain("overflow: clip;");
    expect(css).toContain("overflow-clip-margin: 10px;");
    // One staged pass, faster than the 3.1s framer-motion original: the
    // wordmark lands at 0.46s, the words start at 0.24s and the last one
    // settles by 0.74s.
    expect(css).toContain("hero-line-rise 460ms");
    expect(css).toContain("hero-word-in 380ms");
    expect(css).toContain("hero-rule-draw 520ms");
    expect(css).toContain("--hero-ease: cubic-bezier(0.2, 0.65, 0.3, 0.9)");
    expect(hero).toContain("WORD_START = 240");
    expect(hero).toContain("WORD_STEP = 60");
    // Reduced motion shows the final geometry.
    expect(css).toContain(".hero-line, .hero-word, .hero-rule { animation: none !important; transform: none; }");
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
