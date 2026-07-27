import { useParams } from "react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";

export default function EditEventPage() {
  const { id = "" } = useParams();
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
