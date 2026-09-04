import { describe, expect, it } from "vitest";
import { BRANCH_SOCIAL_LINKS, ORGANIZATION_SAME_AS } from "@/lib/social-links";

describe("canonical branch social links", () => {
  it("uses one branch identity across footer, metadata and attendee surfaces", () => {
    expect(BRANCH_SOCIAL_LINKS.map((item) => item.label)).toEqual(["Instagram", "LinkedIn", "YouTube"]);
    for (const social of BRANCH_SOCIAL_LINKS) {
      expect(social.href).toMatch(/^https:\/\//);
      expect(ORGANIZATION_SAME_AS).toContain(social.href);
    }
  });
});
