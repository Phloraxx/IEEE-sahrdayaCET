import { createFileRoute } from "@tanstack/react-router";
import TicketPage from "@/features/ticket/TicketPage";

export const Route = createFileRoute("/ticket/$ticketId")({
  head: () => ({
    meta: [
      { title: "Ticket | IEEE Sahrdaya Student Branch" },
      { name: "description", content: "Your IEEE Sahrdaya event ticket" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RouteTicket,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function RouteTicket() {
  const { ticketId } = Route.useParams();
  return <TicketPage ticketId={ticketId} />;
}
