import { createFileRoute } from "@tanstack/react-router";
import { PaymentsContent } from "@/app/admin/payments/PaymentsContent";

export const Route = createFileRoute("/admin/payments")({
  component: () => <PaymentsContent />,
});
