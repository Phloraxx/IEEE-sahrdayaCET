import { getPbClient } from "@/lib/pb-client";
import { getField } from "@/lib/safe-get";

export type HealthSeverity = "critical" | "warning";
export interface DataHealthIssue {
  id: string;
  severity: HealthSeverity;
  category: string;
  title: string;
  detail: string;
  href?: string;
}
export interface DataHealthReport {
  issues: DataHealthIssue[];
  checkedAt: string;
  counts: { events: number; registrations: number; coupons: number; notifications: number; payments: number; refunds: number; webhooks: number };
}

export async function getAdminDataHealth(): Promise<DataHealthReport> {
  const pb = getPbClient();
  const role = String(pb.authStore.record?.role || "");
  if (role !== "admin") throw new Error("Administrator access required");

  const [events, registrations, coupons, notifications, payments, refunds, webhooks] = await Promise.all([
    pb.collection("events").getFullList({ batch: 200, filter: "isDeleted != true" }),
    pb.collection("registrations").getFullList({ batch: 500 }),
    pb.collection("coupons").getFullList({ batch: 300 }),
    pb.collection("notification_outbox").getFullList({ batch: 300, filter: "status = 'failed' && attempts >= 8" }).catch(() => []),
    pb.collection("payments").getFullList({ batch: 500 }),
    pb.collection("payment_refunds").getFullList({ batch: 300, filter: "status = 'failed'" }).catch(() => []),
    pb.collection("payment_webhook_events").getFullList({ batch: 300, filter: "status = 'failed' && attempts >= 8" }).catch(() => []),
  ]);
  const issues: DataHealthIssue[] = [];
  const activeByEvent = new Map<string, number>();
  const checkedByEvent = new Map<string, number>();
  const couponUses = new Map<string, number>();
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));

  for (const reg of registrations) {
    const eventId = String(getField(reg, "event", ""));
    const status = String(getField(reg, "registrationStatus", ""));
    const checked = Boolean(getField(reg, "checkedIn", false));
    const name = String(getField(reg, "userName", "") || getField(reg, "userEmail", "") || reg.id);
    if (status !== "cancelled") activeByEvent.set(eventId, (activeByEvent.get(eventId) || 0) + 1);
    if (status === "confirmed" && checked) checkedByEvent.set(eventId, (checkedByEvent.get(eventId) || 0) + 1);
    const code = String(getField(reg, "couponCode", ""));
    if (code && status !== "cancelled") couponUses.set(`${eventId}:${code}`, (couponUses.get(`${eventId}:${code}`) || 0) + 1);
    if (checked && status === "pending") {
      issues.push({ id: `checkin:${reg.id}`, severity: "critical", category: "Registration", title: `${name} is checked in while registration is pending`, detail: "A pending registration should never be actively checked in.", href: `/admin/registrations/${reg.id}` });
    }
  }

  for (const event of events) {
    const id = event.id;
    const title = String(getField(event, "title", "") || id);
    const active = activeByEvent.get(id) || 0;
    const checked = checkedByEvent.get(id) || 0;
    const cachedActive = Number(getField(event, "registeredCount", 0)) || 0;
    const cachedChecked = Number(getField(event, "checkedInCount", 0)) || 0;
    if (active !== cachedActive) {
      issues.push({ id: `event-count:${id}`, severity: "warning", category: "Counters", title: `${title}: registration counter drift`, detail: `Cached ${cachedActive}; actual active registrations ${active}.`, href: `/admin/events/${id}` });
    }
    if (checked !== cachedChecked) {
      issues.push({ id: `checkin-count:${id}`, severity: "warning", category: "Counters", title: `${title}: check-in counter drift`, detail: `Cached ${cachedChecked}; actual confirmed check-ins ${checked}.`, href: `/admin/events/${id}` });
    }
  }

  for (const coupon of coupons) {
    const eventId = String(getField(coupon, "event", ""));
    const code = String(getField(coupon, "code", ""));
    const actual = couponUses.get(`${eventId}:${code}`) || 0;
    const cached = Number(getField(coupon, "usedCount", 0)) || 0;
    if (actual !== cached) {
      issues.push({ id: `coupon:${coupon.id}`, severity: "warning", category: "Counters", title: `Coupon ${code}: usage counter drift`, detail: `Cached ${cached}; actual active uses ${actual}.`, href: `/admin/events/${eventId}` });
    }
  }

  for (const item of notifications) {
    const attempts = Number(getField(item, "attempts", 0)) || 0;
    issues.push({ id: `notification:${item.id}`, severity: "warning", category: "Notification", title: "Notification exhausted retries", detail: `Delivery failed after ${attempts} attempts.` });
  }

  const now = Date.now();
  for (const payment of payments) {
    const registrationId = String(getField(payment, "registration", ""));
    const registration = registrationById.get(registrationId);
    const provider = String(getField(payment, "provider", ""));
    const status = String(getField(payment, "status", ""));
    const finalPaise = Number(getField(payment, "finalFeePaise", 0)) || 0;
    const collectedPaise = Number(getField(payment, "collectedPaise", 0)) || 0;
    const registrationPaymentStatus = String(getField(registration, "paymentStatus", ""));
    if (!registration) {
      issues.push({ id: `payment-orphan:${payment.id}`, severity: "critical", category: "Payment", title: "Payment has no registration", detail: `Ledger record ${payment.id} points to a missing registration.` });
      continue;
    }
    if (provider === "razorpay" && (status === "captured" || status === "partially_refunded" || status === "refunded") && !String(getField(payment, "capturedPaymentId", ""))) {
      issues.push({ id: `payment-id:${payment.id}`, severity: "critical", category: "Payment", title: "Captured Razorpay ledger is missing its payment ID", detail: "Provider-backed financial history must retain the Razorpay payment identifier.", href: `/admin/registrations/${registrationId}` });
    }
    if (provider === "razorpay" && status === "captured" && finalPaise > 0 && collectedPaise !== finalPaise) {
      issues.push({ id: `payment-amount:${payment.id}`, severity: "critical", category: "Payment", title: "Razorpay collection amount does not match the registration fee", detail: `Expected ${finalPaise} paise; ledger collected ${collectedPaise} paise.`, href: `/admin/registrations/${registrationId}` });
    }
    if ((status === "captured" || status === "partially_refunded") && registrationPaymentStatus !== "paid") {
      issues.push({ id: `payment-state:${payment.id}`, severity: "critical", category: "Payment", title: "Ledger and registration disagree about a captured payment", detail: `Ledger is ${status}; registration payment state is ${registrationPaymentStatus || "empty"}.`, href: `/admin/registrations/${registrationId}` });
    }
    if (status === "refunded" && registrationPaymentStatus !== "refunded") {
      issues.push({ id: `refund-state:${payment.id}`, severity: "critical", category: "Payment", title: "Refunded ledger and registration are out of sync", detail: `Registration payment state is ${registrationPaymentStatus || "empty"}.`, href: `/admin/registrations/${registrationId}` });
    }
    const hold = Date.parse(String(getField(payment, "holdExpiresAt", "")));
    if ((status === "pending" || status === "authorized") && Number.isFinite(hold) && now - hold > 2 * 60_000) {
      issues.push({ id: `stale-payment:${payment.id}`, severity: "warning", category: "Payment", title: "Payment hold is stale", detail: "The checkout hold expired more than two minutes ago and should have been reconciled/released.", href: `/admin/registrations/${registrationId}` });
    }
    if (Boolean(getField(payment, "manualReview", false))) {
      issues.push({ id: `payment-review:${payment.id}`, severity: "warning", category: "Payment", title: "Payment requires manual review", detail: String(getField(payment, "reviewReason", "") || "The payment ledger is flagged for administrator review."), href: `/admin/registrations/${registrationId}` });
    }
  }

  for (const refund of refunds) {
    const attempts = Number(getField(refund, "attempts", 0)) || 0;
    issues.push({ id: `refund:${refund.id}`, severity: attempts >= 8 ? "critical" : "warning", category: "Refund", title: "Razorpay refund failed", detail: `${String(getField(refund, "failureReason", "") || "Provider refund failed.")} Attempts: ${attempts}.` });
  }
  for (const webhook of webhooks) {
    const attempts = Number(getField(webhook, "attempts", 0)) || 0;
    issues.push({ id: `webhook:${webhook.id}`, severity: "warning", category: "Webhook", title: "Razorpay webhook processing exhausted retries", detail: `${String(getField(webhook, "eventType", "") || "Webhook event")} failed after ${attempts} attempts.` });
  }

  const rank = { critical: 0, warning: 1 } as const;
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.category.localeCompare(b.category));
  return { issues, checkedAt: new Date().toISOString(), counts: { events: events.length, registrations: registrations.length, coupons: coupons.length, notifications: notifications.length, payments: payments.length, refunds: refunds.length, webhooks: webhooks.length } };
}
