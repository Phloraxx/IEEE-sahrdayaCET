export interface YearOpener {
  src: string;
  caption: string;
  /** Vertical focal point for the band crop, 0 = top, 1 = bottom. */
  position: number;
}

/**
 * Each year opens with a real photograph from that year's flagship, cropped
 * into a wide band. The focal point is chosen per photo so faces survive the
 * crop, and the caption always names the event the photo came from.
 */
export const YEAR_OPENERS: Record<string, YearOpener> = {
  "2026": { src: "/media/sustainx/sustainx-live-01.webp", caption: "SustainX · on stage", position: 0.3 },
  "2025": { src: "/media/flagships/infinia-2025-community.webp", caption: "Infinia 2025 · the hall", position: 0.5 },
  "2024": { src: "/media/flagships/infinia-2024-community.webp", caption: "Infinia 2024 · community", position: 0.5 },
  "2023": { src: "/media/flagships/altair-2023-audience.webp", caption: "Altair 2023 · the room", position: 0.5 },
};
