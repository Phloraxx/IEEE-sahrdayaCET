import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SustainX event story", () => {
  it("keeps SustainX on the canonical event route", () => {
    const route = read("src/routes/events.$slug.tsx");
    expect(route).toContain('event.slug === "sustainx"');
    expect(route).toContain("<SustainXEventStory");
  });

  it("records the verified post-event facts", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain("20 August 2026");
    expect(page).toContain("14 teams");
    expect(page).toContain("HYDRO");
    expect(page).toContain("ZERO POINT2");
    expect(page).toContain("UNEMPLOYED");
  });

  it("preserves the original three-phase challenge language", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain('verb: "Identify"');
    expect(page).toContain('verb: "Innovate"');
    expect(page).toContain('verb: "Present"');
  });
  it("ships the approved event media as local web assets", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain("/media/sustainx/sustainx-hero-loop.webm");
    expect(page).toContain("/media/sustainx/sustainx-hero-loop.mp4");
    expect(page).toContain("/media/sustainx/sustainx-01.webp");
    expect(page).toContain("/media/sustainx/sustainx-07.webp");
    expect(page).toContain("/media/sustainx/sustainx-campaign-teaser.webp");
    expect(page).toContain("/media/sustainx/sustainx-campaign-registration.webp");
    expect(page).toContain("/media/sustainx/sustainx-campaign-overview.webp");
    expect(page).toContain("Registration window · 27 June–7 July");
    expect(page).toContain("The event,<br />not the poster.");
    expect(page).not.toContain("drive.google.com");
  });

  it("keeps motion progressive and reduced-motion aware", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    const styles = read("src/styles/events.css");
    expect(page).toContain("useReducedMotion");
    expect(page).toContain('import "@/styles/events.css"');
    expect(page).toContain("sustainx-marquee-track");
    expect(page).toContain("heroVideoRef");
    expect(page).toContain("video.pause()");
    expect(styles).toContain("@keyframes sustainx-marquee");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the gallery above global chrome and keyboard-safe", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain('className="fixed inset-0 z-[200]');
    expect(page).toContain("createPortal");
    expect(page).toContain("closeButtonRef.current?.focus()");
    expect(page).toContain('event.key !== "Tab"');
    expect(page).toContain("triggerRef.current?.focus()");
    expect(page).toContain("child.inert = true");
    expect(page).toContain("onTouchStart={onTouchStart}");
    expect(page).toContain("Swipe the archive →");
  });

  it("keeps dense mobile archives compact and legible", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain('grid grid-cols-2 border-l border-t border-black/15');
    expect(page).toContain('grid grid-cols-2 border-l border-t border-black/16');
    expect(page).toContain('text-[10px] font-bold tabular-nums');
  });

  it("locks the page behind the mobile navigation overlay", () => {
    const navbar = read("src/components/Navbar.tsx");
    expect(navbar).toContain('body.style.position = "fixed"');
    expect(navbar).toContain('root.style.overflow = "hidden"');
    expect(navbar).toContain('aria-label="Site navigation"');
  });

  it("uses the documented 100-point judging framework", () => {
    const page = read("src/components/events/SustainXEventStory.tsx");
    expect(page).toContain('["Sustainability & community impact", "30"]');
    expect(page).toContain('["Innovation", "20"]');
    expect(page).toContain('["Technical feasibility", "20"]');
    expect(page).toContain('["Cost effectiveness", "15"]');
    expect(page).toContain('["Presentation clarity", "15"]');
  });

  it("does not expose registration contact fields from the source material", () => {
    const page = read("src/components/events/SustainXEventStory.tsx").toLowerCase();
    expect(page).not.toContain("emailaddress");
    expect(page).not.toContain("phonenumber");
    expect(page).not.toContain("membershipnumber");
  });
});
