import { createFileRoute } from "@tanstack/react-router";
import NewSocietyPage from "@/app/admin/societies/new/page";

export const Route = createFileRoute("/admin/societies/new")({
  component: () => <NewSocietyPage />,
});
