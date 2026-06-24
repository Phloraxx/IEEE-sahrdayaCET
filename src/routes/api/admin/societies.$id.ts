import { createFileRoute } from "@tanstack/react-router";
import { createPB, buildFileUrl } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { z } from "zod";
import { verifySameOrigin } from "@/lib/verify-same-origin";

const SocietyUpdateSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    bio: z.string(),
    chairs: z.array(z.string()),
    isHidden: z.boolean(),
    logo: z.any(),
    banner: z.any(),
  })
  .partial();

export const Route = createFileRoute("/api/admin/societies/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          const society = await pb.collection("societies").getOne(id, {
            fields: "id,name,slug,bio,chairs,isHidden,logo,banner,created,updated",
          });
          return Response.json({
            society: {
              ...society,
              logoUrl: society.logo
                ? buildFileUrl(
                    "societies",
                    society.id as string,
                    society.logo as string,
                  )
                : null,
              bannerUrl: society.banner
                ? buildFileUrl(
                    "societies",
                    society.id as string,
                    society.banner as string,
                  )
                : null,
            },
          }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-societies-get");
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
          const { user } = await requireRole(["admin", "chair"], pb);
          if (user.role !== "admin")
            return Response.json(
              { error: "Only admins can edit societies" },
              { status: 403 },
            );
          const body = await parseFormData(request);
          const parsed = SocietyUpdateSchema.parse(body);
          const society = await pb.collection("societies").update(id, parsed);
          return Response.json({ society });
        } catch (error) {
          return handleError(error, "admin-societies-update");
        }
      },
    },
  },
});
