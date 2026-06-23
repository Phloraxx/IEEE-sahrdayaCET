import { z } from 'zod'

/**
 * Payment webhook hardening — shared-secret + idempotency layer.
 *
 * The webhook already verifies a shared secret via timingSafeEqual. This module
 * adds: (1) a Zod-validated body so we never trust an inline-cast shape, and
 * (2) an idempotency guard that rejects a second delivery for the same
 * ticketId/transactionId pair — even if the payload is fresh.
 */

/** Body shape for POST /api/orders/webhook — validated at the boundary. */
export const WebhookBodySchema = z.object({
  ticketId: z.string().min(1),
  status: z.string().min(1),
  transactionId: z.string().optional(),
  amount: z.number().optional(),
})

export type WebhookBody = z.infer<typeof WebhookBodySchema>

/**
 * Idempotency check against an already-processed registration.
 * Returns true if this (ticketId, transactionId) pair was already handled —
 * the caller should return 200 and skip the side-effect.
 *
 * `existingPaymentData` is the registration's current `paymentData` blob.
 * We look for a prior transactionId match; if none was recorded, we fall back
 * to the terminal-status check (paid/failed) that the original code used.
 */
export function isDuplicateWebhook(
  existingPaymentStatus: unknown,
  existingPaymentData: unknown,
  incomingTransactionId: string | undefined,
): boolean {
  // Terminal-status short-circuit: a registration already paid/failed is done.
  if (existingPaymentStatus === 'paid' || existingPaymentStatus === 'failed') {
    return true
  }
  // Replay of a specific transaction we already persisted?
  if (incomingTransactionId) {
    if (
      existingPaymentData &&
      typeof existingPaymentData === 'object' &&
      'transactionId' in existingPaymentData
    ) {
      const prior = (existingPaymentData as { transactionId: unknown }).transactionId
      if (typeof prior === 'string' && prior === incomingTransactionId) {
        return true
      }
    }
  }
  return false
}