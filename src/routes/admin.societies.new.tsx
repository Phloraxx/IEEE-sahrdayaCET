import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { SocietyForm } from "@/features/admin/societies/society-form";

export const Route = createFileRoute("/admin/societies/new")({
  component: NewSocietyPage,
});

function NewSocietyPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Societies"
        title="Create society"
        description="Add a new IEEE society chapter to the platform."
        backTo="/admin/societies"
        backLabel="Back to societies"
      />
      <SocietyForm mode="create" />
    </div>
  );
}
