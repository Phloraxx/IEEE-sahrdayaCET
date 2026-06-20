import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parseFormData } from "@/lib/parse-form-data";
import { parsePagination } from "@/lib/route-helpers";
import { z } from "zod";

const ExecomCreateSchema = z.object({
  name: z.string().min(1),
  position: z.string().min(1),
  department: z.string().optional(),
  batch: z.string().optional(),
  section: z.string().optional(),
  sectionId: z.string().optional(),
  order: z.number().optional(),
  photo: z.any().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  society: z.string().optional(),
});

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
          });
          return Response.json({
            members: records.items,
            total: records.totalItems,
            page: records.page,
            perPage: records.perPage,
          });
        } catch (error) {
          return handleError(error, "admin-execom-list");
        }
      },
      POST: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
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
