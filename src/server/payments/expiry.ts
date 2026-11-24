/**
 * Local expiry rules for a pending PayGate reservation.
 *
 * Kept separate from `reconcile.ts` and `apply.ts` so the batch pass, the
 * provider poll and the attendee refresh all share one definition instead of
 * three near-copies. Nothing here talks to the provider: these rules answer
 * "may the local clock release this seat?", and every caller that knows the
 * provider holds a real session must ask the provider first.
 */

import { PAYGATE_PROVIDER } from "./paygate";

function asObject(value: unknown): Record<string, unknown> {
	if (!value) return {};
	if (typeof value === "object") return value as Record<string, unknown>;
	try {
		const parsed = JSON.parse(String(value)) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function toPositiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Should this pending registration's seat be released?
 *
 * Ported verbatim from `shouldReleasePendingRegistration`. Returns false for
 * anything it does not positively recognise, so an unknown provider state keeps
 * the seat rather than dropping it.
 */
export function shouldReleasePendingRegistration(
	registration: {
		registration_status: string;
		payment_status: string;
		registration_date: string | null;
		created_at: string;
		payment_data: string | null;
	},
	nowMs: number,
	graceSeconds: number,
): boolean {
	if (registration.registration_status !== "pending") return false;
	if (registration.payment_status !== "pending") return false;

	const data = asObject(registration.payment_data);
	if (data.provider !== PAYGATE_PROVIDER) return false;

	const status = String(data.providerStatus ?? "not_initialized");
	const graceMs = toPositiveInt(graceSeconds, 600) * 1000;

	if (status === "cancelled" || status === "late") return true;

	if (status === "expired") {
		const expiresAt = Date.parse(String(data.expiresAt ?? ""));
		return Number.isFinite(expiresAt) && nowMs > expiresAt + graceMs;
	}

	if (status === "not_initialized") {
		const createdAt = Date.parse(registration.registration_date ?? registration.created_at ?? "");
		return Number.isFinite(createdAt) && nowMs > createdAt + graceMs;
	}

	return false;
}

/**
 * Is this reservation waiting on a real provider session?
 *
 * When it is, the local clock is *not* authoritative: only a provider answer
 * (or a provider 404) may end it. This is the guard that stops a missed webhook
 * from turning into a lost seat while the money is still collectable.
 */
export function awaitsProviderSession(paymentData: string | null): boolean {
	const data = asObject(paymentData);
	if (data.provider !== PAYGATE_PROVIDER) return false;
	return Boolean(String(data.paymentId ?? "").trim());
}

/** Why the seat was released — recorded so the audit trail explains itself. */
export function releaseReasonFor(providerStatus: string): string {
	if (providerStatus === "expired") {
		return "PayGate payment expired and the IEEE grace window elapsed";
	}
	if (providerStatus === "not_initialized") {
		return "PayGate payment was never initialized before the IEEE grace window elapsed";
	}
	return "PayGate payment could not complete";
}
