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
    <div className="sticky top-20 z-20 mt-6 -mx-5 px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
      <div className="rounded-[24px] bg-white/85 p-3 shadow-[0_14px_40px_-24px_rgba(6,17,29,0.45)] ring-1 ring-black/[0.05] backdrop-blur-md">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_auto] lg:items-center lg:gap-3">
          <label className="grid min-w-0">
            <span className="sr-only">Search past events</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
              <input
                type="search"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search the programme — title, society or venue"
                className="h-11 w-full rounded-full bg-[#f2f3f4] pl-10 pr-10 text-base text-[#111315] outline-none transition placeholder:text-black/40 focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:text-sm"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => onSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-black/50 transition-colors hover:bg-black/5 hover:text-black focus-visible:outline-2 focus-visible:outline-[#00629B]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </span>
          </label>

          <label className="grid min-w-0">
            <span className="sr-only">Filter by society</span>
            <select
              value={activeSociety}
              onChange={(event) => onSociety(event.target.value)}
              className="h-11 w-full max-w-full rounded-full bg-[#f2f3f4] px-4 text-sm font-semibold text-[#111315]/75 outline-none transition focus-visible:ring-2 focus-visible:ring-[#00629B] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              {societies.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1 rounded-full bg-[#f2f3f4] p-1 lg:justify-self-end" role="group" aria-label="Programme layout">
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
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] ${
                    active ? "bg-white text-[#111315] shadow-sm" : "text-black/50 hover:text-black"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-2">
          <div className="relative flex flex-wrap items-center gap-0.5" onPointerLeave={() => moveTo(activeYear)}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 h-full rounded-full bg-[#00629B]/10 transition-all duration-300 ease-out"
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
                  className={`relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B] ${
                    active ? "text-[#00629B]" : "text-black/50 hover:text-black"
                  }`}
                >
                  {year.value}
                  <span className={`font-mono text-[9px] tabular-nums ${active ? "text-[#00629B]/60" : "text-black/30"}`}>
                    {String(year.count).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span role="status" aria-live="polite" className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black/45">
              {resultCount} {resultCount === 1 ? "poster" : "posters"}
            </span>
            {hasFilters ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex min-h-9 items-center rounded-full px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#00629B] transition-colors hover:bg-[#00629B]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
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
