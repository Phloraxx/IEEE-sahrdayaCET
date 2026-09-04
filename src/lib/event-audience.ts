import {
  normalizeProgramme,
  normalizeSemester,
  PROGRAMMES,
  SEMESTERS,
  semestersForYear,
  type ProgrammeCode,
  type SemesterCode,
  type StudyYear,
} from "@/lib/academic-options";

export interface EventAudienceDefinition {
  eligibleSemesters?: readonly string[] | null;
  eligibleProgrammes?: readonly string[] | null;
}

export interface AttendeeAcademicInput {
  programmeCode?: string;
  branch?: string;
  semester?: string;
}

export interface AudienceEligibility {
  eligible: boolean;
  code: "ELIGIBLE" | "SEMESTER_REQUIRED" | "SEMESTER_NOT_ELIGIBLE" | "PROGRAMME_REQUIRED" | "PROGRAMME_NOT_ELIGIBLE" | "OTHER_PROGRAMME_REQUIRED";
  message: string;
  programmeCode: ProgrammeCode | "";
  semester: SemesterCode | "";
}
function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

export function normalizeEligibleSemesters(values: readonly string[] | null | undefined): SemesterCode[] {
  return unique((values ?? []).map(normalizeSemester).filter((value): value is SemesterCode => Boolean(value)));
}

export function normalizeEligibleProgrammes(values: readonly string[] | null | undefined): ProgrammeCode[] {
  return unique((values ?? []).map(normalizeProgramme).filter((value): value is ProgrammeCode => Boolean(value)));
}

export function evaluateAudienceEligibility(event: EventAudienceDefinition, input: AttendeeAcademicInput): AudienceEligibility {
  const semesters = normalizeEligibleSemesters(event.eligibleSemesters);
  const programmes = normalizeEligibleProgrammes(event.eligibleProgrammes);
  const semester = normalizeSemester(input.semester);
  const explicit = String(input.programmeCode ?? "").trim();
  const branch = String(input.branch ?? "").trim();
  const programmeCode = explicit ? normalizeProgramme(explicit) : normalizeProgramme(branch);
  if (semesters.length && !semester) return { eligible: false, code: "SEMESTER_REQUIRED", message: "Select your semester to continue", programmeCode, semester };
  if (semesters.length && semester && !semesters.includes(semester)) return { eligible: false, code: "SEMESTER_NOT_ELIGIBLE", message: "This event is not open to your semester", programmeCode, semester };
  if (programmes.length && !programmeCode) return { eligible: false, code: "PROGRAMME_REQUIRED", message: "Select your programme to continue", programmeCode, semester };
  if (programmes.length && programmeCode && !programmes.includes(programmeCode)) return { eligible: false, code: "PROGRAMME_NOT_ELIGIBLE", message: "This event is not open to your programme", programmeCode, semester };
  if (programmeCode === "OTHER" && !branch) return { eligible: false, code: "OTHER_PROGRAMME_REQUIRED", message: "Enter your programme name", programmeCode, semester };
  return { eligible: true, code: "ELIGIBLE", message: "", programmeCode, semester };
}
export const ALL_SEMESTER_CODES = SEMESTERS.map((item) => item.code);
export const ALL_PROGRAMME_CODES = PROGRAMMES.map((item) => item.code);

export function toggleSemesterYear(current: readonly string[], year: StudyYear): SemesterCode[] {
  const selected = normalizeEligibleSemesters(current);
  const effective = selected.length ? selected : [...ALL_SEMESTER_CODES];
  const yearSemesters = semestersForYear(year);
  const removing = yearSemesters.every((code) => effective.includes(code));
  const next = removing
    ? effective.filter((code) => !yearSemesters.includes(code))
    : unique([...effective, ...yearSemesters]);
  const ordered = ALL_SEMESTER_CODES.filter((code) => next.includes(code));
  return ordered.length === ALL_SEMESTER_CODES.length ? [] : ordered;
}

export function toggleSemester(current: readonly string[], code: SemesterCode): SemesterCode[] {
  const selected = normalizeEligibleSemesters(current);
  const effective = selected.length ? [...ALL_SEMESTER_CODES] : [];
  const base = selected.length ? selected : effective;
  const next = base.includes(code) ? base.filter((item) => item !== code) : unique([...base, code]);
  return next.length === ALL_SEMESTER_CODES.length ? [] : next;
}

export function toggleProgramme(current: readonly string[], code: ProgrammeCode): ProgrammeCode[] {
  const selected = normalizeEligibleProgrammes(current);
  const effective = selected.length ? selected : [...ALL_PROGRAMME_CODES];
  const next = effective.includes(code) ? effective.filter((item) => item !== code) : unique([...effective, code]);
  return next.length === ALL_PROGRAMME_CODES.length ? [] : next;
}