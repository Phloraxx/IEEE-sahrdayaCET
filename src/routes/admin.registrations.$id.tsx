import { useParams } from "react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { RegistrationDetail } from "@/features/admin/registrations/registration-detail";

export default function RegistrationDetailPage() {
  const { id = "" } = useParams();
  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Registrations"
        title="Registration detail"
        description="Identity, status, payment, and form responses."
        backTo="/admin/registrations"
        backLabel="Back to registrations"
      />
      <RegistrationDetail registrationId={id} />
    </div>
  );
}
