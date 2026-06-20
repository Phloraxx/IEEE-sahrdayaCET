import { createFileRoute } from "@tanstack/react-router";
import NewExecomPage from "@/app/admin/execom/new/page";

export const Route = createFileRoute("/admin/execom/new")({
  component: () => <NewExecomPage />,
});
