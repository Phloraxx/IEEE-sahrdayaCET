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
