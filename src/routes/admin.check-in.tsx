import { createFileRoute } from "@tanstack/react-router";
import CheckInPage from "@/app/admin/check-in/page";

export const Route = createFileRoute("/admin/check-in")({
  component: () => <CheckInPage />,
});
