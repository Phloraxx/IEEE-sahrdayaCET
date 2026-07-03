import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { SocietyForm } from "@/features/admin/societies/society-form";

export const Route = createFileRoute("/admin/societies/$id/edit")({
  component: EditSocietyPage,
});

function EditSocietyPage() {
  const { id } = useParams({ from: "/admin/societies/$id/edit" });
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Societies"
        title="Edit society"
        description="Update the society details below."
        backTo="/admin/societies"
        backLabel="Back to societies"
      />
      <SocietyForm mode="edit" societyId={id} />
    </div>
  );
}
