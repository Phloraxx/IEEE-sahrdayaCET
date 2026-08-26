import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { sanitizeBlogCoverUrl } from "@/lib/blog-content";
import { getField } from "@/lib/safe-get";
import { canRegisterForEvent, isPublicEvent } from "@/lib/event-lifecycle";
import type { FormField } from "@/types";
import type { MyEventRegistration } from "@/lib/registration-state";

export async function listRelatedBlogs(input: {
  societySlug?: string;
  eventId?: string;
  limit?: number;
}) {
  const pb = getPbClient();
  const limit = Math.min(6, Math.max(1, input.limit ?? 3));
  let relationFilter = "";
  if (input.eventId) {
    relationFilter = `event = ${escapeFilterValue(input.eventId)}`;
  } else if (input.societySlug) {
    const society = await pb.collection("societies").getFirstListItem(
      `slug = ${escapeFilterValue(input.societySlug.toLowerCase())}`,
      { fields: "id" },
    ).catch(() => null);
    if (!society) return { items: [] };
    relationFilter = `society = ${escapeFilterValue(society.id)}`;
  }

  const result = await pb.collection("blogs").getList(1, limit, {
    filter: relationFilter ? `published = true && ${relationFilter}` : "published = true",
    sort: "-published_at",
    fields: "id,title,slug,excerpt,cover_url,topic_label,category,published_at,read_minutes",
    skipTotal: true,
  });

  return {
    items: result.items.map((raw) => ({
      id: raw.id,
      title: getField(raw, "title", ""),
      slug: getField(raw, "slug", ""),
      excerpt: getField(raw, "excerpt", ""),
      coverUrl: sanitizeBlogCoverUrl(getField(raw, "cover_url", "")),
      topicLabel: getField(raw, "topic_label", ""),
      category: getField(raw, "category", ""),
      publishedAt: getField(raw, "published_at", ""),
      readMinutes: Number(getField(raw, "read_minutes", 0)) || 1,
    })),
  };
}

export interface PublicRegistrationEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: number;
  isPaid: boolean;
  bannerUrl: string;
  registrationOpen: boolean;
  maxCapacity: number;
  registeredCount: number;
  collectIeeeMember: boolean;
  formFields: FormField[];
}

export async function getPublicEvent(id: string): Promise<PublicRegistrationEvent> {
  const record = await getPbClient().collection("events").getOne(id, {
    fields: "id,slug,title,description,date,endDate,venue,price,banner,status,registrationOpen,registrationStart,registrationDeadline,isDeleted,maxCapacity,registeredCount,formTemplate,collectIeeeMember",
  });
  const lifecycle = {
    status: String(record.status || ""),
    date: String(record.date || ""),
    endDate: String(record.endDate || ""),
    registrationOpen: Boolean(record.registrationOpen),
    registrationStart: String(record.registrationStart || ""),
    registrationDeadline: String(record.registrationDeadline || ""),
    isDeleted: Boolean(record.isDeleted),
  };
  if (!isPublicEvent(lifecycle)) throw new Error("Event not found");
  const price = Number(record.price) || 0;
  return {
    id: record.id,
    slug: String(record.slug || ""),
    title: String(record.title || ""),
    description: String(record.description || ""),
    date: lifecycle.date,
    endDate: lifecycle.endDate,
    venue: String(record.venue || ""),
    price,
    isPaid: price > 0,
    bannerUrl: record.banner ? buildFileUrl("events", record.id, String(record.banner)) : "",
    registrationOpen: canRegisterForEvent(lifecycle),
    maxCapacity: Number(record.maxCapacity) || 0,
    registeredCount: Number(record.registeredCount) || 0,
    collectIeeeMember: Boolean(record.collectIeeeMember),
    formFields: Array.isArray(record.formTemplate) ? record.formTemplate as FormField[] : [],
  };
}

export interface CouponPreview {
  code: string;
  discountPercent: number;
  baseAmount: number;
  discountAmount: number;
  amount: number;
}

export async function previewCoupon(eventId: string, couponCode: string): Promise<CouponPreview> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in before applying a coupon");
  return pb.send(`/api/app/events/${encodeURIComponent(eventId)}/coupon-preview`, {
    method: "POST",
    body: { couponCode: couponCode.trim().toUpperCase() },
  }) as Promise<CouponPreview>;
}

