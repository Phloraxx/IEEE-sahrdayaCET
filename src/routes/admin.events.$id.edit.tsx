import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";

export const Route = createFileRoute("/admin/events/$id/edit")({
  component: EditEventPage,
});

function EditEventPage() {
  const { id } = useParams({ from: "/admin/events/$id/edit" });
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Events"
        title="Edit event"
        description="Update the event details below."
        backTo="/admin/events"
        backLabel="Back to events"
      />
      <EventForm mode="edit" eventId={id} />
    </div>
  );
}
