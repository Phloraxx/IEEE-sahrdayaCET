import { createFileRoute } from "@tanstack/react-router";
import { RegistrationsContent } from "@/app/admin/registrations/RegistrationsContent";

export const Route = createFileRoute("/admin/registrations")({
  component: () => <RegistrationsContent />,
});
