import type { LoaderFunctionArgs } from "react-router";
import QRCode from "qrcode";

import { createPublicPB } from "@/lib/pb.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const ticketId = String(params.ticketId || "").trim();
  if (!/^TKT-[A-Z0-9_-]{6,100}$/i.test(ticketId)) {
    throw new Response("Ticket not found", { status: 404 });
  }

  const pb = createPublicPB();
  const result = await pb
    .send(`/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`, {})
    .catch(() => null);
  if (!result?.found || String(result.ticket?.id || "") !== ticketId) {
    throw new Response("Ticket not found", { status: 404 });
  }

  const ticketUrl = `${new URL(request.url).origin}/ticket/${encodeURIComponent(ticketId)}`;
  const png = await QRCode.toBuffer(ticketUrl, {
    type: "png",
    width: 420,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
