import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { softDeleteEvent } from "@/lib/registration-service";
import { parseFormData } from "@/lib/parse-form-data";
import { z } from "zod";

const EventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  date: z.string().min(1).optional(),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  price: z.number().min(0).optional(),
  status: z.enum(["draft", "published", "completed", "cancelled"]).optional(),
  maxCapacity: z.number().int().positive().optional(),
  registrationOpen: z.boolean().optional(),
  registrationStart: z.string().optional(),
  registrationDeadline: z.string().optional(),
  formTemplate: z.array(z.record(z.string(), z.unknown())).optional(),
  banner: z.string().optional(),
  checkInEnabled: z.boolean().optional(),
  collectIeeeMember: z.boolean().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  coupons: z.array(z.record(z.string(), z.unknown())).optional(),
  externalLink: z.string().optional(),
  externalFormUrl: z.string().optional(),
  tags: z.string().optional(),
});

export const Route = createFileRoute("/api/admin/events/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          const event = await pb
            .collection("events")
            .getOne(id, { expand: "society" });
          return Response.json({ event });
        } catch (error) {
          return handleError(error, "admin-events-get");
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          const body = await parseFormData(request);
          const parsed = EventUpdateSchema.parse(body);
          const event = await pb.collection("events").update(id, parsed);
          return Response.json({ event });
        } catch (error) {
          return handleError(error, "admin-events-update");
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { id } = params;
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin", "chair"], pb);
          await softDeleteEvent(pb, id);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-events-delete");
        }
      },
    },
  },
});
