import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAuth } from "@/lib/auth-context";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";
import { getAdminEventOperations } from "@/lib/data/admin-event-operations.client";

export default function EditEventPage() {
  const { user } = useAuth();
  const { id = "" } = useParams();
  const access = useQuery({ queryKey: ["admin-event-operations", id], queryFn: () => getAdminEventOperations(id), enabled: Boolean(id), staleTime: 10_000 });
  if (access.isLoading) return null;
  if (!access.data?.permissions?.["events.edit"]) {
    return <div className="rounded-xl border border-border bg-card p-8"><h1 className="text-lg font-semibold">You can’t edit this event</h1><p className="mt-2 text-sm text-muted-foreground">Your current assignment does not include event editing for this event.</p></div>;
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Events" title="Event setup" description="Edit public details, registration, fees and communication. Workflow actions stay in the event workspace." backTo={`/admin/events/${id}`} backLabel="Back to event workspace" />
      <EventForm mode="edit" eventId={id} allowSocietyTransfer={user?.role === "admin"} />
    </div>
  );
}
