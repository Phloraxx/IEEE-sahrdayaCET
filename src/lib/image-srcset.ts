/**
 * Responsive-image helpers for uploaded artwork.
 *
 * Uploads are stored at whatever resolution the organiser had. One staging
 * poster is 5400x5400 and 3.9 MB while being displayed at 353px wide, and the
 * `/events` wall renders dozens of them — 7.8 MB of images for one page.
 *
 * `GET /files/:collection/:id/:filename?w=<width>` returns a re-encoded variant
 * (see `routes/files.$collection.$recordId.$filename.ts`), so the browser can
 * pick a width that matches the layout instead of downloading the original.
 *
 * Only `/files/*` URLs are resizable. Static assets under `/media/*` are
 * already exported at their display size and are left alone.
 */

/** Widths offered to the browser. Covers a 160px mobile poster up to 1280px. */
const SRCSET_WIDTHS = [320, 480, 640, 960, 1280] as const;

export function isResizableUpload(src: string): boolean {
  return src.startsWith("/files/");
}

/**
 * `srcset` for an uploaded image, or `undefined` for anything already sized.
 * Returning `undefined` keeps React from emitting an empty attribute.
 */
export function buildSrcSet(src: string): string | undefined {
  if (!isResizableUpload(src)) return undefined;
  const separator = src.includes("?") ? "&" : "?";
  return SRCSET_WIDTHS.map((width) => `${src}${separator}w=${width} ${width}w`).join(", ");
}

/**
 * A deliberately tiny variant for the blurred backdrop behind a poster. That
 * layer is scaled up and blurred past recognition, so a 64px source is
 * indistinguishable from the original and costs almost nothing.
 */
export function blurredVariant(src: string): string {
  if (!isResizableUpload(src)) return src;
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}w=64`;
}
