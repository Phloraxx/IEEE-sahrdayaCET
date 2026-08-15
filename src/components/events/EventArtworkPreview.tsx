interface EventArtworkPreviewProps {
  src: string;
  alt: string;
  className?: string;
}

export function EventArtworkPreview({
  src,
  alt,
  className = "",
}: EventArtworkPreviewProps) {
  return (
    <div
      className={`relative isolate h-full w-full overflow-hidden bg-[#111315] ${className}`}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl saturate-75"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#111315]/42" />
      <img
        src={src}
        alt={alt}
        className="relative z-10 h-full w-full object-contain"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/10"
      />
    </div>
  );
}
