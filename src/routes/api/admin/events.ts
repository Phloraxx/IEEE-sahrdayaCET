import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin, buildChairFilter } from "@/lib/admin-middleware";
import { escapeFilterValue } from "@/lib/pb";
import { handleError } from "@/lib/api-error";
import { parsePagination, buildFilter } from "@/lib/route-helpers";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { EventCreateSchema } from "@/schemas/events";
import { getField, getExpand } from "@/lib/safe-get";

export const Route = createFileRoute("/api/admin/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ctx = await authenticateAdmin(request);
          const url = new URL(request.url);

          const { page, perPage } = parsePagination(url, {
            defaultPerPage: 20,
            maxPerPage: 100,
          });
          const status = url.searchParams.get("status");
          const search = url.searchParams.get("search");

          const baseParts: string[] = [];
          if (status && status !== "all")
            baseParts.push(`status = ${escapeFilterValue(status)}`);
          if (search) baseParts.push(`title ~ ${escapeFilterValue(search)}`);
          const eventScope = await buildChairFilter(ctx, 'event');
          if (eventScope) baseParts.unshift(eventScope);
          const filter = buildFilter(baseParts);

          const result = await ctx.pb.collection("events").getList(page, perPage, {
            filter: filter || undefined,
            sort: "-date",
            expand: "society",
            fields:
              "id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name",
          });

          const events = result.items.map((e) => {
            const expand = getExpand(e);
            const society = expand?.society;
            return {
              id: getField(e, 'id', ''),
              title: getField(e, 'title', ''),
              date: getField(e, 'date', ''),
              endDate: getField(e, 'endDate', ''),
              venue: getField(e, 'venue', ''),
              price: getField(e, 'price', 0),
              status: getField(e, 'status', ''),
              registrationOpen: getField(e, 'registrationOpen', false),
              maxCapacity: getField(e, 'maxCapacity', 0),
              registeredCount: getField(e, 'registeredCount', 0),
              checkedInCount: getField(e, 'checkedInCount', 0),
              isPaid: Number(getField(e, 'price', 0)) > 0,
              societyName: getField(society, 'name', ''),
              societyId: getField(society, 'id', ''),
            };
          });

          return Response.json({
            events,
            total: result.totalItems,
            page: result.page,
            perPage: result.perPage,
            hasMore: result.totalPages > result.page,
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-events-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const ctx = await authenticateAdmin(request);

          const parsed = EventCreateSchema.parse(await request.json());

          // Chair scoping: chairs can only create events for their own societies
          if (ctx.role === "chair") {
            const allowed = await ctx.pb.collection("societies").getFullList({
              filter: `chairs ?= ${escapeFilterValue(ctx.userId)}`,
              fields: "id",
            });
            const allowedIds = allowed.map((s: Record<string, unknown>) => s.id);
            if (!allowedIds.includes(parsed.society)) {
              return Response.json(
                { error: "You can only create events for your own society" },
                { status: 403 },
              );
            }
          }

          const event = await ctx.pb.collection("events").create(parsed);
          return Response.json({ event }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-events-create");
        }
      },
    },
  },
});
