import { createFileRoute } from "@tanstack/react-router";
import UserDetailPage from "@/app/admin/users/[id]/page";

export const Route = createFileRoute("/admin/users/$id")({
  component: () => (
    <UserDetailPage params={Promise.resolve({ id: Route.useParams().id })} />
  ),
});
