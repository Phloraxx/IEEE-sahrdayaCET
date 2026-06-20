import { createFileRoute } from "@tanstack/react-router";
import NewEventPage from "@/app/admin/events/new/page";

export const Route = createFileRoute("/admin/events/new")({
  component: () => <NewEventPage />,
});
