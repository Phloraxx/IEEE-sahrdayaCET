import { createFileRoute } from "@tanstack/react-router";
import { createAdminPB, escapeFilterValue } from "@/lib/pb";
import { bumpEventCounter } from "@/lib/registration-service";
import crypto from "crypto";
import { WebhookBodySchema, isDuplicateWebhook } from "@/lib/webhook";
import { logError } from "@/lib/logger";
import { getField } from "@/lib/safe-get";

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
        const expectedHash = crypto.createHash("sha256").update(webhookSecret).digest();
        const receivedHash = crypto.createHash("sha256").update(headerSecret).digest();
        if (!crypto.timingSafeEqual(expectedHash, receivedHash)) {
          return Response.json(
            { error: "Invalid webhook secret" },
            { status: 401 },
          );
        }

        // Server-to-server: no user session. createAdminPB() is justified here
        // (registrations createRule requires @request.auth.id, which a webhook lacks).
        const pb = createAdminPB();

        try {
        const body = WebhookBodySchema.parse(await request.json());
        const { ticketId, status, transactionId } = body;

        const registration = await pb
          .collection("registrations")
          .getFirstListItem(
            `paymentTicketId = ${escapeFilterValue(ticketId)}`,
            { fields: "id,amount,paymentStatus,registrationStatus,paymentData" },
          )
          .catch(() => null);
        if (!registration) {
          return Response.json(
            { error: "Registration not found" },
            { status: 404 },
          );
        }

        const regR = registration as unknown as {
          id: string;
          paymentStatus?: string;
          paymentData?: unknown;
        };

        // Idempotency: already processed (terminal status OR duplicate transactionId)
        if (isDuplicateWebhook(regR.paymentStatus, regR.paymentData, transactionId)) {
          return Response.json({
            success: true,
            message: "Already processed",
          });
        }

        const isSuccess =
          status === "success" || status === "completed" || status === "paid";

        if (isSuccess) {
          const reg = await pb.collection('registrations').getOne(registration.id, { fields: 'id,event,registrationStatus,ticketId' });
          if (!reg) return Response.json({ error: 'not found' }, { status: 404 });
          const wasPending = getField<string>(reg, 'registrationStatus', '') !== 'confirmed';
          await pb.collection('registrations').update(registration.id, {
            registrationStatus: 'confirmed',
            paymentStatus: 'paid',
            paymentData: body,
          });
          if (wasPending) {
            await bumpEventCounter(getField(reg, 'event', ''), 'registeredCount', +1, pb);
          }
        }
        else {
          const existingPaymentData = getField<Record<string, unknown>>(regR, 'paymentData', {});
          await pb.collection("registrations").update(registration.id, {
            paymentStatus: "failed",
            paymentData: {
              ...existingPaymentData,
              ...body,
              transactionId: body.transactionId || existingPaymentData.transactionId,
            },
          });
        }
        return Response.json({ success: true });
        } catch (error) {
          logError("payment-webhook", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
