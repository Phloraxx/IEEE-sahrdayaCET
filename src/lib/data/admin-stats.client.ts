import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { MS_PER_DAY, RECENT_WINDOW_DAYS, UPCOMING_WINDOW_DAYS } from "@/lib/constants";
import { getAppDayBounds, toIso } from "@/lib/dates";
import { getField } from "@/lib/safe-get";
import { listAdminRegistrations, type AdminRegistrationFilters } from "@/lib/data/admin-registrations.client";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
export interface AdminStats {
  events: { total: number; published: number; upcoming: number; live: number; recentlyCompleted: number };
  registrations: { total: number; confirmed: number; pending: number; today: number };
  execom: { total: number | null };
  societies: { total: number | null; active: number | null };
  attention: { stalePending: number; cancelledPaid: number; failedNotifications: number };
  financeAuthorized: boolean;
  upcomingEvents: Array<{ id: string; title: string; date: string; endDate: string; registeredCount: number; maxCapacity: number; status: string }>;
  recentActivity: Array<{ id: string; action: string; note: string; created: string; actorName: string; eventTitle: string }>;

}

export async function getAdminStats(): Promise<AdminStats> {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  const workspace = await getWorkspaceMe();
  const canReadRegistrations = workspace.capabilities.includes("registrations.view");
  if (!canReadRegistrations && !workspace.capabilities.includes("reports.view") && !workspace.branchCapabilities.includes("technical.manage")) {
    throw new Error("Workspace reporting access required");
  }
  const financeAuthorized = workspace.capabilities.includes("finance.view") ||
    workspace.capabilities.includes("finance.manage");
  const now = new Date();
  const nowIso = toIso(now);
  const staleIso = toIso(new Date(now.getTime() - 10 * 60_000));
  const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY));
  const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY));
  const { startIso: startOfToday, endIso: endOfToday } = getAppDayBounds(now);
  const branchWide = workspace.branchCapabilities.includes("reports.view") || workspace.branchCapabilities.includes("registrations.view") || workspace.branchCapabilities.includes("technical.manage");
  const societyIds = branchWide ? [] : Array.from(new Set(workspace.assignments.filter((a) => a.active && a.scopeType === "society" && (a.capabilities.includes("reports.view") || a.capabilities.includes("registrations.view"))).map((a) => a.societyId).filter(Boolean)));
  const eventIds = branchWide ? [] : Array.from(new Set(workspace.assignments.filter((a) => a.active && a.scopeType === "event" && (a.capabilities.includes("reports.view") || a.capabilities.includes("registrations.view"))).map((a) => a.eventId).filter(Boolean)));
  const eventScope = branchWide ? "" : ([...societyIds.map((id) => `society = ${escapeFilterValue(id)}`), ...eventIds.map((id) => `id = ${escapeFilterValue(id)}`)].join(" || ") || 'id = ""');
  const auditScope = branchWide ? "" : ([...societyIds.map((id) => `event.society = ${escapeFilterValue(id)}`), ...eventIds.map((id) => `event = ${escapeFilterValue(id)}`)].join(" || ") || 'id = ""');
  const notificationScope = branchWide ? "" : ([...societyIds.map((id) => `registration.event.society = ${escapeFilterValue(id)}`), ...eventIds.map((id) => `registration.event = ${escapeFilterValue(id)}`)].join(" || ") || 'id = ""');
  const withScope = (filter: string | undefined, scope: string) => [scope ? `(${scope})` : "", filter ? `(${filter})` : ""].filter(Boolean).join(" && ") || undefined;
  const count = async (collection: string, filter?: string, scope = "") =>
    (await pb.collection(collection).getList(1, 1, { filter: withScope(filter, scope), fields: "id", requestKey: null })).totalItems;

  const registrationCount = async (
    filters: Omit<AdminRegistrationFilters, "page" | "perPage"> = {},
  ): Promise<number> => {
    try {
      const result = await listAdminRegistrations({ page: 1, perPage: 1, ...filters });
      return result.total;
    } catch {
      return 0;
    }
  };

  const [
    eventsTotal,
    eventsPublished,
    eventsUpcoming,
    eventsLive,
    eventsRecentlyCompleted,
    failedNotifications,
    regsTotal,
    regsConfirmed,
    regsPending,
    regsToday,
    stalePending,
    cancelledPaid,
  ] = await Promise.all([
    count("events", "isDeleted != true", eventScope),
    count("events", `isDeleted != true && status = 'published'`, eventScope),
    count("events", `isDeleted != true && date > ${escapeFilterValue(nowIso)} && date <= ${escapeFilterValue(futureIso)} && status = 'published'`, eventScope),
    count("events", `isDeleted != true && date <= ${escapeFilterValue(nowIso)} && endDate >= ${escapeFilterValue(nowIso)} && status = 'published'`, eventScope),
    count("events", `isDeleted != true && status = 'published' && endDate > ${escapeFilterValue(pastIso)} && endDate < ${escapeFilterValue(nowIso)}`, eventScope),
    count("notification_outbox", `status = 'failed' && attempts >= 8`, notificationScope),
    canReadRegistrations ? registrationCount() : Promise.resolve(0),
    canReadRegistrations ? registrationCount({ status: "confirmed" }) : Promise.resolve(0),
    canReadRegistrations ? registrationCount({ status: "pending" }) : Promise.resolve(0),
    canReadRegistrations ? registrationCount({ registeredFrom: startOfToday, registeredTo: endOfToday }) : Promise.resolve(0),
    canReadRegistrations && financeAuthorized
      ? registrationCount({
          status: "pending",
          paymentStatus: "pending",
          attentionOnly: true,
          financeAuthorized: true,
          registeredTo: staleIso,
        })
      : Promise.resolve(0),
    canReadRegistrations && financeAuthorized
      ? registrationCount({
          status: "cancelled",
          paymentStatus: "paid",
          attentionOnly: true,
          financeAuthorized: true,
        })
      : Promise.resolve(0),
  ]);

  const [eventResult, auditResult] = await Promise.all([
    pb.collection("events").getList(1, 6, {
      filter: withScope(`isDeleted != true && status = 'published' && (endDate >= ${escapeFilterValue(nowIso)} || date >= ${escapeFilterValue(nowIso)})`, eventScope),
      sort: "date",
      fields: "id,title,date,endDate,registeredCount,maxCapacity,status",
      requestKey: null,
    }).catch(() => ({ items: [] })),
    pb.collection("admin_audit_log").getList(1, 8, {
      filter: withScope(undefined, auditScope),
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
    financeAuthorized,
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
