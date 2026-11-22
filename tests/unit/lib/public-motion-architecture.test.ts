import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public motion architecture", () => {
  it("stops decorative frame loops for reduced motion", () => {
    const stars = read("src/components/ui/stars-background.tsx");
    const shooting = read("src/components/ui/shooting-stars.tsx");
    // The hook is local on purpose: importing `useReducedMotion` from
    // framer-motion pulled the whole animation runtime into every page that
    // renders a star field, for one media query.
    expect(stars).toContain("usePrefersReducedMotion");
    expect(shooting).toContain("usePrefersReducedMotion");
    expect(stars).not.toContain("framer-motion");
    expect(shooting).not.toContain("framer-motion");
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

    // One markup tree: reduced motion stops the cruise, it does not swap the rail
    // for a non-draggable static list (that also broke hydration).
    expect(execom).not.toContain("data-home-execom-static");
    expect(execom).toContain("if (reduceMotion) return;");
    expect(execom).toContain("Reduced motion now only disables");
    expect(execom).toContain("if (reduceMotion || !trackRef.current) return;");
    expect(character).toContain("useHydratedReducedMotion");
    expect(hero).not.toContain("useScroll");
    expect(hero).toContain("useHydratedReducedMotion");
    expect(read("src/components/EventsShowcase.tsx")).toContain("const stopped = reduceMotion || paused;");
    expect(chrome).toContain("duration: reduceMotion ? 0 : 0.45");
    // The navbar used to wrap its desktop pill in a `motion.div` with
    // `initial={false}`, which starts at the animate target and therefore never
    // animated anything. It is a plain div now, and that is what keeps
    // framer-motion off every page that renders the navbar.
    expect(nav).not.toContain('from "framer-motion"');
    expect(nav).not.toContain("<motion.");
  });
});