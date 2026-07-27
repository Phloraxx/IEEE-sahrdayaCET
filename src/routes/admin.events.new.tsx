
import { useSearchParams } from "react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";

export default function NewEventPage() {
  const [searchParams] = useSearchParams();
  const society = searchParams.get("society") ?? undefined;
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Events"
        title="Create event"
        description="Fill in the details to add a new event to the calendar."
        backTo="/admin/events"
        backLabel="Back to events"
      />
      <EventForm mode="create" initialSocietyId={society} />
    </div>
  );
}
