import type { RecordModel } from "pocketbase";
import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
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
  allowedSocietyIds?: string[];
  allowedEventIds?: string[];
}): Promise<AdminEventsResponse> {
  const pb = getPbClient();
  const filters = ["isDeleted = false"];
  if (input.search) filters.push(`title ~ ${escapeFilterValue(input.search)}`);
  if (input.status && input.status !== "all") {
    filters.push(`status = ${escapeFilterValue(input.status)}`);
  }
  if (input.allowedSocietyIds || input.allowedEventIds) {
    const scopes = [
      ...(input.allowedSocietyIds ?? []).map((id) => `society = ${escapeFilterValue(id)}`),
      ...(input.allowedEventIds ?? []).map((id) => `id = ${escapeFilterValue(id)}`),
    ];
    filters.push(scopes.length ? `(${scopes.join(" || ")})` : 'id = ""');
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
  const event = await pb.collection("events").getOne(id, { expand: "society" });
  return {
    event: {
      ...event,
      bannerUrl: event.banner ? buildFileUrl("events", event.id, String(event.banner)) : null,
    },
  };
}

export async function listEventCoupons(eventId: string): Promise<{ coupons: Coupon[] }> {
  const pb = getPbClient();
  const records = await pb.collection("coupons").getFullList({
    filter: `event = ${escapeFilterValue(eventId)}`,
    sort: "created",
  });
  return {
    coupons: records.map((record) => ({
      id: record.id,
      event: String(record.event || ""),
      code: String(record.code || ""),
      discountPercent: Number(record.discountPercent) || 0,
      maxUses: Number(record.maxUses) || 0,
      usedCount: Number(record.usedCount) || 0,
      expiresAt: record.expiresAt ? String(record.expiresAt) : undefined,
      isActive: Boolean(record.isActive),
      createdAt: record.created ? String(record.created) : undefined,
      updatedAt: record.updated ? String(record.updated) : undefined,
    } satisfies Coupon)),
  };
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
  removeBanner?: boolean;
}) {
  const pb = getPbClient();
  const { coupons = [], ...eventFields } = input.payload;
  if (input.removeBanner && !input.bannerFile) eventFields.banner = "";
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

export async function cancelAdminEvent(id: string, reason: string) {
  return getPbClient().send(`/api/admin/events/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  }) as Promise<{ alreadyCancelled: boolean; cancelled: number; refundReview: number; manualRefundRequired: number; releasedPending: number }>;
}
