import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { getExpand, getField } from "@/lib/safe-get";
import { canRegisterForEvent } from "@/lib/event-lifecycle";

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
  maxCapacity: number;
  registeredCount: number;
  externalFormUrl?: string;
  collectIeeeMember?: boolean;
  society?: { id: string; name: string; slug: string; logoUrl: string };
}

export async function fetchEvents(): Promise<SerializableEvent[]> {
  try {
    const pb = createPublicPB();
    // getFullList handles pagination internally so the public archive never
    // silently stops at the first 20 records.
    const records = await pb.collection("events").getFullList({
      batch: 200,
      filter: 'status="published" || status="completed"',
      sort: "date",
      expand: "society",
      fields:
        "id,created,updated,title,slug,description,date,endDate,venue,price,banner,status,registrationOpen,registrationStart,registrationDeadline,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember,society,expand.society.id,expand.society.name,expand.society.slug,expand.society.logo",
    });

    return records.map((raw: Record<string, unknown>) => {
      const expand = getExpand(raw);
      const societyRaw = expand?.society;
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
      const price = Number(getField(raw, "price", 0)) || 0;
      const status = getField(raw, "status", "published");
      const date = getField(raw, "date", "");
      const endDate = getField(raw, "endDate", "");
      const registrationStart = getField(raw, "registrationStart", "");
      const registrationDeadline = getField(raw, "registrationDeadline", "");
      const rawRegistrationOpen = !!getField(raw, "registrationOpen", false);
      const externalFormUrl = getField(raw, "externalFormUrl", "") || undefined;

      return {
        id: getField(raw, "id", ""),
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
          ? buildFileUrl("events", getField(raw, "id", ""), getField(raw, "banner", ""))
          : "",
        status,
        // `registrationOpen` controls the internal IEEE form. An external form
        // is also a valid public registration action, but both paths are still
        // disabled when the event is completed/past or outside its window.
        registrationOpen: canRegisterForEvent({
          status,
          date,
          endDate,
          registrationOpen: rawRegistrationOpen || Boolean(externalFormUrl),
          registrationStart,
          registrationDeadline,
        }),
        maxCapacity: getField(raw, "maxCapacity", 0),
        registeredCount: getField(raw, "registeredCount", 0),
        externalFormUrl,
        collectIeeeMember: !!getField(raw, "collectIeeeMember", false),
        society,
      };
    });
  } catch {
    return [];
  }
}
export async function fetchEventBySlug(slug: string): Promise<SerializableEvent | null> {
  const pb = createPublicPB();
  try {
    const raw = await pb.collection("events").getFirstListItem(
      `slug = ${escapeFilterValue(slug)} && (status = "published" || status = "completed") && isDeleted != true`,
      {
        expand: "society",
        fields: "id,created,updated,title,slug,description,date,endDate,venue,price,banner,status,registrationOpen,registrationStart,registrationDeadline,maxCapacity,registeredCount,externalFormUrl,collectIeeeMember,society,expand.society.id,expand.society.name,expand.society.slug,expand.society.logo",
      },
    );
    const expand = getExpand(raw);
    const societyRaw = expand?.society;
    const price = Number(getField(raw, "price", 0)) || 0;
    const status = getField(raw, "status", "published");
    const date = getField(raw, "date", "");
    const endDate = getField(raw, "endDate", "");
    const registrationStart = getField(raw, "registrationStart", "");
    const registrationDeadline = getField(raw, "registrationDeadline", "");
    const externalFormUrl = getField(raw, "externalFormUrl", "") || undefined;
    return {
      id: getField(raw, "id", ""), createdAt: getField(raw, "created", ""), updatedAt: getField(raw, "updated", ""),
      title: getField(raw, "title", ""), slug: getField(raw, "slug", ""), description: getField(raw, "description", ""),
      date, endDate, venue: getField(raw, "venue", ""), price, isPaid: price > 0, status,
      bannerUrl: getField(raw, "banner", "") ? buildFileUrl("events", getField(raw, "id", ""), getField(raw, "banner", "")) : "",
      registrationOpen: canRegisterForEvent({
        status, date, endDate, registrationOpen: !!getField(raw, "registrationOpen", false) || Boolean(externalFormUrl),
        registrationStart, registrationDeadline,
      }),
      maxCapacity: getField(raw, "maxCapacity", 0), registeredCount: getField(raw, "registeredCount", 0),
      externalFormUrl, collectIeeeMember: !!getField(raw, "collectIeeeMember", false),
      society: societyRaw ? {
        id: getField(societyRaw, "id", ""), name: getField(societyRaw, "name", ""), slug: getField(societyRaw, "slug", ""),
        logoUrl: getField(societyRaw, "logo", "") ? buildFileUrl("societies", getField(societyRaw, "id", ""), getField(societyRaw, "logo", "")) : "",
      } : undefined,
    };
  } catch {
    return null;
  }
}
