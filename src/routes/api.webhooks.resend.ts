import type { ActionFunctionArgs } from "react-router";

import { getPBUrl } from "@/lib/pb.server";
import { providerError, trackedResendEventType, verifyResendWebhook } from "@/server/mail/resend-webhook.server";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawBody = await request.text();
  const id = request.headers.get("svix-id") || "";
  const timestamp = request.headers.get("svix-timestamp") || "";
  const signature = request.headers.get("svix-signature") || "";
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || "";
  if (!verifyResendWebhook(rawBody, { id, timestamp, signature }, webhookSecret)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try { event = objectValue(JSON.parse(rawBody) as unknown); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data = objectValue(event.data);
  const providerMessageId = String(data.email_id || "").trim();
  const eventType = String(event.type || "").trim().toLowerCase();
  const eventCreatedAt = String(event.created_at || data.created_at || "").trim();
  if (!providerMessageId || !trackedResendEventType(eventType)) {
    return Response.json({ ignored: true }, { status: 200 });
  }

  const capability = process.env.CERTIFICATE_MAIL_WEBHOOK_CAPABILITY_KEY?.trim() || "";
  if (capability.length < 32) {
    return Response.json({ error: "Mail webhook bridge is unavailable" }, { status: 503 });
  }
  const response = await fetch(`${getPBUrl()}/api/internal/certificate-mail/provider-event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Certificate-Mail-Webhook-Capability": capability,
    },
    body: JSON.stringify({
      providerEventId: id,
      providerMessageId,
      eventType,
      eventCreatedAt,
      messageId: String(data.message_id || "").trim(),
      error: providerError(event),
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({ error: "PocketBase returned a non-JSON response" }));
  if (!response.ok) return Response.json(result, { status: response.status });
  return Response.json(result, { status: 200 });
}
