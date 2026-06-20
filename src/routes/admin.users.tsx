import { createFileRoute } from "@tanstack/react-router";
import { UsersContent } from "@/app/admin/users/UsersContent";

export const Route = createFileRoute("/admin/users")({
  component: () => <UsersContent />,
});
