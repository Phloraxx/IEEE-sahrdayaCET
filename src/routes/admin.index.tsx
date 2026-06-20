import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import PocketBase from "pocketbase";
import { OverviewClient } from "@/app/admin/OverviewClient";
import { toIso } from "@/lib/dates";
import {
  MS_PER_DAY,
  RECENT_WINDOW_DAYS,
  PB_AUTH_COOKIE,
} from "@/lib/constants";

interface DashboardData {
  stats: {
    events: { total: number; upcoming: number; live: number };
    registrations: {
      total: number;
      confirmed: number;
      pending: number;
      today: number;
    };
    societies: { active: number; total: number };
  } | null;
  upcoming: {
    id: string;
    title: string;
    date: string;
    venue: string;
    maxCapacity: number;
    registeredCount: number;
  }[];
  recent: {
    id: string;
    userName: string;
    userEmail: string;
    registrationStatus: string;
    paymentStatus: string;
    checkedIn: boolean;
    createdAt: string;
  }[];
  dailyRegistrations: { date: string; count: number }[];
  paymentDistribution: { name: string; value: number; fill: string }[];
  userName: string;
  userRole: string;
}

const getAdminDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const cookieHeader = getRequestHeader("cookie") || "";
    const pbAuthMatch = cookieHeader
      .split("; ")
      .find((row) => row.startsWith(`${PB_AUTH_COOKIE}=`));
    if (!pbAuthMatch) {
      return {
        stats: null,
        upcoming: [],
        recent: [],
        dailyRegistrations: [],
        paymentDistribution: [],
        userName: "",
        userRole: "",
      } satisfies DashboardData;
    }

    const pbUrl = process.env.POCKETBASE_URL!;
    const pb = new PocketBase(pbUrl);
    pb.authStore.loadFromCookie(cookieHeader, PB_AUTH_COOKIE);

    try {
      await pb.collection("users").authRefresh();
    } catch {
      return {
        stats: null,
        upcoming: [],
        recent: [],
        dailyRegistrations: [],
        paymentDistribution: [],
        userName: "",
        userRole: "",
      } satisfies DashboardData;
    }

    const record = pb.authStore.record;
    if (!record) {
      return {
        stats: null,
        upcoming: [],
        recent: [],
        dailyRegistrations: [],
        paymentDistribution: [],
        userName: "",
        userRole: "",
      } satisfies DashboardData;
    }

    const userName = (record.name as string) || "";
    const userRole = (record.role as string) || "";

    const now = new Date();
    const nowIso = toIso(now);
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const past7 = new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY);
    const startTodayIso = toIso(startOfToday);
    const endTodayIso = toIso(endOfToday);

    try {
      const count = async (collection: string, filter: string) => {
        const res = await pb
          .collection(collection)
          .getList(1, 1, { filter, fields: "id" });
        return res.totalItems;
      };

      const [
        eventsTotal,
        eventsUpcoming,
        eventsLive,
        regsTotal,
        regsConfirmed,
        regsPending,
        regsToday,
        societiesActive,
        societiesTotal,
      ] = await Promise.all([
        count("events", 'id != ""'),
        count("events", `date > '${nowIso}' && status = 'published'`),
        count(
          "events",
          `date <= '${nowIso}' && endDate >= '${nowIso}' && status = 'published'`,
        ),
        count("registrations", 'id != ""'),
        count("registrations", `registrationStatus = 'confirmed'`),
        count("registrations", `registrationStatus = 'pending'`),
        count(
          "registrations",
          `registrationDate >= '${startTodayIso}' && registrationDate < '${endTodayIso}'`,
        ),
        count("societies", "isHidden = false"),
        count("societies", 'id != ""'),
      ]);

      const stats = {
        events: {
          total: eventsTotal,
          upcoming: eventsUpcoming,
          live: eventsLive,
        },
        registrations: {
          total: regsTotal,
          confirmed: regsConfirmed,
          pending: regsPending,
          today: regsToday,
        },
        societies: { active: societiesActive, total: societiesTotal },
      };

      const upcomingRes = await pb.collection("events").getList(1, 5, {
        filter: `date > '${nowIso}' && status = 'published'`,
        sort: "date",
        fields: "id,title,date,venue,maxCapacity,registeredCount",
      });
      const upcoming = upcomingRes.items.map((e: Record<string, unknown>) => ({
        id: e.id as string,
        title: (e.title as string) || "",
        date: (e.date as string) || "",
        venue: (e.venue as string) || "",
        maxCapacity: Number(e.maxCapacity) || 0,
        registeredCount: Number(e.registeredCount) || 0,
      }));

      const recentRes = await pb.collection("registrations").getList(1, 8, {
        sort: "-registrationDate",
        fields:
          "id,userName,userEmail,registrationStatus,paymentStatus,checkedIn,created",
      });
      const recent = recentRes.items.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        userName: (r.userName as string) || "Unknown",
        userEmail: (r.userEmail as string) || "",
        registrationStatus: (r.registrationStatus as string) || "pending",
        paymentStatus: (r.paymentStatus as string) || "",
        checkedIn: !!r.checkedIn,
        createdAt: (r.created as string) || "",
      }));

      const chartRes = await pb.collection("registrations").getList(1, 500, {
        filter: `registrationDate >= '${toIso(past7)}'`,
        fields: "registrationDate,paymentStatus",
      });
      const byDate: Record<string, number> = {};
      const byPayment: Record<string, number> = {};
      chartRes.items.forEach((r: Record<string, unknown>) => {
        const date = ((r.registrationDate as string) || "").split(" ")[0];
        byDate[date] = (byDate[date] || 0) + 1;
        const pay = (r.paymentStatus as string) || "unknown";
        byPayment[pay] = (byPayment[pay] || 0) + 1;
      });

      const dailyRegistrations = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      const PAYMENT_COLORS: Record<string, string> = {
        paid: "var(--chart-2)",
        pending: "var(--chart-1)",
        failed: "var(--chart-5)",
        not_required: "var(--chart-3)",
      };
      const paymentDistribution = Object.entries(byPayment).map(
        ([status, count]) => ({
          name: status,
          value: count,
          fill: PAYMENT_COLORS[status] || "var(--chart-4)",
        }),
      );

      return {
        stats,
        upcoming,
        recent,
        dailyRegistrations,
        paymentDistribution,
        userName,
        userRole,
      } satisfies DashboardData;
    } catch {
      return {
        stats: null,
        upcoming: [],
        recent: [],
        dailyRegistrations: [],
        paymentDistribution: [],
        userName,
        userRole,
      } satisfies DashboardData;
    }
  },
);

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminDashboard(),
  component: AdminIndex,
});

function AdminIndex() {
  const data = Route.useLoaderData();
  return <OverviewClient {...data} />;
}
