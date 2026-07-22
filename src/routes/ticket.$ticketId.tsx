import { useParams } from "react-router";

import TicketPage from "@/features/ticket/TicketPage";

export default function RouteTicket() {
  const { ticketId = "" } = useParams();;
  return <TicketPage ticketId={ticketId} />;
}
