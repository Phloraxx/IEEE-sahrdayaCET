import { Ticket } from "lucide-react";
import type { ExtendedEvent } from "@/types";
import { YearChapter } from "./YearChapter";
import { YEAR_OPENERS } from "./year-openers";

export interface PosterGroup {
  year: string;
  events: ExtendedEvent[];
}

interface PosterWallProps {
  groups: PosterGroup[];
  emptyTitle: string;
  emptyMessage: string;
  onReset?: () => void;
}

export function PosterWall({ groups, emptyTitle, emptyMessage, onReset }: PosterWallProps) {
  if (groups.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-[28px] border border-black/10 bg-white/60 px-4 py-12 text-center">
        <div>
          <Ticket aria-hidden="true" className="mx-auto mb-4 h-6 w-6 text-black/25" />
          <h3 className="text-xl font-semibold tracking-[-0.03em]">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-black/60">{emptyMessage}</p>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#00629B] transition-colors hover:bg-[#00629B]/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00629B]"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16 md:space-y-24">
      {groups.map((group) => (
        <YearChapter
          key={group.year}
          year={group.year}
          events={group.events}
          opener={YEAR_OPENERS[group.year]}
        />
      ))}
    </div>
  );
}
