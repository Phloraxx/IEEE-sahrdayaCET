import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

const TRACKED_EVENT_TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.failed",
  "email.suppressed",
  "email.complained",
]);

export function trackedResendEventType(value: string) {
  return TRACKED_EVENT_TYPES.has(value.trim().toLowerCase());
}

function safeEqualBase64(expected: string, actual: string) {
  try {
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(actual, "base64");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function verifyResendWebhook(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const id = headers.id.trim();
  const timestamp = headers.timestamp.trim();
  const parsedTimestamp = Number(timestamp);
  const value = secret.trim();
  if (!id || !Number.isFinite(parsedTimestamp) || !headers.signature || !value.startsWith("whsec_")) return false;
  if (Math.abs(nowSeconds - parsedTimestamp) > MAX_WEBHOOK_AGE_SECONDS) return false;
  let key: Buffer;
  try { key = Buffer.from(value.slice(6), "base64"); } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return headers.signature.split(/\s+/).some((part) => {
    const [version, signature] = part.split(",", 2);
    return version === "v1" && typeof signature === "string" && signature.length > 0 && safeEqualBase64(expected, signature);
  });
}

export function providerError(event: Record<string, unknown>) {
  const data = objectValue(event.data);
  const bounce = objectValue(data.bounce);
  const values = [bounce.message, data.error, data.reason, data.message];
  return values.find((value) => typeof value === "string" && value.trim()) as string | undefined || "";
}
