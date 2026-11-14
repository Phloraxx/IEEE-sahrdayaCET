import type { ExtendedEvent } from "@/types";
import { resolveEventArtwork } from "@/lib/event-artwork";
import { PosterCard } from "./PosterCard";
import { FieldNote } from "./FieldNote";
import type { YearOpener } from "./year-openers";

interface YearChapterProps {
  year: string;
  events: ExtendedEvent[];
  opener?: YearOpener;
}

export function YearChapter({ year, events, opener }: YearChapterProps) {
  return (
    <section id={`year-${year}`} className="scroll-mt-52">
      {opener ? (
        <div className="relative overflow-hidden rounded-[28px]">
          <img
            src={opener.src}
            alt=""
            loading="lazy"
            className="h-[240px] w-full object-cover sm:h-[300px] lg:h-[360px]"
            style={{ objectPosition: `center ${Math.round(opener.position * 100)}%` }}
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07131c]/88 via-[#07131c]/22 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 sm:p-7">
            <h2 className="text-5xl font-semibold leading-none tracking-[-0.06em] text-white sm:text-6xl">{year}</h2>
            <p className="font-[Caveat] text-xl text-white/75 sm:text-2xl">{opener.caption}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-4">
          <h2 className="text-5xl font-semibold leading-none tracking-[-0.06em] text-[#111315] sm:text-6xl">{year}</h2>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-black/45">
            {String(events.length).padStart(2, "0")} events
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-black/45">
          {String(events.length).padStart(2, "0")} {events.length === 1 ? "event" : "events"}
        </p>
        <p className="font-[Caveat] text-lg text-black/40">posters and notes from the year</p>
      </div>

      <div className="poster-wall mt-4 columns-2 gap-4 md:columns-3 md:gap-5 xl:columns-4">
        {events.map((event, index) => (
          <div key={event.id} className="mb-4 break-inside-avoid md:mb-5">
            {resolveEventArtwork(event) ? (
              <PosterCard event={event} tall={index % 7 === 3} />
            ) : (
              <FieldNote event={event} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
