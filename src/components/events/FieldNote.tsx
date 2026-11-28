import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDay, formatMonth, formatYear } from "@/lib/dates";

/**
 * Events without a poster are rendered as clean programme notes rather than
 * empty slots. Warm paper card, tabular Geist Mono date, readable typography.
 */
export function FieldNote({ event }: { event: ExtendedEvent }) {
  const societyName = typeof event.society === "object" ? event.society.name : "IEEE Sahrdaya";

  return (
    <Link
      to={`/events/${event.slug}`}
      className="wall-card group block rounded-[22px] bg-[#fffdf7] p-5 ring-1 ring-[#e6dfd1] shadow-[0_2px_14px_rgba(6,17,29,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(6,17,29,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#5c5446]">Programme</span>
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.06em] tabular-nums text-[#5c5446]">{formatYear(event.date)}</span>
      </div>

      <p className="mt-4 font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums text-[#00629B]">
        {formatDay(event.date)} {formatMonth(event.date)}
      </p>

      <h3 className="mt-2.5 text-[17px] font-semibold leading-[1.24] tracking-[-0.02em] text-[#1b1a17] transition-colors duration-200 group-hover:text-[#00629B]">
        {event.title}
      </h3>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e6dfd1] pt-3">
        <span className="truncate font-mono text-xs font-medium uppercase tracking-[0.04em] text-[#5c5446]">{societyName}</span>
        <span className="shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.04em] tabular-nums text-[#5c5446]">
          {event.price > 0 ? `₹${event.price}` : "Free"}
        </span>
      </div>
    </Link>
  );
}
