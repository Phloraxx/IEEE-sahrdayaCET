import { createFileRoute } from "@tanstack/react-router";
import { createPB, serializeToFormData } from "@/lib/pb.server"; import { buildFileUrl } from "@/lib/pb"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { getField } from "@/lib/safe-get";
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
    defaultWhatsappLink: z.string(),
  })
  .partial();

export const Route = createFileRoute("/api/admin/societies/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          const { user } = await requireRole(["admin", "chair"], pb);
          // Single fetch with all fields including chairs for scope check
          const society = await pb.collection("societies").getOne(id, {
            fields: "id,name,slug,bio,chairs,isHidden,logo,banner,created,updated",
          });
          if (user.role === "chair") {
            const chairs = getField<string[]>(society, 'chairs', []);
            if (!chairs.includes(user.id)) {
              return Response.json({ error: "Forbidden" }, { status: 403 });
            }
          }
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

          const body = await parseFormData(request);
          if (body.bio && typeof body.bio === "object") {
            body.bio = JSON.stringify(body.bio);
          }
          const parsed = SocietyUpdateSchema.parse(body);

          // Chairs can only update their own society and only certain fields
          if (user.role === "chair") {
            const society = await pb.collection("societies").getOne(id, { fields: "id,chairs" });
            const chairs = getField<string[]>(society, 'chairs', []);
            if (!chairs.includes(user.id)) {
              return Response.json({ error: "Forbidden" }, { status: 403 });
            }
            // Chairs can only update bio, logo, banner, defaultWhatsappLink — strip everything else
            const chairAllowed: Record<string, unknown> = {};
            if (parsed.bio !== undefined) chairAllowed.bio = parsed.bio;
            if (parsed.logo !== undefined) chairAllowed.logo = parsed.logo;
            if (parsed.banner !== undefined) chairAllowed.banner = parsed.banner;
            if (parsed.defaultWhatsappLink !== undefined) chairAllowed.defaultWhatsappLink = parsed.defaultWhatsappLink;
            const society2 = await pb.collection("societies").update(id, serializeToFormData(chairAllowed));
            return Response.json({ society: society2 });
          }

          const society = await pb.collection("societies").update(id, serializeToFormData(parsed));
          return Response.json({ society });
        } catch (error) {
          return handleError(error, "admin-societies-update");
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
          const { user } = await requireRole(["admin", "chair"], pb);
          if (user.role !== "admin")
            return Response.json(
              { error: "Only admins can delete societies" },
              { status: 403 },
            );
          await pb.collection("societies").delete(id);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-societies-delete");
        }
      },
    },
  },
});
