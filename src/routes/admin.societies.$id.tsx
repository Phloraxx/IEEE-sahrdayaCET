import { createFileRoute } from "@tanstack/react-router";
import SocietyDetailPage from "@/app/admin/societies/[id]/page";

export const Route = createFileRoute("/admin/societies/$id")({
  component: () => (
    <SocietyDetailPage params={Promise.resolve({ id: Route.useParams().id })} />
  ),
});
