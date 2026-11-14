import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { ExtendedEvent } from "@/types";
import { formatDay, formatEventTime, formatMonth, formatWeekdayShort } from "@/lib/dates";
import { canRegisterForEvent } from "@/lib/event-lifecycle";

interface ProgrammeCoverProps {
  event: ExtendedEvent;
  isUpcoming: boolean;
  year: string;
}

/* A barcode is drawn, not photographed — narrow and wide bars, nothing else. */
const BARS = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 1];

export function ProgrammeCover({ event, isUpcoming, year }: ProgrammeCoverProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setLive(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const handlePointerMove = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (!live || pointerEvent.pointerType === "touch") return;
    const ticket = ticketRef.current;
    if (!ticket) return;
    const rect = pointerEvent.currentTarget.getBoundingClientRect();
    const dx = (pointerEvent.clientX - rect.left) / rect.width - 0.5;
    const dy = (pointerEvent.clientY - rect.top) / rect.height - 0.5;
    ticket.style.transform = `perspective(1000px) rotateX(${(-dy * 5).toFixed(2)}deg) rotateY(${(dx * 7).toFixed(2)}deg)`;
  };

  const handlePointerLeave = () => {
    if (ticketRef.current) ticketRef.current.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg)";
  };

  const time = event.timeTbc ? "Time TBA" : formatEventTime(event.date, false);
  const canGrab = isUpcoming && canRegisterForEvent(event);
  const externalForm = event.externalFormUrl || "";
  const registerUrl = externalForm || `/register/${event.id}`;

  return (
    <section className="relative px-5 pt-28 pb-10 sm:px-8 sm:pt-32 lg:px-12 lg:pt-36 lg:pb-14">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-16">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00629B]">
              IEEE Sahrdaya · Student Branch
            </p>
            <h1 className="mt-4 text-[clamp(3rem,8.5vw,6.5rem)] font-semibold leading-[0.84] tracking-[-0.06em] text-[#111315]">
              Programme
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-black/55">
              {isUpcoming
                ? "Every workshop, hackathon and talk the branch has run — and the next one you can walk into."
                : "Nothing on the calendar right now. The next season is being finalised — the wall below holds everything the branch has run."}
            </p>
            <p className="mt-6 font-[Caveat] text-xl text-black/40">Kodakara · Thrissur</p>
          </div>

          <div>
            <div
              ref={ticketRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className="relative overflow-hidden rounded-[24px] bg-[#fffaf0] shadow-[0_34px_70px_-34px_rgba(6,17,29,0.55)] ring-1 ring-black/[0.06] transition-transform duration-300 ease-out will-change-transform"
            >
              <div className="p-5 sm:p-7">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[#00629B]">
                    IEEE Sahrdaya · Student Branch
                  </p>
                  <p className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">{year}</p>
                </div>
                <h2 className="mt-4 text-xl font-semibold leading-[1.08] tracking-[-0.03em] text-[#1b1a17] sm:text-2xl">
                  {isUpcoming ? event.title : "The next season"}
                </h2>

                <div className="mt-5 flex items-end gap-4 sm:gap-5">
                  <div className="shrink-0">
                    <span className="block font-mono text-4xl font-semibold leading-none tracking-[-0.08em] tabular-nums text-[#1b1a17] sm:text-5xl">
                      {isUpcoming ? formatDay(event.date) : "—"}
                    </span>
                    <span className="mt-1.5 block font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/45">
                      {isUpcoming ? `${formatMonth(event.date)} · ${formatWeekdayShort(event.date)}` : "Date TBA"}
                    </span>
                  </div>
                  <div className="min-w-0 border-l border-black/10 pl-4 text-[11px] leading-relaxed text-black/55 sm:pl-5">
                    <div className="font-semibold text-[#1b1a17]">{isUpcoming ? time : "Timing TBA"}</div>
                    <div className="line-clamp-2">{isUpcoming ? event.venue || "Venue TBA" : "Being finalised"}</div>
                  </div>
                </div>
              </div>

              {/* The tear line: half holes punched into both sides. */}
              <div className="relative flex items-center justify-between gap-4 border-t border-dashed border-black/20 px-5 py-3.5 sm:px-7">
                <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#f8f9fa] shadow-[inset_0_2px_6px_rgba(6,17,29,0.3)]" />
                <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[#f8f9fa] shadow-[inset_0_2px_6px_rgba(6,17,29,0.3)]" />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.3em] text-black/40">
                  {isUpcoming ? "Admit one" : "Not printed yet"}
                </span>
                <div aria-hidden="true" className="flex h-7 items-end gap-[1.5px]">
                  {BARS.map((width, index) => (
                    <span key={index} style={{ width }} className="h-full bg-[#1b1a17]/70" />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {canGrab ? (
                <a
                  href={registerUrl}
                  target={externalForm ? "_blank" : undefined}
                  rel={externalForm ? "noopener noreferrer" : undefined}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#00629B] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
                >
                  Grab a ticket <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </a>
              ) : isUpcoming ? (
                <Link
                  to={`/events/${event.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#00629B] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
                >
                  See the event <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  to="/contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#00629B] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#111315] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
                >
                  Tell me when <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}

              <Link
                to={isUpcoming ? `/events/${event.slug}` : "#programme-wall"}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-[0.14em] text-black/55 transition-colors hover:text-[#00629B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
              >
                {isUpcoming ? "Event details" : "Open the wall"} <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>

            <p className="mt-4 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-black/35">
              {year} · Kodakara, Thrissur
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
