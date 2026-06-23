import { createFileRoute } from "@tanstack/react-router";
import { createPB, buildFileUrl } from "@/lib/pb";
import { handleError } from "@/lib/api-error";
import { ClientResponseError } from "pocketbase";
import { getField, getExpand } from "@/lib/safe-get";

export const Route = createFileRoute("/api/events/$id")({
  server: {
    handlers: {
      GET: async ({ request: _request, params }) => {
        try {
          const { id } = params;
          const pb = createPB();

          const event = await pb.collection("events").getOne(id, {
            expand: "society",
            fields:
              "id,title,description,date,endDate,venue,price,registrationOpen,registrationStart,registrationDeadline,maxCapacity,registeredCount,formTemplate,collectIeeeMember,externalFormUrl,externalLink,banner,status,isDeleted,society",
          });


          if (event.isDeleted || (event.status && event.status !== "published")) {
            return Response.json({ error: "Event not found" }, { status: 404 });
          }

          const expand = getExpand(event);
          const society = expand?.society;
          const bannerFile = event.banner;
          const bannerUrl = bannerFile
            ? buildFileUrl("events", id, getField(event, "banner", ""))
            : "";

          const result = {
            id: event.id,
            title: event.title || "",
            description: event.description || "",
            date: event.date || "",
            endDate: event.endDate || "",
            venue: event.venue || "",
            price: Number(event.price) || 0,
            isPaid: Number(event.price) > 0,
            registrationOpen: !!event.registrationOpen,
            registrationStart: event.registrationStart || "",
            registrationDeadline: event.registrationDeadline || "",
            maxCapacity: Number(event.maxCapacity) || 0,
            registeredCount: Number(event.registeredCount) || 0,
            formTemplate: event.formTemplate || [],
            collectIeeeMember: !!event.collectIeeeMember,
            externalFormUrl: event.externalFormUrl || "",
            externalLink: event.externalLink || "",
            bannerUrl,
            societyName: getField(society, 'name', ''),
            status: event.status || "",
          };

          return Response.json({ event: result }, { headers: { 'Cache-Control': 'public, max-age=300' } });
        } catch (error) {
          if (error instanceof ClientResponseError && error.status === 404) {
            return Response.json({ error: "Event not found" }, { status: 404 });
          }
          return handleError(error, "public-event-get");
        }
      },
    },
  },
});
