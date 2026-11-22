import { buildFileUrl } from "@/lib/pb";
import { canUseInternalRegistration, isPublicEvent } from "@/lib/event-lifecycle";
import { getEventAttendanceMode } from "@/lib/event-presentation";
import { normalizeEligibleProgrammes, normalizeEligibleSemesters } from "@/lib/event-audience";
import { normalizeEventRequirements } from "@/lib/event-requirements";
import { getEventById } from "./repo.server";
import type { FormField } from "@/types";

/** JSON text column -> string array, tolerating NULL and malformed values. */
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/**
 * `form_template` holds an array of form-field objects, not strings.
 *
 * Each entry is validated as an object before being handed to the form renderer;
 * anything else is dropped so a malformed template degrades to "no custom
 * questions" instead of breaking the registration page.
 */
function parseFormFields(value: string | null): FormField[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FormField => typeof item === "object" && item !== null && "id" in item,
    );
  } catch {
    return [];
  }
}

export async function fetchEventForRegistration(eventId: string) {
  const row = await getEventById(eventId);
  if (!row) throw new Response("Event not found", { status: 404 });

  const lifecycle = {
    status: row.status ?? "",
    date: row.date ?? "",
    endDate: row.end_date ?? "",
    timeTbc: row.time_tbc === 1,
    registrationOpen: row.registration_open === 1,
    registrationMode: row.registration_mode ?? "",
    externalFormUrl: row.external_form_url ?? "",
    registrationStart: row.registration_start ?? "",
    registrationDeadline: row.registration_deadline ?? "",
    isDeleted: row.is_deleted === 1,
  };

  if (!isPublicEvent(lifecycle)) throw new Response("Event not found", { status: 404 });

  const price = Number(row.price) || 0;
  const timezone = row.timezone || "Asia/Kolkata";
  const attendanceMode = getEventAttendanceMode({
    attendanceMode: row.attendance_mode ?? "",
    venue: row.venue ?? "",
  });

  const event = {
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    date: lifecycle.date,
    endDate: lifecycle.endDate,
    timeTbc: lifecycle.timeTbc,
    venue: row.venue ?? "",
    timezone,
    attendanceMode,
    locationAddress: row.location_address ?? "",
    price,
    isPaid: price > 0,
    bannerUrl: row.banner ? buildFileUrl("events", eventId, row.banner) : "",
    // Completed/past events stay publicly viewable, but this route renders the
    // existing Registration Closed state instead of an active form.
    registrationOpen: canUseInternalRegistration(lifecycle),
    maxCapacity: Number(row.max_capacity) || 0,
    registeredCount: Number(row.registered_count) || 0,
    waitlistEnabled: row.waitlist_enabled === 1,
    waitlistReservedCount: Number(row.waitlist_reserved_count) || 0,
    collectIeeeMember: row.collect_ieee_member === 1,
    ieeeMemberDiscountPercent: Number(row.ieee_member_discount_percent) || 0,
    eligibleSemesters: normalizeEligibleSemesters(parseJsonArray(row.eligible_semesters)),
    requirements: normalizeEventRequirements(parseJsonArray(row.requirements)),
    attendeeNote: String(row.attendee_note ?? "").trim(),
    eligibleProgrammes: normalizeEligibleProgrammes(parseJsonArray(row.eligible_programmes)),
    formFields: parseFormFields(row.form_template),
  };
  return { event };
}
