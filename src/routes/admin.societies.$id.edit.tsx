import { createFileRoute, useParams } from "@tanstack/react-router";
import SocietyEditPage from "@/app/admin/societies/[id]/edit/page";

export const Route = createFileRoute("/admin/societies/$id/edit")({
  component: () => (
    <SocietyEditPage params={Promise.resolve({ id: Route.useParams().id })} />
  ),
});
