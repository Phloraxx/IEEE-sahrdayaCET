import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const requiredPages = [
  ["about", "routes/about.tsx"],
  ["contact", "routes/contact.tsx"],
  ["pricing", "routes/pricing.tsx"],
  ["shipping-and-delivery-policy", "routes/shipping-and-delivery-policy.tsx"],
] as const;

describe("website verification architecture", () => {
  it("publishes every Razorpay-requested business information route", () => {
    const routes = read("src/routes.ts");
    const sitemap = read("src/routes/sitemap.ts");
    for (const [path, file] of requiredPages) {
      expect(routes).toContain(`route("${path}", "${file}")`);
      expect(sitemap).toContain(`urlEntry("/${path}")`);
    }
  });

  it("makes the compliance pages discoverable from every public footer", () => {
    const footer = read("src/components/Footer.tsx");
    for (const [path] of requiredPages) expect(footer).toContain(`href: "/${path}"`);
    expect(footer).toContain('href: "/terms-and-conditions"');
    expect(footer).toContain('href: "/privacy-policy"');
    expect(footer).toContain('href: "/refund-and-cancellation-policy"');
  });

  it("uses real event records as the pricing and catalog source", () => {
    const pricing = read("src/routes/pricing.tsx");
    expect(pricing).toContain("fetchEvents()");
    expect(pricing).toContain("event.price");
    expect(pricing).toContain("Current catalog");
    expect(pricing).toContain("Free");
  });

  it("does not retain the old retail boilerplate in event policies", () => {
    const policies = [
      "src/routes/terms-and-conditions.tsx",
      "src/routes/privacy-policy.tsx",
      "src/routes/refund-and-cancellation-policy.tsx",
    ].map(read).join("\n");
    for (const stale of [
      "Sourav P Bijoy",
      "perishable",
      "doorstep",
      "manufacturer",
      "Insert Name",
      "company incorporated",
    ]) {
      expect(policies).not.toContain(stale);
    }
    expect(policies).toContain("event-registration");
    expect(policies).toContain("Approved refunds are initiated within 7 working days");
  });
});
