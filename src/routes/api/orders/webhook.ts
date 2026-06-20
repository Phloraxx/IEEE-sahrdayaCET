import { createFileRoute } from "@tanstack/react-router";
import { createAdminPB, escapeFilterValue } from "@/lib/pb";
import crypto from "crypto";

export const Route = createFileRoute("/api/orders/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!webhookSecret) {
          return Response.json(
            { error: "Webhook not configured" },
            { status: 500 },
          );
        }

        const headerSecret = request.headers.get("x-webhook-secret");
        if (!headerSecret) {
          return Response.json(
            { error: "Missing webhook secret" },
            { status: 401 },
          );
        }
        const expected = Buffer.from(webhookSecret);
        const received = Buffer.from(headerSecret);
        if (expected.length !== received.length) {
          return Response.json(
            { error: "Invalid webhook secret" },
            { status: 401 },
          );
        }
        if (!crypto.timingSafeEqual(expected, received)) {
          return Response.json(
            { error: "Invalid webhook secret" },
            { status: 401 },
          );
        }

        // Server-to-server: no user session. createAdminPB() is justified here
        // (registrations createRule requires @request.auth.id, which a webhook lacks).
        const pb = createAdminPB();

        try {
          const body = (await request.json()) as {
            ticketId?: string;
            status?: string;
            transactionId?: string;
            amount?: number;
          };
          const { ticketId, status, amount } = body;
          if (!ticketId || !status) {
            return Response.json(
              { error: "Missing required fields" },
              { status: 400 },
            );
          }

          const registration = await pb
            .collection("registrations")
            .getFirstListItem(
              "paymentTicketId = " + escapeFilterValue(ticketId),
              { fields: "id,amount,paymentStatus,registrationStatus" },
            )
            .catch(() => null);
          if (!registration) {
            return Response.json(
              { error: "Registration not found" },
              { status: 404 },
            );
          }

          const regR = registration as unknown as Record<string, unknown>;

          if (
            Math.round(Number(amount) * 100) !==
            Math.round(Number(regR.amount) * 100)
          ) {
            return Response.json({ error: "Amount mismatch" }, { status: 400 });
          }

          const isSuccess =
            status === "success" || status === "completed" || status === "paid";
          if (isSuccess && regR.paymentStatus === "paid") {
            return Response.json({
              success: true,
              message: "Already processed",
            });
          }

          if (isSuccess) {
            await pb.collection("registrations").update(registration.id, {
              paymentStatus: "paid",
              paymentData: body,
              registrationStatus: "confirmed",
            });
          } else {
            await pb.collection("registrations").update(registration.id, {
              paymentStatus: "failed",
              paymentData: body,
            });
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error("[payment-webhook]", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
