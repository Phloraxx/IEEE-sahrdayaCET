import { buildFileUrl } from "@/lib/pb";
import { htmlToPlainText } from "@/lib/rich-text";
import { canRegisterForEvent, isPastEvent } from "@/lib/event-lifecycle";
import { fetchExecomData } from "./execom.server";
import { logError } from "@/lib/logger";
import { listPublicSocieties, listUpcomingEvents, type EventRow } from "./repo.server";
import type { ExecomMemberDoc } from "@/features/execom/ExecomClient";
import type { Society } from "@/types";

export interface HomeEventSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  endDate: string;
  timeTbc: boolean;
  venue: string;
  price: number;
  bannerUrl: string;
  registrationAvailable: boolean;
  society?: { id: string; name: string; slug: string };
}

export interface HomeData {
  upcomingEvents: HomeEventSummary[];
  upcomingCount: number;
  societies: Society[];
  execomCount: number;
  coreTeam: ExecomMemberDoc[];
  unavailable: string[];
}

function mapHomeEvent(row: EventRow): HomeEventSummary {
  const status = row.status ?? "published";
  const date = row.date ?? "";
  const endDate = row.end_date ?? "";
  const timeTbc = row.time_tbc === 1;
  const registrationOpen = row.registration_open === 1;
  const registrationMode = row.registration_mode ?? "";
  const externalFormUrl = row.external_form_url ?? "";
  const registrationStart = row.registration_start ?? "";
  const registrationDeadline = row.registration_deadline ?? "";

  return {
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    description: htmlToPlainText(row.description ?? ""),
    date,
    endDate,
    timeTbc,
    venue: row.venue ?? "",
    price: Number(row.price) || 0,
    bannerUrl: row.banner ? buildFileUrl("events", row.id, row.banner) : "",
    registrationAvailable: canRegisterForEvent({
      status,
      date,
      endDate,
      timeTbc,
      registrationOpen,
      registrationMode,
      externalFormUrl,
      registrationStart,
      registrationDeadline,
    }),
    society:
      row.society_row_id && row.society_name
        ? {
            id: row.society_row_id,
            name: row.society_name,
            slug: row.society_slug ?? "",
          }
        : undefined,
  };
}

/**
 * Home page data.
 *
 * Each section is fetched independently and failures are reported per section
 * (`unavailable`) rather than failing the whole page — the same behaviour the
 * PocketBase version had, where one rejected promise degraded one section.
 */
export async function fetchHomeData(): Promise<HomeData> {
  const fallback: HomeData = {
    upcomingEvents: [],
    upcomingCount: 0,
    societies: [],
    execomCount: 0,
    coreTeam: [],
    unavailable: ["programme", "communities", "team"],
  };

  try {
    // Fetch a generous window of upcoming events, then filter past ones and
    // slice — `isPastEvent` needs the event's own date/endDate, not SQL's.
    const [eventsResult, societiesResult, execomResult] = await Promise.allSettled([
      listUpcomingEvents(100),
      listPublicSocieties(),
      fetchExecomData(),
    ]);

    const societies: Society[] =
      societiesResult.status === "fulfilled"
        ? societiesResult.value.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            logoUrl: row.logo ? buildFileUrl("societies", row.id, row.logo) : undefined,
          }))
        : [];

    const allUpcoming =
      eventsResult.status === "fulfilled"
        ? eventsResult.value
            .map(mapHomeEvent)
            .filter((event) => !isPastEvent(event))
        : [];

    const sections = ["programme", "communities", "team"];
    const results = [eventsResult, societiesResult, execomResult];
    const unavailable = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      logError(`home-${sections[index]}`, result.reason);
      return [sections[index] ?? "content"];
    });

    return {
      coreTeam:
        execomResult.status === "fulfilled"
          ? execomResult.value.filter((member) => member.sectionId === "core")
          : [],
      unavailable,
      upcomingEvents: allUpcoming.slice(0, 4),
      upcomingCount: allUpcoming.length,
      societies,
      execomCount: execomResult.status === "fulfilled" ? execomResult.value.length : 0,
    };
  } catch (error) {
    logError("fetchHomeData", error);
    return fallback;
  }
}
