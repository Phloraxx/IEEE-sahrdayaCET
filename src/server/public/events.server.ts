import { buildFileUrl } from "@/lib/pb";
import { canRegisterForEvent, getRegistrationMode, type EventRegistrationMode } from "@/lib/event-lifecycle";
import { getEventAttendanceMode, type EventAttendanceMode } from "@/lib/event-presentation";
import { normalizeEligibleProgrammes, normalizeEligibleSemesters } from "@/lib/event-audience";
import { normalizeEventRequirements } from "@/lib/event-requirements";
import { isPublicDisplayEvent } from "@/lib/public-event-filter";
import { publicDataUnavailable } from "./errors.server";
import {
  getPublicEventBySlug,
  listPublicEvents,
  type EventRow,
} from "./repo.server";

export interface SerializableEvent {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  endDate: string;
  timeTbc: boolean;
  venue: string;
  timezone: string;
  attendanceMode: EventAttendanceMode;
  locationAddress: string;
  price: number;
  isPaid: boolean;
  bannerUrl: string;
  status: string;
  registrationOpen: boolean;
  registrationMode: EventRegistrationMode;
  registrationStart: string;
  registrationDeadline: string;
  maxCapacity: number;
  registeredCount: number;
  waitlistEnabled: boolean;
  waitlistReservedCount: number;
  externalFormUrl?: string;
  externalLink?: string;
  collectIeeeMember?: boolean;
  ieeeMemberDiscountPercent?: number;
  eligibleSemesters?: string[];
  requirements?: string[];
  attendeeNote?: string;
  eligibleProgrammes?: string[];
  society?: { id: string; name: string; slug: string; logoUrl: string };
}

/**
 * JSON text column -> string array.
 *
 * These columns hold arrays of strings (semesters, programmes, requirements).
 * Non-strings are dropped rather than passed on, so a malformed row degrades to
 * "no restriction" instead of crashing the page.
 */
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

function mapEventRow(row: EventRow): SerializableEvent {
  const price = Number(row.price) || 0;
  const status = row.status ?? "published";
  const date = row.date ?? "";
  const endDate = row.end_date ?? "";
  const timeTbc = row.time_tbc === 1;
  const registrationStart = row.registration_start ?? "";
  const registrationDeadline = row.registration_deadline ?? "";
  const externalFormUrl = row.external_form_url || undefined;
  const registrationMode = getRegistrationMode({
    registrationMode: row.registration_mode ?? "",
    registrationOpen: row.registration_open === 1,
    externalFormUrl,
  });

  const society =
    row.society_row_id && row.society_name
      ? {
          id: row.society_row_id,
          name: row.society_name,
          slug: row.society_slug ?? "",
          logoUrl: row.society_logo
            ? buildFileUrl("societies", row.society_row_id, row.society_logo)
            : "",
        }
      : undefined;

  return {
    id: row.id,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
    title: row.title ?? "",
    slug: row.slug ?? "",
    description: row.description ?? "",
    date,
    endDate,
    timeTbc,
    venue: row.venue ?? "",
    timezone: row.timezone || "Asia/Kolkata",
    attendanceMode: getEventAttendanceMode({
      attendanceMode: row.attendance_mode ?? "",
      venue: row.venue ?? "",
    }),
    locationAddress: row.location_address ?? "",
    price,
    isPaid: price > 0,
    bannerUrl: row.banner ? buildFileUrl("events", row.id, row.banner) : "",
    status,
    registrationOpen: canRegisterForEvent({
      status,
      date,
      endDate,
      timeTbc,
      registrationOpen: row.registration_open === 1,
      registrationMode,
      externalFormUrl,
      registrationStart,
      registrationDeadline,
    }),
    registrationMode,
    registrationStart,
    registrationDeadline,
    maxCapacity: Number(row.max_capacity) || 0,
    registeredCount: Number(row.registered_count) || 0,
    waitlistEnabled: row.waitlist_enabled === 1,
    waitlistReservedCount: Number(row.waitlist_reserved_count) || 0,
    externalFormUrl,
    externalLink: row.external_link || undefined,
    collectIeeeMember: row.collect_ieee_member === 1,
    ieeeMemberDiscountPercent: Number(row.ieee_member_discount_percent) || 0,
    eligibleSemesters: normalizeEligibleSemesters(parseJsonArray(row.eligible_semesters)),
    eligibleProgrammes: normalizeEligibleProgrammes(parseJsonArray(row.eligible_programmes)),
    requirements: normalizeEventRequirements(parseJsonArray(row.requirements)),
    attendeeNote: String(row.attendee_note ?? "").trim(),
    society,
  };
}

export async function fetchEvents(): Promise<SerializableEvent[]> {
  try {
    const rows = await listPublicEvents();
    return rows.map(mapEventRow).filter(isPublicDisplayEvent);
  } catch (error) {
    publicDataUnavailable("fetchEvents", error);
  }
}

export async function fetchEventBySlug(
  slug: string,
): Promise<SerializableEvent | null> {
  try {
    const row = await getPublicEventBySlug(slug);
    if (!row) return null;
    const mapped = mapEventRow(row);
    return isPublicDisplayEvent(mapped) ? mapped : null;
  } catch (error) {
    publicDataUnavailable("fetchEventBySlug", error);
  }
}

export { mapEventRow, parseJsonArray };
