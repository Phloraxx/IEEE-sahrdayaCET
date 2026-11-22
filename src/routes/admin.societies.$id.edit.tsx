import { useParams } from "react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { SocietyForm } from "@/features/admin/societies/society-form";
import { adminMeta } from "@/lib/admin-meta";

export default function EditSocietyPage() {
  const { id = "" } = useParams();
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

export const meta = () => adminMeta("Edit Society");
