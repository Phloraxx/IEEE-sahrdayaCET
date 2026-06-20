import { createFileRoute } from "@tanstack/react-router";
import EditEventPage from "@/app/admin/events/[id]/edit/page";

export const Route = createFileRoute("/admin/events/$id/edit")({
  component: () => (
    <EditEventPage params={Promise.resolve({ id: Route.useParams().id })} />
  ),
});
