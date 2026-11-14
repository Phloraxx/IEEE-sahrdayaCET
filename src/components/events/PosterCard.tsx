import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDay, formatMonth } from "@/lib/dates";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { EventArtworkPreview } from "./EventArtworkPreview";

/** One poster on the wall. The artwork is always shown in full. */
export function PosterCard({ event, tall = false }: { event: ExtendedEvent; tall?: boolean }) {
  const spotRef = useRef<HTMLDivElement>(null);
  const artwork = resolveEventArtwork(event);
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  const handlePointerMove = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerEvent.pointerType === "touch") return;
    const spot = spotRef.current;
    if (!spot) return;
    const rect = pointerEvent.currentTarget.getBoundingClientRect();
    spot.style.setProperty("--spot-x", `${pointerEvent.clientX - rect.left}px`);
    spot.style.setProperty("--spot-y", `${pointerEvent.clientY - rect.top}px`);
  };

  if (!artwork) return null;

  return (
    <Link to={`/events/${event.slug}`} className="wall-card group block transition-opacity duration-300 focus-visible:outline-none">
      <div
        onPointerMove={handlePointerMove}
        className={`relative overflow-hidden rounded-[22px] bg-[#111315] shadow-[0_2px_14px_rgba(6,17,29,0.08)] ring-1 ring-black/[0.06] transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-[#00629B] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#f8f9fa] ${
          tall ? "aspect-[3/4]" : "aspect-[4/5]"
        }`}
      >
        <EventArtworkPreview src={artwork.src} alt={`${event.title} event artwork`} />
        <div
          ref={spotRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(255,255,255,0.22), rgba(255,255,255,0) 70%)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 z-30 grid h-9 w-9 translate-y-1 place-items-center rounded-full bg-[#00629B] text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black/50">
        <span className="text-[#00629B]">{formatMonth(event.date)} {formatDay(event.date)}</span>
        <span aria-hidden="true" className="text-black/20">/</span>
        <span className="truncate">{societyName}</span>
      </div>
      <h3 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111315] transition-colors duration-200 group-hover:text-[#00629B] group-focus-visible:text-[#00629B]">
        {event.title}
      </h3>
    </Link>
  );
}
