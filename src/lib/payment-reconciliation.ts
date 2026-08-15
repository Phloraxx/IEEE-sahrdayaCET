export const LOCAL_PAYMENT_STATUS_POLL_MS = 4_000;

const PROVIDER_RECONCILE_SCHEDULE_MS = [
  8_000, 15_000, 30_000, 45_000, 60_000,
] as const;

export function providerReconcileDelayMs(
  attempt: number,
  randomValue = Math.random(),
): number {
  const index = Math.max(
    0,
    Math.min(PROVIDER_RECONCILE_SCHEDULE_MS.length - 1, Math.floor(attempt)),
  );
  const base = PROVIDER_RECONCILE_SCHEDULE_MS[index] ?? 60_000;
  const boundedRandom = Math.max(0, Math.min(1, randomValue));

  // Positive jitter keeps simultaneous checkout sessions from reconciling with
  // Razorpay on the same cadence while never retrying earlier than the base delay.
  return Math.round(base * (1 + boundedRandom * 0.2));
}

export function providerRetryAfterMs(
  error: unknown,
  fallbackMs: number,
): number {
  if (!error || typeof error !== "object") return fallbackMs;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return fallbackMs;
  const candidate = Number((response as Record<string, unknown>).retryAfterMs);
  return Number.isFinite(candidate) && candidate >= 1_000
    ? Math.min(candidate, 120_000)
    : fallbackMs;
}
