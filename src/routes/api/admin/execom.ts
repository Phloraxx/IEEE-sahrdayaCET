import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { parsePagination } from "@/lib/route-helpers";
import { ExecomCreateSchema } from "@/schemas/execom";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/execom")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url, {
            defaultPerPage: 50,
            maxPerPage: 200,
          });
          const records = await pb.collection("execom").getList(page, perPage, {
            sort: "order",
            expand: "society",
            fields: "id,name,position,department,batch,section,sectionId,order,photo,linkedin,instagram,email,phone,society,created,updated",
          });
          return Response.json({
            members: records.items,
            total: records.totalItems,
            page: records.page,
            perPage: records.perPage,
            hasMore: records.totalPages > records.page,
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-execom-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin", "chair"], pb);
          if (user.role !== "admin")
            return Response.json(
              { error: "Only admins can manage execom" },
              { status: 403 },
            );
          const body = await parseFormData(request);
          const parsed = ExecomCreateSchema.parse(body);
          const member = await pb.collection("execom").create(parsed);
          return Response.json({ member }, { status: 201 });
        } catch (error) {
          return handleError(error, "admin-execom-create");
        }
      },
    },
  },
});
