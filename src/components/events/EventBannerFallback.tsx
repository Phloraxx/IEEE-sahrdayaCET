interface EventBannerFallbackProps {
  title: string;
  societyName?: string;
  societySlug?: string;
  className?: string;
  showTitle?: boolean;
}

const SOCIETY_COLORS: Record<string, { background: string; accent: string }> = {
  cs: { background: "#071b33", accent: "#00a4e4" },
  css: { background: "#082f49", accent: "#38bdf8" },
  cas: { background: "#312e81", accent: "#a5b4fc" },
  embs: { background: "#4c0519", accent: "#fb7185" },
  ies: { background: "#042f2e", accent: "#2dd4bf" },
  ias: { background: "#172554", accent: "#60a5fa" },
  npss: { background: "#2e1065", accent: "#c4b5fd" },
  pes: { background: "#052e16", accent: "#a3e635" },
  ps: { background: "#3b0764", accent: "#e879f9" },
  ras: { background: "#25114f", accent: "#8b5cf6" },
  sight: { background: "#431407", accent: "#fb923c" },
  sps: { background: "#083344", accent: "#22d3ee" },
  wie: { background: "#4a044e", accent: "#f0abfc" },
  edsoc: { background: "#082f49", accent: "#67e8f9" },
};

function initials(title: string) {
  return title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "E";
}
export function EventBannerFallback({
  title,
  societyName,
  societySlug,
  className = "",
  showTitle = true,
}: EventBannerFallbackProps) {
  const palette = SOCIETY_COLORS[societySlug?.toLowerCase() || ""] || {
    background: "#0b2239",
    accent: "#00a4e4",
  };

  return (
    <div
      role="img"
      aria-label={`${title} event artwork`}
      className={`relative isolate h-full w-full overflow-hidden text-white ${className}`}
      style={{ backgroundColor: palette.background }}
    >
      <div className="absolute inset-y-0 left-[18%] w-px bg-white/10" />
      <div className="absolute inset-y-0 right-[18%] w-px bg-white/10" />
      <div className="absolute inset-x-0 top-[22%] h-px bg-white/10" />
      <div className="absolute inset-x-0 bottom-[22%] h-px bg-white/10" />

      <div
        aria-hidden="true"
        className="absolute -right-[2%] top-1/2 -translate-y-1/2 select-none text-[34vw] font-semibold leading-none tracking-[-0.12em] text-white/[0.055] sm:text-[18rem]"
      >
        {initials(title)}
      </div>

      <div className="absolute left-5 top-5 z-10 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/72 sm:left-6 sm:top-6">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.accent }} />
        IEEE Sahrdaya
      </div>
      <div className="absolute bottom-5 left-5 right-5 z-10 sm:bottom-6 sm:left-6 sm:right-6">
        <div className="mb-3 flex items-center justify-between gap-4 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/52">
          <span className="truncate">{societyName || "Student Branch Event"}</span>
          <span aria-hidden="true">↗</span>
        </div>
        {showTitle && (
          <p className="max-w-[88%] text-2xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-3xl">
            {title}
          </p>
        )}
      </div>

      <div
        aria-hidden="true"
        className="absolute right-5 top-5 h-12 w-12 rounded-full border border-white/15 sm:right-6 sm:top-6"
        style={{ boxShadow: `inset 0 0 0 11px ${palette.background}, inset 0 0 0 12px ${palette.accent}55` }}
      />
    </div>
  );
}
