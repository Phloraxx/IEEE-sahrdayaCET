import { useLoaderData, useParams, type LoaderFunctionArgs } from "react-router";
import RegisterPage from "@/features/register/RegisterPage";
import { fetchEventForRegistration } from "@/server/public/registration.server";

export const meta = () => [
  { title: "Register | IEEE Sahrdaya Student Branch" },
  { name: "description", content: "Register for an IEEE Sahrdaya event" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.eventId) throw new Response("Event not found", { status: 404 });
  try { return await fetchEventForRegistration(params.eventId); }
  catch { throw new Response("Event not found", { status: 404 }); }
}

export default function RouteRegister() {
  const { event } = useLoaderData<typeof loader>();
  const { eventId = "" } = useParams();
  return <RegisterPage eventId={eventId} initialEvent={event} />;
}
