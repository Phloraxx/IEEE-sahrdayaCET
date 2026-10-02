import { expect, it } from "vitest";
import { shouldRevalidatePublicListing } from "@/lib/public-listing-navigation";
import type { ShouldRevalidateFunctionArgs } from "react-router";

it("reuses listing data for filters while preserving mutation and refresh revalidation", () => {
  const args = {
    currentUrl: new URL("https://example.test/blog"),
    nextUrl: new URL("https://example.test/blog?q=hardware"),
    defaultShouldRevalidate: true,
  } as ShouldRevalidateFunctionArgs;
  expect(shouldRevalidatePublicListing(args)).toBe(false);
  expect(shouldRevalidatePublicListing({ ...args, formMethod: "POST" })).toBe(true);
  expect(shouldRevalidatePublicListing({ ...args, nextUrl: args.currentUrl })).toBe(true);
  expect(shouldRevalidatePublicListing({ ...args, nextUrl: new URL("https://example.test/full-execom") })).toBe(true);
});