export async function createRegistration(input: {
  userId: string;
  eventId: string;
  formResponses: Record<string, unknown>;
  couponCode?: string;
}) {
  const pb = getPbClient();
  if (!pb.authStore.isValid || pb.authStore.record?.id !== input.userId) {
    throw new Error("Please sign in before registering");
  }
  return pb.send(`/api/app/events/${encodeURIComponent(input.eventId)}/register`, {
    method: "POST",
    body: {
      formResponses: input.formResponses,
      couponCode: input.couponCode || "",
    },
  }) as Promise<{
    registrationId: string;
    ticketId: string;
    paymentRequired: boolean;
    amount: number;
    registrationStatus: string;
    paymentStatus: string;
    reused: boolean;
  }>;
}

export interface RegistrationMemory {
  found: boolean;
  profile: {
    name: string;
    phone: string;
    college: string;
    branch: string;
    semester: string;
    isIeeeMember: boolean;
    ieeeMembershipId: string;
  };
}

export async function getRegistrationMemory(): Promise<RegistrationMemory> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to load saved registration details");
  return pb.send("/api/app/registration-memory", {}) as Promise<RegistrationMemory>;
}

export async function getMyEventRegistration(eventId: string): Promise<MyEventRegistration> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to view your registration");
  const raw = await pb.send(`/api/app/events/${encodeURIComponent(eventId)}/my-registration`, {});
  return {
    found: raw?.found === true,
    registrationId: String(raw?.registrationId || ""),
    registrationStatus: String(raw?.registrationStatus || ""),
    paymentStatus: String(raw?.paymentStatus || ""),
    amount: Number(raw?.amount) || 0,
    paymentRequired: raw?.paymentRequired === true,
    ticketId: String(raw?.ticketId || ""),
    manualReview: raw?.manualReview === true,
    reviewReason: String(raw?.reviewReason || ""),
    receiptAvailable: raw?.receiptAvailable === true,
    eventEnded: raw?.eventEnded === true,
    ticketEmailStatus: String(raw?.ticketEmailStatus || ""),
    receiptEmailStatus: String(raw?.receiptEmailStatus || ""),
  };
}

export interface PublicTicketData {
  found: boolean;
  ticket: {
    id: string;
    paymentStatus: string;
    registrationStatus: string;
    createdAt: string;
  } | null;
  event: {
    id: string;
    title: string;
    date: string;
    endDate: string;
    venue: string;
    bannerUrl: string;
    time: string;
  } | null;
  registration: {
    id: string;
    name: string;
    email: string;
    phone: string;
    registrationStatus: string;
    paymentStatus: string;
    registrationDate: string;
    amount: number;
  } | null;
}

export async function getTicket(ticketId: string): Promise<PublicTicketData> {
  const pb = getPbClient();
  const data = await pb.send(`/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`, {});
  if (!data?.found || !data?.ticket) {
    return { found: false, ticket: null, event: null, registration: null };
  }

  const ticket = {
    id: String(data.ticket.id || ticketId),
    paymentStatus: String(data.ticket.paymentStatus || ""),
    registrationStatus: String(data.ticket.registrationStatus || ""),
    createdAt: String(data.ticket.createdAt || ""),
  };
  const event = data.event
    ? {
        id: String(data.event.id || ""),
        title: String(data.event.title || ""),
        date: String(data.event.date || ""),
        endDate: String(data.event.endDate || ""),
        venue: String(data.event.venue || ""),
        bannerUrl: String(data.event.bannerUrl || ""),
        time: String(data.event.time || ""),
      }
    : null;

  let registration: PublicTicketData["registration"] = null;
  if (pb.authStore.isValid && data.registrationId) {
    const record = await pb.collection("registrations").getOne(data.registrationId, {
      fields: "id,userName,userEmail,userPhone,registrationStatus,paymentStatus,registrationDate,amount",
    }).catch(() => null);
    if (record) {
      registration = {
        id: record.id,
        name: getField(record, "userName", ""),
        email: getField(record, "userEmail", ""),
        phone: getField(record, "userPhone", ""),
        registrationStatus: getField(record, "registrationStatus", ""),
        paymentStatus: getField(record, "paymentStatus", ""),
        registrationDate: getField(record, "registrationDate", "") || ticket.createdAt,
        amount: Number(getField(record, "amount", 0)) || 0,
      };
    }
  }

  return { found: true, ticket, event, registration };
}
