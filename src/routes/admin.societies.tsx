import { createFileRoute } from "@tanstack/react-router";
import { SocietiesContent } from "@/app/admin/societies/SocietiesContent";

export const Route = createFileRoute("/admin/societies")({
  component: () => <SocietiesContent />,
});
