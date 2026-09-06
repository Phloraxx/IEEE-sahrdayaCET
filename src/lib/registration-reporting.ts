import { normalizeProgramme, normalizeSemester, programmeLabel, yearForSemester } from "@/lib/academic-options";
import { getField, getNumberField } from "@/lib/safe-get";

export type RegistrationDiscountSource = "none" | "ieee_member" | "coupon";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function hasField(record: unknown, key: string): boolean {
  return Boolean(record && typeof record === "object" && key in record);
}

export interface RegistrationReportingSnapshot {
  programmeCode: string;
  programme: string;
  semester: string;
  studyYear: number | null;
  ieeeMember: boolean;
  ieeeMemberId: string;
  discountSource: RegistrationDiscountSource;
  couponCode: string;
  discountAmount: number;
}

export function registrationReportingSnapshot(record: unknown): RegistrationReportingSnapshot {
  const responses = objectValue(getField(record, "formResponses", null));
  const canonicalProgramme = clean(getField(record, "programmeCode", ""));
  const legacyProgramme = clean(responses.programmeCode || responses.branch || responses.department);
  const programmeCode = normalizeProgramme(canonicalProgramme) || normalizeProgramme(legacyProgramme);
  const legacyProgrammeLabel = clean(responses.branch || responses.department || responses.programme);
  const programme = programmeCode && programmeCode !== "OTHER"
    ? programmeLabel(programmeCode)
    : legacyProgrammeLabel || (programmeCode === "OTHER" ? "Other / external programme" : "");

  const canonicalSemester = clean(getField(record, "semester", ""));
  const legacySemester = clean(responses.semester);
  const normalizedSemester = normalizeSemester(canonicalSemester) || normalizeSemester(legacySemester);
  const semester = normalizedSemester || canonicalSemester || legacySemester;

  const ieeeMember = hasField(record, "ieeeMember")
    ? Boolean(getField(record, "ieeeMember", false))
    : responses.isIeeeMember === true;
  const ieeeMemberId = clean(getField(record, "ieeeMemberId", "")) || clean(responses.ieeeMembershipId);

  const couponCode = clean(getField(record, "couponCode", "")).toUpperCase();
  const discountPaise = Math.max(0, getNumberField(record, "discountPaise", 0));
  const legacyDiscountAmount = Math.max(0, getNumberField(record, "discountAmount", 0));
  const discountAmount = discountPaise > 0 ? discountPaise / 100 : legacyDiscountAmount;
  const rawSource = clean(getField(record, "discountSource", ""));
  const discountSource: RegistrationDiscountSource = rawSource === "ieee_member" || rawSource === "coupon"
    ? rawSource
    : couponCode && discountAmount > 0 ? "coupon" : "none";

  return {
    programmeCode,
    programme,
    semester,
    studyYear: yearForSemester(normalizedSemester),
    ieeeMember,
    ieeeMemberId,
    discountSource,
    couponCode,
    discountAmount,
  };
}

export function registrationDiscountLabel(snapshot: Pick<RegistrationReportingSnapshot, "discountSource" | "couponCode">): string {
  if (snapshot.discountSource === "ieee_member") return "IEEE member";
  if (snapshot.discountSource === "coupon") return snapshot.couponCode ? `Coupon ${snapshot.couponCode}` : "Coupon";
  return "None";
}
