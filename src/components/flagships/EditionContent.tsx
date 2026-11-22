import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { FlagshipEdition } from "@/lib/flagships";
import { flagshipLabelClass, flagshipLinkClass } from "./FlagshipLayout";

export function EditionContent({ edition }: { edition: FlagshipEdition }) {
  return (
    <div>
      <p className="max-w-3xl text-lg leading-relaxed text-slate-600">{edition.summary}</p>
      <h3 className={`mt-7 ${flagshipLabelClass}`}>Workshop tracks</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {edition.tracks.map(track => <li key={track} className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">{track}</li>)}
      </ul>
      <div className="mt-8 space-y-7">
        {edition.highlights.map((highlight, index) => (
          <div key={highlight.title} className="flex gap-4 sm:gap-6">
            <span aria-hidden="true" className="pt-1 font-mono text-xs text-ieee-blue">{String(index + 1).padStart(2, "0")}</span>
            <div><h3 className="text-lg font-semibold tracking-tight">{highlight.title}</h3><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{highlight.text}</p></div>
          </div>
        ))}
      </div>
      {edition.recap && <Link to={edition.recap.href} className={`mt-7 ${flagshipLinkClass}`}>{edition.recap.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
    </div>
  );
}
