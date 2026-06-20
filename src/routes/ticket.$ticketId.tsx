import { createFileRoute } from "@tanstack/react-router";
import TicketPage from "@/app/(main)/ticket/[ticketId]/page";

export const Route = createFileRoute("/ticket/$ticketId")({
  head: () => ({
    meta: [{ title: "Ticket" }],
  }),
  component: RouteTicket,
});

function RouteTicket() {
  const { ticketId } = Route.useParams();
  return <TicketPage ticketId={ticketId} />;
}
