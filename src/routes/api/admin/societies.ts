import { createFileRoute } from "@tanstack/react-router";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { parsePagination, buildFilter } from "@/lib/route-helpers";
import { z } from "zod";

const SocietyCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  bio: z.string().optional(),
  chairs: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  logo: z.any().optional(),
  banner: z.any().optional(),
});

export const Route = createFileRoute("/api/admin/societies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
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

          const result = await pb
            .collection("societies")
            .getList(page, perPage, {
              filter: filter || undefined,
              sort: "name",
            });

          const societyIds = result.items.map((s) => s.id);
          const eventsCountBySociety = new Map<string, number>();
          if (societyIds.length > 0) {
            const eventsFilter = societyIds
              .map((id) => `society = ${escapeFilterValue(id)}`)
              .join(" || ");
            try {
              const events = await pb
                .collection("events")
                .getFullList<{ society: string }>({
                  filter: eventsFilter,
                  fields: "society",
                });
              for (const e of events) {
                const sid = e.society as string;
                eventsCountBySociety.set(
                  sid,
                  (eventsCountBySociety.get(sid) || 0) + 1,
                );
              }
            } catch {
              /* best-effort */
            }
          }

          const societies = result.items.map((s: Record<string, unknown>) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            bio: s.bio,
            isHidden: !!s.isHidden,
            chairs: (s.chairs as string[]) || [],
            eventsCount: eventsCountBySociety.get(s.id as string) || 0,
          }));

          return Response.json({
            societies,
            total: result.totalItems,
            page: result.page,
            perPage: result.perPage,
          });
        } catch (error) {
          return handleError(error, "admin-societies-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin", "chair"], pb);
          if (user.role !== "admin")
            return Response.json(
              { error: "Only admins can create societies" },
              { status: 403 },
            );
          const body = await parseFormData(request);
          const parsed = SocietyCreateSchema.parse(body);
          const society = await pb.collection("societies").create(parsed);
          return Response.json({ society }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-societies-create");
        }
      },
    },
  },
});
