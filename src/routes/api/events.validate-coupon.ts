import { createFileRoute } from "@tanstack/react-router";
import { createPB, getPBUrl } from "@/lib/pb";
import { requireAuth } from "@/lib/auth";
import { handleError } from "@/lib/api-error";

export const Route = createFileRoute("/api/events/validate-coupon")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const userPb = createPB(request.headers.get("cookie") || undefined);
          await requireAuth(userPb);

          const body = await request.json();
          const { eventId, code } = body;

          if (!eventId || !code) {
            return Response.json(
              { error: "eventId and code are required" },
              { status: 400 },
            );
          }

          // Call the PB custom route (pb_hooks/coupon-validate.pb.js).
          // The hook reads the coupon internally (no admin client needed)
          // and returns the discount computation.
          const res = await fetch(`${getPBUrl()}/api/validate-coupon`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Forward the user's auth token so the hook can authenticate.
              "Authorization": userPb.authStore.token || "",
            },
            body: JSON.stringify({ eventId, code }),
          });

          const data = await res.json();

          if (!res.ok) {
            return Response.json(
              { error: data.error || "Coupon validation failed" },
              { status: res.status },
            );
          }

          return Response.json(data);
        } catch (error) {
          return handleError(error, "validate-coupon");
        }
      },
    },
  },
});
