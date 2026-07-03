import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { ExecomForm } from "@/features/admin/execom/execom-form";

export const Route = createFileRoute("/admin/execom/$id/edit")({
  component: EditExecomPage,
});

function EditExecomPage() {
  const { id } = useParams({ from: "/admin/execom/$id/edit" });
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Execom"
        title="Edit member"
        description="Update the member details below."
        backTo="/admin/execom"
        backLabel="Back to execom"
      />
      <ExecomForm mode="edit" memberId={id} />
    </div>
  );
}
