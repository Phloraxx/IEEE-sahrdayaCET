import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";

export const Route = createFileRoute("/admin/events/new")({
  component: NewEventPage,
});

function NewEventPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Events"
        title="Create event"
        description="Fill in the details to add a new event to the calendar."
        backTo="/admin/events"
        backLabel="Back to events"
      />
      <EventForm mode="create" />
    </div>
  );
}
