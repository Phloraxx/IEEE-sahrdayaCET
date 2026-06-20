import { createFileRoute } from "@tanstack/react-router";
import EditExecomPage from "@/app/admin/execom/[id]/edit/page";

export const Route = createFileRoute("/admin/execom/$id/edit")({
  component: () => (
    <EditExecomPage params={Promise.resolve({ id: Route.useParams().id })} />
  ),
});
