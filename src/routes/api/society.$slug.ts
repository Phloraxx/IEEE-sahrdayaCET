import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"; import { buildFileUrl, escapeFilterValue } from "@/lib/pb"
import { handleError } from "@/lib/api-error";
import { ClientResponseError } from "pocketbase";
import { getField } from "@/lib/safe-get";

export const Route = createFileRoute("/api/society/$slug")({
  server: {
    handlers: {
      GET: async ({ request: _request, params }) => {
        const { slug } = params;
        try {
          const pb = createPB();

          const society = await pb
            .collection("societies")
            .getFirstListItem(`slug = ${escapeFilterValue(slug)}`, {
              fields: "id,name,slug,bio,logo,banner",
            })
            .catch(() => null);

          if (!society) {
            return Response.json(
              { error: "Society not found" },
              { status: 404 },
            );
          }

          const [events, members] = await Promise.all([
            pb
              .collection("events")
              .getList(1, 50, {
                filter: `society = ${escapeFilterValue(society.id)} && status = 'published' && isDeleted = false`,
                sort: "-date",
                skipTotal: true,
                fields:
                  "id,title,description,date,venue,price,status,maxCapacity,banner",
              })
              .then((res) => res.items)
              .catch(() => []),
            pb
              .collection("execom")
              .getList(1, 50, {
                filter: `sectionId = ${escapeFilterValue(slug)}`,
                sort: "order",
                skipTotal: true,
                fields:
                  "id,order,name,department,batch,position,photo,linkedin,instagram",
              })
              .then((res) => res.items)
              .catch(() => []),
          ]);

          const mappedEvents = events.map((e: Record<string, unknown>) => ({
            id: e.id,
            title: e.title,
            date: e.date,
            venue: e.venue,
            description: e.description,
            price: (e.price as number) || 0,
            status: e.status || "published",
            maxCapacity: (e.maxCapacity as number) || 0,
            bannerUrl: e.banner
              ? buildFileUrl("events", e.id as string, e.banner as string)
              : "",
          }));

          const mappedMembers = members.map((doc: Record<string, unknown>) => ({
            slNo: (doc.order as number) || 0,
            name: (doc.name as string) || "",
            department: (doc.department as string) || "",
            semester: (doc.batch as string) || "",
            position: (doc.position as string) || "",
            photoUrl: doc.photo
              ? buildFileUrl("execom", doc.id as string, doc.photo as string)
              : "",
            linkedin: (doc.linkedin as string) || "",
            instagram: (doc.instagram as string) || "",
          }));

          return Response.json({
            society: {
              id: society.id,
              name: society.name,
              slug: society.slug,
              bio: getField(society, 'bio', ''),
              logoUrl: getField(society, 'logo', '')
                ? buildFileUrl(
                    "societies",
                    society.id,
                    getField(society, 'logo', ''),
                  )
                : "",
              bannerUrl: getField(society, 'banner', '')
                ? buildFileUrl(
                    "societies",
                    society.id,
                    getField(society, 'banner', ''),
                  )
                : "",
            },
            events: mappedEvents,
            members: mappedMembers,
          }, { headers: { 'Cache-Control': 'public, max-age=300' } });
        } catch (error) {
          if (error instanceof ClientResponseError && error.status === 404) {
            return Response.json(
              { error: "Society not found" },
              { status: 404 },
            );
          }
          return handleError(error, "society-get");
        }
      },
    },
  },
});
