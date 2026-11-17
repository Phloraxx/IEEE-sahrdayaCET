import { useParams } from "react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { ExecomForm } from "@/features/admin/execom/execom-form";
import { adminMeta } from "@/lib/admin-meta";

export default function EditExecomPage() {
  const { id = "" } = useParams();
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

export const meta = () => adminMeta("Edit Execom Member");
