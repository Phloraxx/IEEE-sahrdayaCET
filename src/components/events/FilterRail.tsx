import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";

export type ProgrammeView = "wall" | "list";

interface FilterRailProps {
  years: { value: string; count: number }[];
  activeYear: string;
  onYear: (value: string) => void;
  societies: string[];
  activeSociety: string;
  onSociety: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  view: ProgrammeView;
  onView: (value: ProgrammeView) => void;
  resultCount: number;
  hasFilters: boolean;
  onReset: () => void;
}

export function FilterRail({
  years,
  activeYear,
  onYear,
  societies,
  activeSociety,
  onSociety,
  search,
  onSearch,
  view,
  onView,
  resultCount,
  hasFilters,
  onReset,
}: FilterRailProps) {
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const moveTo = useCallback((key: string) => {
    const el = chipRefs.current[key];
    if (!el) return;
    setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
  }, []);

  useEffect(() => {
    moveTo(activeYear);
  }, [activeYear, moveTo]);

  useEffect(() => {
    const onResize = () => moveTo(activeYear);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeYear, moveTo]);

  return (
    <div className="mt-6 md:sticky md:top-20 md:z-20">
      <div className="md:rounded-[24px] md:border md:border-black/[0.08] md:bg-[#f8f9fa]/90 md:p-3 md:shadow-[0_14px_40px_-24px_rgba(6,17,29,0.28)] md:backdrop-blur-md">
        <div className="grid gap-2 pb-2.5 md:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_auto] lg:items-center lg:gap-3">
          <div className="min-w-0">
            <label htmlFor="events-programme-search" className="sr-only">
              Search past events
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/58" />
              <input
                id="events-programme-search"
                type="search"
                aria-label="Search past events"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search the programme — title, society or venue"
                className="h-11 w-full rounded-full bg-white pl-10 pr-11 text-base text-[#111315] ring-1 ring-black/[0.08] outline-none transition placeholder:text-black/58 focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa] md:bg-[#f2f3f4] md:ring-0 lg:text-sm"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => onSearch("")}
                  aria-label="Clear search"
                  className="absolute right-0.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-black/58 transition-colors hover:bg-black/5 hover:text-black focus-visible:outline-2 focus-visible:outline-[#00629B]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor="events-society-filter" className="sr-only">
              Filter by society
            </label>
            <select
              id="events-society-filter"
              aria-label="Filter by society"
              value={activeSociety}
              onChange={(event) => onSociety(event.target.value)}
              className="h-11 w-full max-w-full rounded-full bg-white px-4 text-sm font-semibold text-[#111315]/80 ring-1 ring-black/[0.08] outline-none transition focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f9fa] md:bg-[#f2f3f4] md:ring-0"
            >
              {societies.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <div className="flex items-center gap-1 rounded-full bg-white p-0.5 ring-1 ring-black/[0.08] md:bg-[#f2f3f4] md:ring-0" role="group" aria-label="Programme layout">
              {([
                { value: "wall" as const, label: "Wall", Icon: LayoutGrid },
                { value: "list" as const, label: "List", Icon: List },
              ]).map(({ value, label, Icon }) => {
                const active = view === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onView(value)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] ${
                      active ? "bg-[#00629B] text-white shadow-sm md:bg-white md:text-[#111315]" : "text-black/65 hover:text-black"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <span role="status" aria-live="polite" className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-black/60">
                {resultCount} {resultCount === 1 ? "poster" : "posters"}
              </span>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-[0.06em] text-[#00629B] transition-colors hover:bg-[#00629B]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Sticky single-row horizontal year rail on mobile (< 56px tall), integrated row on desktop */}
        <div className="sticky top-0 z-20 -mx-5 flex items-center justify-between gap-2 border-y border-black/[0.08] bg-[#f8f9fa]/90 px-5 py-1 backdrop-blur-md sm:-mx-8 sm:px-8 md:static md:mx-0 md:mt-2 md:border-x-0 md:border-b-0 md:border-t md:bg-transparent md:px-0 md:pb-0 md:pt-2 md:backdrop-blur-none">
          <div
            className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar"
            onPointerLeave={() => moveTo(activeYear)}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 h-11 rounded-full bg-[#00629B]/10 transition-all duration-300 ease-out"
              style={{ left: pill.left, width: pill.width, opacity: pill.ready ? 1 : 0 }}
            />
            {years.map((year) => {
              const active = year.value === activeYear;
              return (
                <button
                  key={year.value}
                  ref={(node) => { chipRefs.current[year.value] = node; }}
                  type="button"
                  aria-pressed={active}
                  onPointerEnter={() => moveTo(year.value)}
                  onFocus={() => moveTo(year.value)}
                  onClick={() => onYear(year.value)}
                  className={`relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] ${
                    active ? "text-[#00629B]" : "text-black/65 hover:text-black"
                  }`}
                >
                  {year.value}
                  <span className={`font-mono text-xs tabular-nums ${active ? "text-[#00629B]" : "text-black/58"}`}>
                    {String(year.count).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <span role="status" aria-live="polite" className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-black/60">
              {resultCount} {resultCount === 1 ? "poster" : "posters"}
            </span>
            {hasFilters ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-[0.06em] text-[#00629B] transition-colors hover:bg-[#00629B]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
