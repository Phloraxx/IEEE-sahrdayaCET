export const WIE_OFFICIAL_BANNER_PATH =
  "/images/wie/ieee-wie-official-banner.webp";
export const WIE_SOCIAL_IMAGE_PATH =
  "/images/wie/ieee-wie-official-background.webp";
export const WIE_HERO_IMAGE_PATH = "/images/wie/wie-community.webp";

export type WieArtwork = {
  src: string;
  fit: "cover" | "contain";
};

const CURATED_WIE_EVENT_ART: Record<string, WieArtwork> = {
  "witech-ideathon-2026-agentic-ai": {
    src: "/images/wie/witech-feature.webp",
    fit: "cover",
  },
};
const DESIGNED_FALLBACK_WIE_EVENT_SLUGS = new Set([
  "tink-her-hack-3-0",
  "elevate-her-breaking-barriers-and-building-bridges",
  "beyond-resume-crafting-a-unique-identity-as-women-in-stem",
  "cyberclash-debate-the-digital-dilemma",
  "pioneering-safe-cyberspace-bridging-technology-and-light-for-security",
]);

export function getWieEventArtwork(
  slug: string,
  bannerUrl: string,
): WieArtwork | null {
  const curated = CURATED_WIE_EVENT_ART[slug];
  if (curated) return curated;
  if (DESIGNED_FALLBACK_WIE_EVENT_SLUGS.has(slug)) return null;
  return bannerUrl ? { src: bannerUrl, fit: "cover" } : null;
}

export function usesDesignedWieFallback(slug: string): boolean {
  return DESIGNED_FALLBACK_WIE_EVENT_SLUGS.has(slug);
}
