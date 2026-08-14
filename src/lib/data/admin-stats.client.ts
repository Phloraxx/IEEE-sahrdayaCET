import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { MS_PER_DAY, RECENT_WINDOW_DAYS, UPCOMING_WINDOW_DAYS } from "@/lib/constants";
import { getAppDayBounds, toIso } from "@/lib/dates";
import { getField } from "@/lib/safe-get";

export interface AdminStats {
  events: { total: number; published: number; upcoming: number; live: number; recentlyCompleted: number };
  registrations: { total: number; confirmed: number; pending: number; today: number };
  execom: { total: number | null };
  societies: { total: number | null; active: number | null };
  attention: { stalePending: number; cancelledPaid: number; failedNotifications: number };
  upcomingEvents: Array<{ id: string; title: string; date: string; endDate: string; registeredCount: number; maxCapacity: number; status: string }>;
  recentActivity: Array<{ id: string; action: string; note: string; created: string; actorName: string; eventTitle: string }>;
}

export async function getAdminStats(): Promise<AdminStats> {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  if (role !== "admin" && role !== "chair") throw new Error("Admin or chair access required");
  const now = new Date();
  const nowIso = toIso(now);
  const staleIso = toIso(new Date(now.getTime() - 10 * 60_000));
  const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY));
  const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY));
  const { startIso: startOfToday, endIso: endOfToday } = getAppDayBounds(now);
  const count = async (collection: string, filter?: string) =>
    (await pb.collection(collection).getList(1, 1, { filter, fields: "id", requestKey: null })).totalItems;

  const [eventsTotal, eventsPublished, eventsUpcoming, eventsLive, eventsRecentlyCompleted, regsTotal, regsConfirmed, regsPending, regsToday, stalePending, cancelledPaid, failedNotifications] = await Promise.all([
    count("events", "isDeleted != true"),
    count("events", `isDeleted != true && status = 'published'`),
    count("events", `isDeleted != true && date > ${escapeFilterValue(nowIso)} && date <= ${escapeFilterValue(futureIso)} && status = 'published'`),
    count("events", `isDeleted != true && date <= ${escapeFilterValue(nowIso)} && endDate >= ${escapeFilterValue(nowIso)} && status = 'published'`),
    count("events", `isDeleted != true && endDate > ${escapeFilterValue(pastIso)} && endDate < ${escapeFilterValue(nowIso)}`),
    count("registrations"),
    count("registrations", `registrationStatus = 'confirmed'`),
    count("registrations", `registrationStatus = 'pending'`),
    count("registrations", `registrationDate >= ${escapeFilterValue(startOfToday)} && registrationDate < ${escapeFilterValue(endOfToday)}`),
    count("registrations", `registrationStatus = 'pending' && paymentStatus = 'pending' && registrationDate < ${escapeFilterValue(staleIso)}`),
    count("registrations", `registrationStatus = 'cancelled' && paymentStatus = 'paid'`),
    count("notification_outbox", `status = 'failed' && attempts >= 8`),
  ]);

  const [eventResult, auditResult] = await Promise.all([
    pb.collection("events").getList(1, 6, {
      filter: `isDeleted != true && status = 'published' && (endDate >= ${escapeFilterValue(nowIso)} || date >= ${escapeFilterValue(nowIso)})`,
      sort: "date",
      fields: "id,title,date,endDate,registeredCount,maxCapacity,status",
      requestKey: null,
    }).catch(() => ({ items: [] })),
    pb.collection("admin_audit_log").getList(1, 8, {
      sort: "-created",
      expand: "actor,event",
      fields: "id,action,note,created,actor,event,expand.actor.name,expand.actor.email,expand.event.title",
      requestKey: null,
    }).catch(() => ({ items: [] })),
  ]);

  let execomTotal: number | null = null, societiesTotal: number | null = null, societiesActive: number | null = null;
  if (role === "admin") {
    [execomTotal, societiesTotal, societiesActive] = await Promise.all([
      count("execom"), count("societies"), count("societies", "isHidden != true"),
    ]);
  }

  return {
    events: { total: eventsTotal, published: eventsPublished, upcoming: eventsUpcoming, live: eventsLive, recentlyCompleted: eventsRecentlyCompleted },
    registrations: { total: regsTotal, confirmed: regsConfirmed, pending: regsPending, today: regsToday },
    execom: { total: execomTotal }, societies: { total: societiesTotal, active: societiesActive },
    attention: { stalePending, cancelledPaid, failedNotifications },
    upcomingEvents: eventResult.items.map((record) => ({
      id: record.id,
      title: String(getField(record, "title", "")), date: String(getField(record, "date", "")), endDate: String(getField(record, "endDate", "")),
      registeredCount: Number(getField(record, "registeredCount", 0)) || 0, maxCapacity: Number(getField(record, "maxCapacity", 0)) || 0,
      status: String(getField(record, "status", "")),
    })),
    recentActivity: auditResult.items.map((record) => {
      const actor = record.expand?.actor as Record<string, unknown> | undefined;
      const event = record.expand?.event as Record<string, unknown> | undefined;
      return { id: record.id, action: String(getField(record, "action", "")), note: String(getField(record, "note", "")), created: String(getField(record, "created", "")), actorName: String(getField(actor, "name", "") || getField(actor, "email", "") || "Admin"), eventTitle: String(getField(event, "title", "")) };
    }),
  };
}
