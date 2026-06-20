import { createFileRoute } from "@tanstack/react-router";
import { RegistrationDetailClient } from "@/app/admin/registrations/RegistrationDetailClient";

export const Route = createFileRoute("/admin/registrations/$id")({
  component: () => {
    const { id } = Route.useParams();
    return <RegistrationDetailClient id={id} />;
  },
});
