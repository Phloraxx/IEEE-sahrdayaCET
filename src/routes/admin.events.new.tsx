import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useAuth } from "@/lib/auth-context";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { EventForm } from "@/features/admin/events/event-form";
import { getWorkspaceMe } from "@/lib/data/workspace.client";

export default function NewEventPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const society = searchParams.get("society") ?? undefined;
  const workspace = useQuery({ queryKey: ["workspace-me", user?.id], queryFn: getWorkspaceMe, enabled: Boolean(user?.id), staleTime: 30_000 });
  if (!workspace.data) return null;
  if (!workspace.data.capabilities.includes("events.create")) {
    return <div className="rounded-xl border border-border bg-card p-8"><h1 className="text-lg font-semibold">Event creation is not assigned to you</h1><p className="mt-2 text-sm text-muted-foreground">Your workspace access can still cover an existing event without granting permission to create new ones.</p></div>;
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Events" title="Create event" description="Start with the essentials. The event becomes a draft, then you can configure registration, fees and review." backTo="/admin/events" backLabel="Back to events" />
      <EventForm mode="create" initialSocietyId={society} />
    </div>
  );
}
