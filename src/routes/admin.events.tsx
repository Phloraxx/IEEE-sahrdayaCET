import { createFileRoute } from "@tanstack/react-router";
import { EventsTableContent } from "@/app/admin/events/EventsTableContent";

export const Route = createFileRoute("/admin/events")({
  component: AdminEventsPage,
});

function AdminEventsPage() {
  return <EventsTableContent />;
}
