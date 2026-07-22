import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { sanitizeBlogCoverUrl } from "@/lib/blog-content";
import { getField } from "@/lib/safe-get";

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

export async function getPublicEvent(id: string) {
  const record = await getPbClient().collection("events").getOne(id, {
    fields: "id,title,description,date,endDate,venue,price,banner,status,registrationOpen,registrationDeadline,maxCapacity,registeredCount,formTemplate,collectIeeeMember",
  });
  return {
    id: record.id,
    title: String(record.title || ""),
    description: String(record.description || ""),
    date: String(record.date || ""),
    endDate: String(record.endDate || ""),
    venue: String(record.venue || ""),
    price: Number(record.price) || 0,
    isPaid: Number(record.price) > 0,
    bannerUrl: record.banner ? buildFileUrl("events", record.id, String(record.banner)) : "",
    registrationOpen: Boolean(record.registrationOpen),
    maxCapacity: Number(record.maxCapacity) || 0,
    registeredCount: Number(record.registeredCount) || 0,
    collectIeeeMember: Boolean(record.collectIeeeMember),
    formTemplate: Array.isArray(record.formTemplate) ? record.formTemplate : [],
  };
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
  }>;
}

export async function getTicket(ticketId: string) {
  const pb = getPbClient();
  const data = await pb.send(`/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`, {});
  if (!data?.found || !data?.ticket) return { found: false };

  const response: Record<string, unknown> = {
    found: true,
    ticket: data.ticket,
    event: data.event ?? null,
  };

  if (pb.authStore.isValid && data.registrationId) {
    const registration = await pb.collection("registrations").getOne(data.registrationId, {
      fields: "id,userName,userEmail,userPhone,registrationStatus,paymentStatus,registrationDate",
    }).catch(() => null);
    if (registration) {
      response.registration = {
        id: registration.id,
        name: getField(registration, "userName", ""),
        email: getField(registration, "userEmail", ""),
        phone: getField(registration, "userPhone", ""),
        registrationStatus: getField(registration, "registrationStatus", ""),
        paymentStatus: getField(registration, "paymentStatus", ""),
        registrationDate: getField(registration, "registrationDate", "") || data.ticket.createdAt,
      };
    }
  }

  return response;
}
