import { createFileRoute } from "@tanstack/react-router";
import RegisterPage from "@/app/(main)/register/[eventId]/page";

export const Route = createFileRoute("/register/$eventId")({
  head: () => ({
    meta: [{ title: "Register" }],
  }),
  component: RouteRegister,
});

function RouteRegister() {
  const { eventId } = Route.useParams();
  return <RegisterPage eventId={eventId} />;
}
