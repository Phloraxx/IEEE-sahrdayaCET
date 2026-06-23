import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { scopeEventFilter, scopeRegistrationFilter } from "@/lib/chair-scope";
import { buildFilter } from "@/lib/route-helpers";
import { logError } from "@/lib/logger";
import { OverviewClient } from "@/features/admin/OverviewClient";
import { toIso } from "@/lib/dates";
import { MS_PER_DAY, RECENT_WINDOW_DAYS } from "@/lib/constants";
import { getField } from "@/lib/safe-get";
import type { Event, Registration } from "@/types";

export interface DashboardStats {
  events: { total: number; upcoming: number; live: number };
  registrations: { total: number; confirmed: number; pending: number; today: number };
  societies: { active: number; total: number };
}

export type DashboardUpcomingEvent = Pick<Event, 'id' | 'title' | 'date' | 'venue' | 'maxCapacity' | 'registeredCount'>;

export type DashboardRecentRegistration = Pick<Registration, 'id' | 'userName' | 'userEmail' | 'registrationStatus' | 'paymentStatus' | 'checkedIn' | 'createdAt'>;

export interface DashboardData {
  stats: DashboardStats | null;
  upcoming: DashboardUpcomingEvent[];
  recent: DashboardRecentRegistration[];
  dailyRegistrations: { date: string; count: number }[];
  paymentDistribution: { name: string; value: number; fill: string }[];
  userName: string;
  userRole: string;
}

const EMPTY_DASHBOARD: DashboardData = {
  stats: null,
  upcoming: [],
  recent: [],
  dailyRegistrations: [],
  paymentDistribution: [],
  userName: "",
  userRole: "",
};

const PAYMENT_COLORS: Record<string, string> = {
  paid: "var(--chart-2)",
  pending: "var(--chart-1)",
  failed: "var(--chart-5)",
  not_required: "var(--chart-3)",
};

const getAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") || "";
  const pb = createPB(cookieHeader);

  let userName = "";
  let userRole = "";

  // Auth: throw so the route error boundary catches it — AdminGuard handles client redirect
  const { user } = await requireRole(["admin", "chair"], pb);
  userName = user.name ?? "";
  userRole = user.role ?? "";

  const now = new Date();
  const nowIso = toIso(now);
  const past7 = new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Compute scope filters for chair users
  const eventScope = await scopeEventFilter(pb, user);
  const registrationScope = await scopeRegistrationFilter(pb, user);

  const esc = (v: string) => escapeFilterValue(v);
  const addScope = (filter: string) => buildFilter([eventScope, filter].filter(Boolean));
  try {
    const [
      upcomingRes,
      recentRes,
      chartRes,
      eventsLiveCount,
      eventsTotalCount,
      regTotalCount,
      regConfirmedCount,
      regPendingCount,
      regTodayCount,
      societiesTotalCount,
    ] = await Promise.all([
      pb.collection("events").getList(1, 3, {
        filter: addScope(`date > ${esc(nowIso)} && status = ${esc("published")}`),
        sort: "date",
        fields: "id,title,date,venue,maxCapacity,registeredCount",
      }),
      pb.collection("registrations").getList(1, 5, {
        sort: "-registrationDate",
        fields: "id,userName,userEmail,registrationStatus,paymentStatus,checkedIn,created",
        filter: buildFilter([registrationScope].filter(Boolean)) || undefined,
      }),
      pb.collection("registrations").getList(1, 500, {
        filter: buildFilter([registrationScope, `registrationDate >= ${esc(toIso(past7))}`].filter(Boolean)),
        fields: "registrationDate,paymentStatus",
      }),
      // Only live-events count is used in the UI (hero event badge)
      (async () => {
        const res = await pb.collection("events").getList(1, 1, {
          filter: addScope(`date <= ${esc(nowIso)} && endDate >= ${esc(nowIso)} && status = ${esc("published")}`),
          fields: "id",
        });
        return res.totalItems;
      })(),
      // Events total count (non-deleted, in scope)
      (async () => {
        try {
          const res = await pb.collection("events").getList(1, 1, {
            filter: addScope(`isDeleted = ${esc("false")}`),
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
      // Registrations total count (non-cancelled, in scope)
      (async () => {
        try {
          const res = await pb.collection("registrations").getList(1, 1, {
            filter: buildFilter([registrationScope, `registrationStatus != ${esc("cancelled")}`].filter(Boolean)) || undefined,
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
      // Registrations confirmed count
      (async () => {
        try {
          const res = await pb.collection("registrations").getList(1, 1, {
            filter: buildFilter([registrationScope, `registrationStatus = ${esc("confirmed")}`].filter(Boolean)) || undefined,
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
      // Registrations pending count
      (async () => {
        try {
          const res = await pb.collection("registrations").getList(1, 1, {
            filter: buildFilter([registrationScope, `registrationStatus = ${esc("pending")}`].filter(Boolean)) || undefined,
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
      // Registrations today count
      (async () => {
        try {
          const res = await pb.collection("registrations").getList(1, 1, {
            filter: buildFilter([registrationScope, `registrationDate >= ${esc(toIso(todayStart))}`].filter(Boolean)) || undefined,
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
      // Societies total count (non-hidden)
      (async () => {
        try {
          const res = await pb.collection("societies").getList(1, 1, {
            filter: `isHidden != ${esc("true")}`,
            fields: "id",
          });
          return res.totalItems;
        } catch { return 0; }
      })(),
    ]);

    const stats: DashboardStats = {
      events: { total: eventsTotalCount, upcoming: upcomingRes.totalItems, live: eventsLiveCount },
      registrations: { total: regTotalCount, confirmed: regConfirmedCount, pending: regPendingCount, today: regTodayCount },
      societies: { active: societiesTotalCount, total: societiesTotalCount },
    };

    const upcoming: DashboardUpcomingEvent[] = upcomingRes.items.map((e: Record<string, unknown>) => ({
      id: getField(e, 'id', ''),
      title: getField(e, 'title', ''),
      date: getField(e, 'date', ''),
      venue: getField(e, 'venue', ''),
      maxCapacity: Number(getField(e, 'maxCapacity', 0)) || 0,
      registeredCount: Number(getField(e, 'registeredCount', 0)) || 0,
    }));

    const recent: DashboardRecentRegistration[] = recentRes.items.map((r: Record<string, unknown>) => ({
      id: getField(r, 'id', ''),
      userName: getField(r, 'userName', 'Unknown'),
      userEmail: getField(r, 'userEmail', ''),
      registrationStatus: getField(r, 'registrationStatus', 'pending'),
      paymentStatus: getField(r, 'paymentStatus', ''),
      checkedIn: !!getField(r, 'checkedIn', false),
      createdAt: getField(r, 'created', ''),
    }));

    const byDate: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    for (const r of chartRes.items) {
      const date = getField(r, 'registrationDate', '').split(" ")[0];
      if (date) byDate[date] = (byDate[date] ?? 0) + 1;
      const pay = getField(r, 'paymentStatus', 'unknown');
      byPayment[pay] = (byPayment[pay] ?? 0) + 1;
    }

    const dailyRegistrations = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const paymentDistribution = Object.entries(byPayment).map(([status, count]) => ({
      name: status,
      value: count,
      fill: PAYMENT_COLORS[status] ?? "var(--chart-4)",
    }));

    return {
      stats,
      upcoming,
      recent,
      dailyRegistrations,
      paymentDistribution,
      userName,
      userRole,
    } satisfies DashboardData;
  } catch (e) {
    logError("admin-dashboard", e);
    return { ...EMPTY_DASHBOARD, userName, userRole } satisfies DashboardData;
  }
});

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminDashboard(),
  component: AdminIndex,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminIndex() {
  const { stats, upcoming, recent, dailyRegistrations, paymentDistribution, userName, userRole } =
    Route.useLoaderData();
  return (
    <OverviewClient
      stats={stats}
      upcoming={upcoming}
      recent={recent}
      dailyRegistrations={dailyRegistrations}
      paymentDistribution={paymentDistribution}
      userName={userName}
      userRole={userRole}
    />
  );
}
