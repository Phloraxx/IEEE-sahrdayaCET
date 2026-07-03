import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminPageHeader } from "@/features/admin/shared/admin-page-header";
import { RegistrationDetail } from "@/features/admin/registrations/registration-detail";

export const Route = createFileRoute("/admin/registrations/$id")({
  component: RegistrationDetailPage,
});

function RegistrationDetailPage() {
  const { id } = useParams({ from: "/admin/registrations/$id" });
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
