import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { getExpand, getField } from "@/lib/safe-get";
import { canRegisterForEvent, getRegistrationMode, type EventRegistrationMode } from "@/lib/event-lifecycle";
import { logError } from "@/lib/logger";

const PUBLIC_EVENT_FIELDS =
  "id,created,updated,title,slug,description,date,endDate,venue,price,banner,status,registrationOpen,registrationMode,registrationStart,registrationDeadline,maxCapacity,registeredCount,externalFormUrl,externalLink,collectIeeeMember,society,expand.society.id,expand.society.name,expand.society.slug,expand.society.logo";

export interface SerializableEvent {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
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
  externalFormUrl?: string;
  externalLink?: string;
  collectIeeeMember?: boolean;
  society?: { id: string; name: string; slug: string; logoUrl: string };
}

function mapPublicEvent(raw: Record<string, unknown>): SerializableEvent {
  const expand = getExpand(raw);
  const societyRaw = expand?.society;
  const id = getField(raw, "id", "");
  const price = Number(getField(raw, "price", 0)) || 0;
  const status = getField(raw, "status", "published");
  const date = getField(raw, "date", "");
  const endDate = getField(raw, "endDate", "");
  const registrationStart = getField(raw, "registrationStart", "");
  const registrationDeadline = getField(raw, "registrationDeadline", "");
  const externalFormUrl = getField(raw, "externalFormUrl", "") || undefined;
  const registrationMode = getRegistrationMode({
    registrationMode: getField(raw, "registrationMode", ""),
    registrationOpen: Boolean(getField(raw, "registrationOpen", false)),
    externalFormUrl,
  });

  const society = societyRaw
    ? {
        id: getField(societyRaw, "id", ""),
        name: getField(societyRaw, "name", ""),
        slug: getField(societyRaw, "slug", ""),
        logoUrl: getField(societyRaw, "logo", "")
          ? buildFileUrl(
              "societies",
              getField(societyRaw, "id", ""),
              getField(societyRaw, "logo", ""),
            )
          : "",
      }
    : undefined;

  return {
    id,
    createdAt: getField(raw, "created", ""),
    updatedAt: getField(raw, "updated", ""),
    title: getField(raw, "title", ""),
    slug: getField(raw, "slug", ""),
    description: getField(raw, "description", ""),
    date,
    endDate,
    venue: getField(raw, "venue", ""),
    price,
    isPaid: price > 0,
    bannerUrl: getField(raw, "banner", "")
      ? buildFileUrl("events", id, getField(raw, "banner", ""))
      : "",
    status,
    registrationOpen: canRegisterForEvent({
      status,
      date,
      endDate,
      registrationOpen: Boolean(getField(raw, "registrationOpen", false)),
      registrationMode,
      externalFormUrl,
      registrationStart,
      registrationDeadline,
    }),
    registrationMode,
    registrationStart,
    registrationDeadline,
    maxCapacity: getField(raw, "maxCapacity", 0),
    registeredCount: getField(raw, "registeredCount", 0),
    externalFormUrl,
    externalLink: getField(raw, "externalLink", "") || undefined,
    collectIeeeMember: Boolean(getField(raw, "collectIeeeMember", false)),
    society,
  };
}

export async function fetchEvents(): Promise<SerializableEvent[]> {
  try {
    const records = await createPublicPB().collection("events").getFullList({
      batch: 200,
      filter: '(status="published" || status="completed") && isDeleted != true',
      sort: "date",
      expand: "society",
      fields: PUBLIC_EVENT_FIELDS,
    });
    return records.map((record) => mapPublicEvent(record));
  } catch (error) {
    logError("fetchEvents", error);
    return [];
  }
}

export async function fetchEventBySlug(
  slug: string,
): Promise<SerializableEvent | null> {
  try {
    const record = await createPublicPB()
      .collection("events")
      .getFirstListItem(
        `slug = ${escapeFilterValue(slug)} && (status = "published" || status = "completed") && isDeleted != true`,
        { expand: "society", fields: PUBLIC_EVENT_FIELDS },
      );
    return mapPublicEvent(record);
  } catch {
    return null;
  }
}
