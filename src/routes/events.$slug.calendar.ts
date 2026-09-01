import type { LoaderFunctionArgs } from "react-router";
import { eventCalendarIcs } from "@/lib/event-calendar";
import { fetchEventBySlug } from "@/server/public/events.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const slug = String(params.slug || "").trim();
  if (!slug) throw new Response("Event not found", { status: 404 });
  const event = await fetchEventBySlug(slug);
  if (!event) throw new Response("Event not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const publicUrl = `${origin}/events/${encodeURIComponent(event.slug)}`;
  return new Response(eventCalendarIcs(event, publicUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug || "event"}.ics"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
