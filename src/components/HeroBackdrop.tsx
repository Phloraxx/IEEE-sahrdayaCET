import React from "react";

/**
 * The original Sahrdaya campus aerial is layered independently from the
 * atmospheric lighting and grid. All decorative layers ignore pointer events.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 isolate overflow-hidden bg-[#2b526c]">
      {/* Soft sky gradients leave a quiet region behind the lettering. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 45% at 16% 39%, rgba(230,205,205,.32), transparent 78%), radial-gradient(ellipse 54% 34% at 83% 24%, rgba(170,208,221,.24), transparent 80%), linear-gradient(180deg, #264e6b 0%, #46748a 48%, #28465e 100%)",
        }}
      />

      {/* Historic, genuine campus photo: preserved architecture, atmospheric colour grade. */}
      <img
        src="/AGM.webp"
        alt=""
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-[center_48%] opacity-[.88]"
        style={{
          filter: "saturate(.68) contrast(.94) brightness(.85)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.25) 18%, #000 46%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.25) 18%, #000 46%)",
        }}
      />

      {/* Bring the landscape together without erasing the red-roofed campus. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,49,76,.32)_0%,rgba(33,73,95,.26)_52%,rgba(10,35,55,.53)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(12,34,53,.29)_100%)]" />

      {/* Crisp CSS grid, intentionally separate from the raster image. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(242,250,255,.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(242,250,255,.22) 1px, transparent 1px)",
          backgroundSize: "clamp(42px, 6.25vw, 86px) clamp(42px, 6.25vw, 86px)",
          opacity: 0.33,
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,.55), #000 34%, rgba(0,0,0,.45) 100%)",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,.55), #000 34%, rgba(0,0,0,.45) 100%)",
        }}
      />
    </div>
  );
}
