import { useEffect, useState } from "react";
import { blurredVariant, buildSrcSet } from "@/lib/image-srcset";
import { EventBannerFallback } from "./EventBannerFallback";

interface EventArtworkPreviewProps {
  src: string;
  alt: string;
  className?: string;
  mode?: "fill" | "bounded";
  /** Layout width hint for the browser's `srcset` choice. */
  sizes?: string;
  /** Optional metadata used for typographic SVG fallback when artwork 404s. */
  title?: string;
  societyName?: string;
  societySlug?: string;
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
  title,
  societyName,
  societySlug,
}: EventArtworkPreviewProps) {
  const fill = mode === "fill";
  const computedSrcSet = buildSrcSet(src);
  const [useSrcSet, setUseSrcSet] = useState(Boolean(computedSrcSet));
  const [backdropHidden, setBackdropHidden] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setUseSrcSet(Boolean(computedSrcSet));
    setBackdropHidden(false);
    setBroken(false);
  }, [src, computedSrcSet]);

  const activeSrcSet = useSrcSet ? computedSrcSet : undefined;
  const resolvedSizes = activeSrcSet ? (sizes ?? (fill ? FILL_SIZES : BOUNDED_SIZES)) : undefined;

  const handleImageError = () => {
    // If a resized ?w= derivative returned 429/404, try the original src once before falling back.
    if (useSrcSet) {
      setUseSrcSet(false);
      return;
    }
    setBroken(true);
  };

  if (broken) {
    if (title) {
      return (
        <EventBannerFallback
          title={title}
          societyName={societyName}
          societySlug={societySlug}
          className={fill ? className : `aspect-[4/5] max-h-[680px] ${className}`}
        />
      );
    }

    return (
      <div
        role="img"
        aria-label={alt}
        className={`relative grid place-items-center overflow-hidden bg-[#0b2239] text-white/75 ${fill ? "h-full w-full" : "aspect-[4/5] max-h-[680px] w-full"} ${className}`}
      >
        <svg viewBox="0 0 120 120" className="h-16 w-16 text-white/30" fill="none" aria-hidden="true">
          <rect x="14" y="14" width="92" height="92" rx="14" stroke="currentColor" strokeWidth="2.5" />
          <path d="M32 82L54 56L72 74L84 62L94 82H32Z" fill="currentColor" fillOpacity="0.35" />
          <circle cx="44" cy="42" r="7" fill="currentColor" fillOpacity="0.45" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative isolate overflow-hidden bg-[#111315] ${fill ? "h-full w-full" : "w-full"} ${className}`}>
      {/* Blurred backdrop: a 64px source is indistinguishable once blurred, so
          this layer no longer downloads the full-resolution original. */}
      {!backdropHidden ? (
        <img
          src={blurredVariant(src)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={() => setBackdropHidden(true)}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl saturate-75"
        />
      ) : null}
      <div aria-hidden="true" className="absolute inset-0 bg-[#111315]/42" />
      <img
        src={src}
        srcSet={activeSrcSet}
        sizes={resolvedSizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={handleImageError}
        className={fill
          ? "relative z-10 h-full w-full object-contain"
          : "relative z-10 mx-auto max-h-[680px] w-full object-contain"}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/10" />
    </div>
  );
}
