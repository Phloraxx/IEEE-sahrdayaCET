import { createFileRoute } from "@tanstack/react-router";
import { authenticateAdmin } from "@/lib/admin-middleware";
import { escapeFilterValue } from "@/lib/pb";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { parsePagination, buildFilter } from "@/lib/route-helpers";
import { SocietyCreateSchema } from "@/schemas/societies";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/societies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ctx = await authenticateAdmin();
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url, {
            defaultPerPage: 100,
            maxPerPage: 200,
          });
          const search = url.searchParams.get("search");
          const searchFilter = search
            ? `name ~ ${escapeFilterValue(search)}`
            : "";
          const filter = buildFilter([searchFilter]);

          const result = await ctx.pb
            .collection("societies")
            .getList(page, perPage, {
              filter: filter || undefined,
              sort: "name",
              fields: "id,name,slug,bio,isHidden,chairs",
            });
          const societies = result.items.map((s: Record<string, unknown>) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            bio: s.bio,
            isHidden: !!s.isHidden,
            chairs: (s.chairs as string[]) || [],
            // events count removed for performance — use dedicated events admin page
            eventsCount: 0,
          }));

          return Response.json({
            societies,
            total: result.totalItems,
            page: result.page,
            perPage: result.perPage,
            hasMore: false,
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-societies-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data') && request.method !== 'GET') {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const ctx = await authenticateAdmin();
          if (ctx.role !== "admin")
            return Response.json(
              { error: "Only admins can create societies" },
              { status: 403 },
            );
          const body = await parseFormData(request);
          const parsed = SocietyCreateSchema.parse(body);
          const society = await ctx.pb.collection("societies").create(parsed);
          return Response.json({ society }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-societies-create");
        }
      },
    },
  },
});
