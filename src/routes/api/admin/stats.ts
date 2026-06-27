import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin, getChairScopeFilters } from "@/lib/admin-middleware";
import { escapeFilterValue } from "@/lib/pb";
import { handleError } from "@/lib/api-error";
import { buildFilter } from "@/lib/route-helpers";
import { toIso } from "@/lib/dates";
import {
  UPCOMING_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  MS_PER_DAY,
} from "@/lib/constants";

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {

        try {
          const ctx = await authenticateAdmin(request);
          const { eventFilter: eventScope, registrationFilter: registrationScope } = await getChairScopeFilters(ctx);

          const now = new Date();
          const nowIso = toIso(now);
          const futureIso = toIso(
            new Date(now.getTime() + UPCOMING_WINDOW_DAYS * MS_PER_DAY),
          );
          const pastIso = toIso(
            new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY),
          );
          const startOfToday = toIso(
            new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          );
          const endOfToday = toIso(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          );

          const count = async (
            col: "events" | "registrations" | "execom" | "societies",
            filter?: string,
          ) => {
            const r = await ctx.pb
              .collection(col)
              .getList(1, 1, {
                filter: filter || undefined,
                fields: "id",
                // PB JS SDK auto-cancels concurrent requests on the same
                // client when their request keys collide. We fire ~12 counts
                // in parallel, so disable per-request cancellation here.
                requestKey: null,
              });
            return r.totalItems;
          };

          const [
            eventsTotal,
            eventsPublished,
            eventsUpcoming,
            eventsLive,
            eventsRecentlyCompleted,
            regsTotal,
            regsConfirmed,
            regsPending,
            regsToday,
            execomTotal,
            societiesTotal,
            societiesActive,
          ] = await Promise.all([
            count("events", buildFilter([eventScope])),
            count("events", buildFilter([eventScope, `status = 'published'`])),
            count(
              "events",
              buildFilter([eventScope, `date > ${escapeFilterValue(nowIso)} && date <= ${escapeFilterValue(futureIso)} && status = 'published'`]),
            ),
            count(
              "events",
              buildFilter([eventScope, `date <= ${escapeFilterValue(nowIso)} && endDate >= ${escapeFilterValue(nowIso)} && status = 'published'`]),
            ),
            count(
              "events",
              buildFilter([eventScope, `endDate > ${escapeFilterValue(pastIso)} && endDate < ${escapeFilterValue(nowIso)}`]),
            ),
            count("registrations", buildFilter([registrationScope])),
            count("registrations", buildFilter([registrationScope, `registrationStatus = 'confirmed'`])),
            count("registrations", buildFilter([registrationScope, `registrationStatus = 'pending'`])),
            count(
              "registrations",
              buildFilter([registrationScope, `registrationDate >= ${escapeFilterValue(startOfToday)} && registrationDate < ${escapeFilterValue(endOfToday)}`]),
            ),
            count("execom"),
            count("societies"),
            count("societies", `isHidden != true`),
          ]);

          return Response.json({
            events: {
              total: eventsTotal,
              published: eventsPublished,
              upcoming: eventsUpcoming,
              live: eventsLive,
              recentlyCompleted: eventsRecentlyCompleted,
            },
            registrations: {
              total: regsTotal,
              confirmed: regsConfirmed,
              pending: regsPending,
              today: regsToday,
            },
            execom: { total: execomTotal },
            societies: { total: societiesTotal, active: societiesActive },
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-stats");
        }
      },
    },
  },
});
