import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { trackedResendEventType, verifyResendWebhook } from "@/server/mail/resend-webhook.server";

function fixture() {
  const key = Buffer.from("certificate-resend-webhook-test-key-2026");
  const secret = `whsec_${key.toString("base64")}`;
  const id = "msg_test_webhook_001";
  const timestamp = "1788030000";
  const rawBody = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-08-29T19:00:00.000Z",
    data: { email_id: "email_123" },
  });
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return { secret, id, timestamp, rawBody, signature };
}

describe("Resend webhook verification", () => {
  it("tracks only delivery-state events and ignores engagement noise", () => {
    expect(trackedResendEventType("email.delivered")).toBe(true);
    expect(trackedResendEventType("email.bounced")).toBe(true);
    expect(trackedResendEventType("email.opened")).toBe(false);
    expect(trackedResendEventType("email.clicked")).toBe(false);
  });

  it("accepts a valid raw-body Svix signature", () => {
    const f = fixture();
    expect(verifyResendWebhook(f.rawBody, {
      id: f.id,
      timestamp: f.timestamp,
      signature: `v1,${f.signature}`,
    }, f.secret, Number(f.timestamp))).toBe(true);
  });

  it("rejects tampering, wrong secrets and stale timestamps", () => {
    const f = fixture();
    const headers = { id: f.id, timestamp: f.timestamp, signature: `v1,${f.signature}` };
    expect(verifyResendWebhook(`${f.rawBody} `, headers, f.secret, Number(f.timestamp))).toBe(false);
    expect(verifyResendWebhook(f.rawBody, headers, "whsec_d3Jvbmcta2V5", Number(f.timestamp))).toBe(false);
    expect(verifyResendWebhook(f.rawBody, headers, f.secret, Number(f.timestamp) + 301)).toBe(false);
  });

  it("accepts any matching v1 signature during signing-secret rotation", () => {
    const f = fixture();
    expect(verifyResendWebhook(f.rawBody, {
      id: f.id,
      timestamp: f.timestamp,
      signature: `v1,ZmFrZQ== v1,${f.signature}`,
    }, f.secret, Number(f.timestamp))).toBe(true);
  });
});
