import { blurredVariant, buildSrcSet } from "@/lib/image-srcset";

interface EventArtworkPreviewProps {
  src: string;
  alt: string;
  className?: string;
  mode?: "fill" | "bounded";
  /** Layout width hint for the browser's `srcset` choice. */
  sizes?: string;
}

/** A poster in the wall grid is at most ~360px wide on desktop. */
const FILL_SIZES = "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw";
/** The bounded variant is a full-width hero capped at 680px tall. */
const BOUNDED_SIZES = "(min-width: 1024px) 900px, 100vw";

export function EventArtworkPreview({
  src,
  alt,
  className = "",
  mode = "fill",
  sizes,
}: EventArtworkPreviewProps) {
  const fill = mode === "fill";
  const srcSet = buildSrcSet(src);
  const resolvedSizes = srcSet ? (sizes ?? (fill ? FILL_SIZES : BOUNDED_SIZES)) : undefined;

  return (
    <div className={`relative isolate overflow-hidden bg-[#111315] ${fill ? "h-full w-full" : "w-full"} ${className}`}>
      {/* Blurred backdrop: a 64px source is indistinguishable once blurred, so
          this layer no longer downloads the full-resolution original. */}
      <img
        src={blurredVariant(src)}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl saturate-75"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#111315]/42" />
      <img
        src={src}
        srcSet={srcSet}
        sizes={resolvedSizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={fill
          ? "relative z-10 h-full w-full object-contain"
          : "relative z-10 mx-auto max-h-[680px] w-full object-contain"}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/10" />
    </div>
  );
}
