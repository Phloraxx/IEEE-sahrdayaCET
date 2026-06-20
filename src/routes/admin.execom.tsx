import { createFileRoute } from "@tanstack/react-router";
import ExecomPage from "@/app/admin/execom/page";

export const Route = createFileRoute("/admin/execom")({
  component: () => <ExecomPage />,
});
