import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDay, formatMonth, formatYear } from "@/lib/dates";

/**
 * Events without a poster are not holes in the wall — they are notes pinned
 * next to it. Warm paper, a handwritten date, the title in normal type so it
 * stays readable.
 */
export function FieldNote({ event }: { event: ExtendedEvent }) {
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  return (
    <Link
      to={`/events/${event.slug}`}
      className="wall-card group block -rotate-[0.5deg] rounded-[22px] bg-[#fffdf7] p-5 ring-1 ring-[#e6dfd1] shadow-[0_2px_14px_rgba(6,17,29,0.06)] transition duration-300 hover:rotate-0 hover:shadow-[0_10px_28px_rgba(6,17,29,0.12)] focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#a89c85]">Noted by hand</span>
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#a89c85]">{formatYear(event.date)}</span>
      </div>

      <p className="mt-5 font-[Caveat] text-[2.6rem] leading-none text-[#00629B]">
        {formatDay(event.date)} {formatMonth(event.date).toLowerCase()}
      </p>

      <h3 className="mt-2 text-[17px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#1b1a17] transition-colors duration-200 group-hover:text-[#00629B]">
        {event.title}
      </h3>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e6dfd1] pt-3">
        <span className="truncate font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#8d8271]">{societyName}</span>
        <span className="shrink-0 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#a89c85]">
          {event.price > 0 ? `₹${event.price}` : "Free"}
        </span>
      </div>
    </Link>
  );
}
