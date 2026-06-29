import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { ExecomUpdateSchema } from "@/schemas/execom";
import { verifySameOrigin } from "@/lib/verify-same-origin";
export const Route = createFileRoute("/api/admin/execom/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const member = await pb
            .collection("execom")
            .getOne(id, {
              expand: "society",
              fields: "id,name,position,department,batch,section,sectionId,order,photo,linkedin,instagram,email,phone,society,created,updated",
            });
          return Response.json({ member }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-execom-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          await requireRole(["admin"], pb);
          const body = await parseFormData(request);
          const parsed = ExecomUpdateSchema.parse(body);
          const member = await pb.collection("execom").update(id, parsed);
          return Response.json({ member });
        } catch (error) {
          return handleError(error, "admin-execom-update");
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          await requireRole(["admin"], pb);
          await pb.collection("execom").delete(id);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-execom-delete");
        }
      },
    },
  },
});
