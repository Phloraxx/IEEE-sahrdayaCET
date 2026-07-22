import type { RecordModel } from "pocketbase";
import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { reconcileCoupons } from "@/lib/coupon-service";
import { softDeleteEvent } from "@/lib/event-service";
import type { Coupon } from "@/types";

export interface AdminEventListItem {
  id: string;
  title: string;
  date: string;
  endDate: string;
  venue: string;
  price: number;
  status: string;
  registrationOpen: boolean;
  maxCapacity: number;
  registeredCount: number;
  checkedInCount: number;
  isPaid: boolean;
  societyName: string;
  societyId: string;
}

export interface AdminEventsResponse {
  events: AdminEventListItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export async function listAdminEvents(input: {
  page: number;
  perPage: number;
  search?: string;
  status?: string;
}): Promise<AdminEventsResponse> {
  const pb = getPbClient();
  const filters = ["isDeleted = false"];
  if (input.search) filters.push(`title ~ ${escapeFilterValue(input.search)}`);
  if (input.status && input.status !== "all") {
    filters.push(`status = ${escapeFilterValue(input.status)}`);
  }

  const result = await pb.collection("events").getList(input.page, input.perPage, {
    filter: filters.join(" && "),
    sort: "-date",
    expand: "society",
    fields:
      "id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name",
  });

  const events = result.items.map((record) => {
    const society = record.expand?.society as RecordModel | undefined;
    return {
      id: record.id,
      title: String(record.title || ""),
      date: String(record.date || ""),
      endDate: String(record.endDate || ""),
      venue: String(record.venue || ""),
      price: Number(record.price) || 0,
      status: String(record.status || ""),
      registrationOpen: Boolean(record.registrationOpen),
      maxCapacity: Number(record.maxCapacity) || 0,
      registeredCount: Number(record.registeredCount) || 0,
      checkedInCount: Number(record.checkedInCount) || 0,
      isPaid: Number(record.price) > 0,
      societyName: String(society?.name || ""),
      societyId: String(society?.id || record.society || ""),
    } satisfies AdminEventListItem;
  });

  return {
    events,
    total: result.totalItems,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.totalPages > result.page,
  };
}

export async function getAdminEvent(id: string) {
  const pb = getPbClient();
  return { event: await pb.collection("events").getOne(id, { expand: "society" }) };
}

export async function listEventCoupons(eventId: string): Promise<{ coupons: Coupon[] }> {
  const pb = getPbClient();
  const records = await pb.collection("coupons").getFullList({
    filter: `event = ${escapeFilterValue(eventId)}`,
    sort: "created",
  });
  return { coupons: records as unknown as Coupon[] };
}

function eventPayloadToBody(
  payload: Record<string, unknown>,
  bannerFile?: File | null,
): Record<string, unknown> | FormData {
  if (!bannerFile) return payload;
  const body = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  body.append("banner", bannerFile);
  return body;
}

export async function saveAdminEvent(input: {
  id?: string;
  payload: Record<string, unknown>;
  bannerFile?: File | null;
}) {
  const pb = getPbClient();
  const { coupons = [], ...eventFields } = input.payload;
  const body = eventPayloadToBody(eventFields, input.bannerFile);

  let event: RecordModel;
  if (input.id) {
    event = await pb.collection("events").update(input.id, body);
  } else {
    event = await pb.collection("events").create(body);
  }

  try {
    await reconcileCoupons(pb, event.id, (coupons as Coupon[]).map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      maxUses: coupon.maxUses,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
    })));
  } catch (error) {
    // The coupon set itself is atomic. On new-event failure we can safely remove
    // the just-created event; on edits, the event update remains and the coupon
    // reconciliation can be retried without partially applying the coupon set.
    if (!input.id) {
      try { await pb.collection("events").delete(event.id); } catch { /* best effort */ }
    }
    throw error;
  }

  return { event };
}

export async function deleteAdminEvent(id: string) {
  await softDeleteEvent(id, getPbClient());
}
