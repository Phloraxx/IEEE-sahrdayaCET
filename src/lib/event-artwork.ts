import {
  getWieEventArtwork,
  WIE_SOCIAL_IMAGE_PATH,
  type WieArtwork,
} from "@/lib/wie-media";

const SUSTAINX_ARTWORK_PATH = "/media/sustainx/sustainx-campaign-registration.webp";

export type EventArtworkInput = {
  slug: string;
  bannerUrl?: string | null;
  society?: string | { slug?: string | null } | null;
};

export function getEventSocietySlug(event: EventArtworkInput): string {
  if (!event.society || typeof event.society === "string") return "";
  return event.society.slug?.trim().toLowerCase() || "";
}

export function resolveEventArtwork(
  event: EventArtworkInput,
): WieArtwork | null {
  if (event.slug.trim().toLowerCase() === "sustainx") {
    return { src: SUSTAINX_ARTWORK_PATH, fit: "contain" };
  }
  if (getEventSocietySlug(event) === "wie") {
    return getWieEventArtwork(event.slug, event.bannerUrl || "");
  }
  return event.bannerUrl ? { src: event.bannerUrl, fit: "cover" } : null;
}

export function resolveEventSocialImagePath(event: EventArtworkInput): string {
  const artwork = resolveEventArtwork(event);
  if (artwork) return artwork.src;
  return getEventSocietySlug(event) === "wie"
    ? WIE_SOCIAL_IMAGE_PATH
    : "/web.png";
}
