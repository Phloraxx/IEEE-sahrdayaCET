import { createFileRoute } from "@tanstack/react-router";
import { EventDetailContent } from "@/app/admin/events/[id]/EventDetailContent";

export const Route = createFileRoute("/admin/events/$id")({
  component: AdminEventDetail,
});

function AdminEventDetail() {
  const { id } = Route.useParams();
  return <EventDetailContent eventId={id} />;
}
