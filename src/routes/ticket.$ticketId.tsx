import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import TicketPage from "@/features/ticket/TicketPage";
import { useAuth } from "@/lib/auth-context";
import { getTicket } from "@/lib/data/public-client";

export default function RouteTicket() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus !== "authenticated" || !ticketId) {
      setReady(true);
      return;
    }

    let active = true;
    void getTicket(ticketId)
      .then((data) => {
        if (!active || !data.found || !data.ticket) return;

        if (
          data.registration?.id &&
          data.ticket.registrationStatus === "pending" &&
          data.ticket.paymentStatus === "pending"
        ) {
          navigate(`/payment/${data.registration.id}`, { replace: true });
          return;
        }

        // If the attendee revisits the temporary payment recovery URL after a
        // successful payment, canonicalize it to the real TKT-* URL so the QR
        // can never be generated from a payment identifier.
        if (
          data.registration?.id &&
          data.ticket.registrationStatus === "confirmed" &&
          data.ticket.id &&
          data.ticket.id !== ticketId
        ) {
          navigate(`/ticket/${data.ticket.id}`, { replace: true });
          return;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [authStatus, navigate, ticketId]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-ieee-blue" />
      </div>
    );
  }

  return <TicketPage ticketId={ticketId} />;
}
