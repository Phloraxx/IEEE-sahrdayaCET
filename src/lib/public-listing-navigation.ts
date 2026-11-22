import type { ShouldRevalidateFunctionArgs } from "react-router";

// Public listing filters operate on the already-loaded projection. Explicit
// refreshes and mutations still use the router's normal revalidation behavior.
export function shouldRevalidatePublicListing({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
}
