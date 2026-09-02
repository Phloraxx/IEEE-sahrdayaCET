import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public motion architecture", () => {
  it("stops decorative frame loops for reduced motion", () => {
    const stars = read("src/components/ui/stars-background.tsx");
    const shooting = read("src/components/ui/shooting-stars.tsx");
    expect(stars).toContain("useReducedMotion");
    expect(stars).toContain("if (!reduceMotion) animationFrameId = requestAnimationFrame(render)");
    expect(shooting).toContain("if (reduceMotion)");
    expect(shooting).toContain("if (timer) clearTimeout(timer)");
  });
  it("keeps Home motion-heavy pieces static when requested", () => {
    const execom = read("src/components/Execom.tsx");
    const character = read("src/components/FloatingAction.tsx");
    const hero = read("src/components/Hero.tsx");
    const chrome = read("src/components/TechnicalDetails.tsx");
    const nav = read("src/components/Navbar.tsx");

    expect(execom).toContain("data-home-execom-static");
    expect(execom).toContain("if (reduceMotion) return;");
    expect(character).toContain("useReducedMotion");
    expect(hero).toContain("style={reduceMotion ? undefined : { scale, opacity, y }}");
    expect(chrome).toContain("duration: reduceMotion ? 0 : 0.45");
    expect(nav).toContain("duration: reduceMotion ? 0 : 0.5");
  });
});