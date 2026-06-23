import { createFileRoute } from "@tanstack/react-router";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { scopeRegistrationFilter } from "@/lib/chair-scope";
import { parsePagination, buildFilter } from "@/lib/route-helpers";
import { getField, getExpand } from "@/lib/safe-get";

export const Route = createFileRoute("/api/admin/registrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin", "chair"], pb);
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url, {
            defaultPerPage: 50,
            maxPerPage: 100,
          });
          const eventId = url.searchParams.get("eventId");
          const status = url.searchParams.get("status");
          const search = url.searchParams.get("search");

          const baseParts: string[] = [];
          if (eventId) baseParts.push(`event = ${escapeFilterValue(eventId)}`);
          if (status && status !== "all")
            baseParts.push(`registrationStatus = ${escapeFilterValue(status)}`);
          if (search) baseParts.push(`userName ~ ${escapeFilterValue(search)}`);
          const eventScope = await scopeRegistrationFilter(pb, user);
          if (eventScope) baseParts.unshift(eventScope);
          const filter = buildFilter(baseParts);

          const result = await pb
            .collection("registrations")
            .getList(page, perPage, {
              filter: filter || undefined,
              sort: "-registrationDate",
              expand: "event",
              fields:
                "id,userName,userEmail,userPhone,registrationStatus,paymentStatus,checkedIn,checkedInAt,ticketId,amount,created,expand.event.id,expand.event.title",
            });
          const registrations = result.items.map((r) => {
            const expand = getExpand(r);
            const event = expand?.event;
            return {
              id: r.id,
              userName: r.userName,
              userEmail: r.userEmail,
              userPhone: r.userPhone,
              registrationStatus: r.registrationStatus,
              paymentStatus: r.paymentStatus,
              checkedIn: !!getField(r, 'checkedIn', false),
              checkedInAt: r.checkedInAt,
              ticketId: r.ticketId,
              amount: Number(r.amount) || 0,
              createdAt: r.created,
              eventTitle: getField(event, 'title', ''),
              eventId: getField(event, 'id', ''),
            };
          });

          return Response.json({
            registrations,
            total: result.totalItems,
            page: result.page,
            perPage: result.perPage,
            hasMore: result.totalPages > result.page,
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-registrations-list");
        }
      },
    },
  },
});
