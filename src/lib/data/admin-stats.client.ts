import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { MS_PER_DAY, RECENT_WINDOW_DAYS, UPCOMING_WINDOW_DAYS } from "@/lib/constants";
import { toIso } from "@/lib/dates";

export interface AdminStats {
  events: { total: number; published: number; upcoming: number; live: number; recentlyCompleted: number };
  registrations: { total: number; confirmed: number; pending: number; today: number };
  execom: { total: number | null };
  societies: { total: number | null; active: number | null };
}

export async function getAdminStats(): Promise<AdminStats> {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  if (role !== "admin" && role !== "chair") throw new Error("Admin or chair access required");
  const now = new Date();
  const nowIso = toIso(now);
  const futureIso = toIso(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY));
  const pastIso = toIso(new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY));
  const startOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const endOfToday = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const count = async (collection: string, filter?: string) =>
    (await pb.collection(collection).getList(1, 1, { filter, fields: "id", requestKey: null })).totalItems;

  const [eventsTotal, eventsPublished, eventsUpcoming, eventsLive, eventsRecentlyCompleted, regsTotal, regsConfirmed, regsPending, regsToday] = await Promise.all([
    count("events"),
    count("events", `status = 'published'`),
    count("events", `date > ${escapeFilterValue(nowIso)} && date <= ${escapeFilterValue(futureIso)} && status = 'published'`),
    count("events", `date <= ${escapeFilterValue(nowIso)} && endDate >= ${escapeFilterValue(nowIso)} && status = 'published'`),
    count("events", `endDate > ${escapeFilterValue(pastIso)} && endDate < ${escapeFilterValue(nowIso)}`),
    count("registrations"),
    count("registrations", `registrationStatus = 'confirmed'`),
    count("registrations", `registrationStatus = 'pending'`),
    count("registrations", `registrationDate >= ${escapeFilterValue(startOfToday)} && registrationDate < ${escapeFilterValue(endOfToday)}`),
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
    execom: { total: execomTotal },
    societies: { total: societiesTotal, active: societiesActive },
  };
}
