import type { LoaderFunctionArgs } from "react-router";
import QRCode from "qrcode";

import { getTicketCheckInState } from "@/lib/event-lifecycle";
import { createPublicPB } from "@/lib/pb.server";
import { publicRequestOrigin } from "@/server/public-origin.server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function ticketNotFound() {
  return new Response("Ticket not found", { status: 404, headers: NO_STORE_HEADERS });
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const ticketId = String(params.ticketId || "").trim();
  if (!/^TKT-[A-Z0-9_-]{6,100}$/i.test(ticketId)) {
    throw ticketNotFound();
  }

  const pb = createPublicPB();
  const result = await pb
    .send(`/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`, {})
    .catch(() => null);
  if (!result?.found || String(result.ticket?.id || "") !== ticketId) {
    throw ticketNotFound();
  }

  const registrationStatus = String(result.ticket.registrationStatus || "");
  const event = result.event;
  if (getTicketCheckInState(registrationStatus, event) !== "eligible") {
    throw ticketNotFound();
  }

  const ticketUrl = `${publicRequestOrigin(request)}/ticket/${encodeURIComponent(ticketId)}`;
  let png: Buffer;
  try {
    png = await QRCode.toBuffer(ticketUrl, {
      type: "png",
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  } catch {
    throw new Response("Ticket QR unavailable", { status: 500, headers: NO_STORE_HEADERS });
  }

  return new Response(new Uint8Array(png), {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "image/png",
    },
  });
}
