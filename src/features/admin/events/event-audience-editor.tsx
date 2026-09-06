import { Check, GraduationCap } from "lucide-react";
import {
  PROGRAMMES,
  SEMESTERS,
  semestersForYear,
  type ProgrammeCode,
  type SemesterCode,
  type StudyYear,
} from "@/lib/academic-options";
import {
  ALL_PROGRAMME_CODES,
  ALL_SEMESTER_CODES,
  normalizeEligibleProgrammes,
  normalizeEligibleSemesters,
  toggleProgramme,
  toggleSemester,
  toggleSemesterYear,
} from "@/lib/event-audience";

interface Props {
  eligibleSemesters: string[];
  eligibleProgrammes: string[];
  onSemestersChange: (values: SemesterCode[]) => void;
  onProgrammesChange: (values: ProgrammeCode[]) => void;
}

const YEARS: Array<{ year: StudyYear; label: string; hint: string }> = [
  { year: 1, label: "First year", hint: "S1 · S2" },
  { year: 2, label: "Second year", hint: "S3 · S4" },
  { year: 3, label: "Third year", hint: "S5 · S6" },
  { year: 4, label: "Fourth year", hint: "S7 · S8" },
];
function optionClass(active: boolean) {
  return `relative rounded-xl border px-4 py-3 text-left transition ${active ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted/30"}`;
}

export function EventAudienceEditor({ eligibleSemesters, eligibleProgrammes, onSemestersChange, onProgrammesChange }: Props) {
  const semesters = normalizeEligibleSemesters(eligibleSemesters);
  const programmes = normalizeEligibleProgrammes(eligibleProgrammes);
  const allSemesters = semesters.length === 0;
  const allProgrammes = programmes.length === 0;

  const semesterChecked = (code: SemesterCode) => allSemesters || semesters.includes(code);
  const programmeChecked = (code: ProgrammeCode) => allProgrammes || programmes.includes(code);

  return (
    <div className="space-y-6 rounded-xl border border-border p-5">
      <div className="flex items-start gap-3">
        <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Who can attend?</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Leave everything open for a branch-wide event, or restrict the exact study years, semesters and programmes allowed to register.</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-semibold">Study year</p><p className="mt-1 text-xs text-muted-foreground">Selecting all years is stored as unrestricted.</p></div>
          <button type="button" onClick={() => onSemestersChange([])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${allSemesters ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>All years</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {YEARS.map(({ year, label, hint }) => {
            const codes = semestersForYear(year);
            const active = allSemesters || codes.every((code) => semesters.includes(code));
            return <button key={year} type="button" onClick={() => onSemestersChange(toggleSemesterYear(semesters, year))} className={optionClass(active)}><span className="text-sm font-semibold">{label}</span><span className="mt-1 block text-xs opacity-65">{hint}</span>{active && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}</button>;
          })}
        </div>
      </div>
      <details className="rounded-lg border border-border bg-muted/15 p-4">
        <summary className="cursor-pointer text-xs font-semibold">Advanced semester control</summary>
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {SEMESTERS.map(({ code }) => {
            const active = semesterChecked(code);
            return <button key={code} type="button" onClick={() => onSemestersChange(toggleSemester(semesters, code))} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>{code}</button>;
          })}
        </div>
      </details>

      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-semibold">Programme / branch</p><p className="mt-1 text-xs text-muted-foreground">Use the canonical programme list so attendee data stays consistent.</p></div>
          <button type="button" onClick={() => onProgrammesChange([])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${allProgrammes ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>All programmes</button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {PROGRAMMES.map((programme) => {
            const active = programmeChecked(programme.code);
            return <button key={programme.code} type="button" onClick={() => onProgrammesChange(toggleProgramme(programmes, programme.code))} className={optionClass(active)}><span className="pr-6 text-sm font-medium">{programme.label}</span>{active && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}</button>;
          })}
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        {allSemesters && allProgrammes
          ? "Audience: all years and programmes. Academic fields remain optional for external/non-student attendees."
          : `${allSemesters ? "All years" : `${semesters.length}/${ALL_SEMESTER_CODES.length} semesters`} · ${allProgrammes ? "All programmes" : `${programmes.length}/${ALL_PROGRAMME_CODES.length} programmes`}`}
      </p>
    </div>
  );
}
