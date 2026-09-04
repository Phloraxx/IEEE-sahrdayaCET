import catalogue from "../../shared/academic-options.json";

export type SemesterCode = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
export type StudyYear = 1 | 2 | 3 | 4;
export type ProgrammeCode =
  | "CSE"
  | "CSE_AIML"
  | "CPS"
  | "ECE"
  | "EEE"
  | "ELECTRICAL_COMPUTER"
  | "CE"
  | "BME"
  | "BT"
  | "IBT"
  | "IVLSI"
  | "OTHER";

export interface SemesterOption {
  code: SemesterCode;
  year: StudyYear;
}

export interface ProgrammeOption {
  code: ProgrammeCode;
  label: string;
  aliases: readonly string[];
}

export const SEMESTERS = catalogue.semesters as SemesterOption[];
export const PROGRAMMES = catalogue.programmes as ProgrammeOption[];

const SEMESTER_SET = new Set<SemesterCode>(SEMESTERS.map((item) => item.code));
const PROGRAMME_SET = new Set<ProgrammeCode>(PROGRAMMES.map((item) => item.code));

function lookupKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PROGRAMME_ALIASES = new Map<string, ProgrammeCode>();
for (const programme of PROGRAMMES) {
  const names = [programme.code, programme.label, ...programme.aliases];
  for (const name of names) {
    const key = lookupKey(name);
    const existing = PROGRAMME_ALIASES.get(key);
    if (existing && existing !== programme.code) {
      throw new Error(`Academic programme alias collision: ${name}`);
    }
    PROGRAMME_ALIASES.set(key, programme.code);
  }
}

export function isSemesterCode(value: unknown): value is SemesterCode {
  return SEMESTER_SET.has(String(value ?? "").trim().toUpperCase() as SemesterCode);
}

export function normalizeSemester(value: unknown): SemesterCode | "" {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const direct = raw.toUpperCase();
  if (SEMESTER_SET.has(direct as SemesterCode)) return direct as SemesterCode;
  const match = raw.match(/^(?:s|sem(?:ester)?)\s*([1-8])$/i);
  if (!match) return "";
  return `S${match[1]}` as SemesterCode;
}

export function yearForSemester(value: unknown): StudyYear | null {
  const semester = normalizeSemester(value);
  if (!semester) return null;
  return (Math.ceil(Number(semester.slice(1)) / 2) as StudyYear);
}

export function semestersForYear(year: StudyYear): SemesterCode[] {
  return SEMESTERS.filter((item) => item.year === year).map((item) => item.code);
}

export function isProgrammeCode(value: unknown): value is ProgrammeCode {
  return PROGRAMME_SET.has(String(value ?? "").trim().toUpperCase() as ProgrammeCode);
}

export function normalizeProgramme(value: unknown): ProgrammeCode | "" {
  const key = lookupKey(value);
  if (!key) return "";
  return PROGRAMME_ALIASES.get(key) ?? "";
}

export function programmeLabel(value: unknown): string {
  const code = normalizeProgramme(value);
  if (!code) return "";
  return PROGRAMMES.find((item) => item.code === code)?.label ?? "";
}

export function academicCatalogue() {
  return { semesters: SEMESTERS, programmes: PROGRAMMES } as const;
}
