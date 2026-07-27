
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { ExecomForm } from "@/features/admin/execom/execom-form";

export default function NewExecomPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Execom"
        title="Add committee member"
        description="Add a new member to the executive committee."
        backTo="/admin/execom"
        backLabel="Back to execom"
      />
      <ExecomForm mode="create" />
    </div>
  );
}
