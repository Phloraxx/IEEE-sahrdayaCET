/**
 * Registration primitives — TypeScript port of `pb_hooks/registration-helpers.js`.
 *
 * These are the pieces the create command depends on for idempotent replay and
 * money handling. They are pure: no database, no I/O.
 */

import { randomBytes } from "node:crypto";

/** A JSON object stored in a TEXT column, or `{}`. */
export function jsonObject(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined || value === "") return {};
	if (typeof value === "string") {
		try {
			const parsed: unknown = JSON.parse(value);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	}
	if (typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

/**
 * Stable JSON serialisation with sorted keys.
 *
 * Used to compare a stored answer with a retried one: key order must not make
 * two identical answers look different.
 */
export function canonicalJson(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (typeof value === "object") {
		const entries = Object.keys(value as Record<string, unknown>)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(String(value));
}

/**
 * May a retry reuse the existing registration?
 *
 * A retry may omit optional answers, but any answer it *does* supply must equal
 * what was committed. That makes lost-response recovery safe without turning a
 * replay into an edit path.
 */
export function replayCompatible(stored: unknown, incoming: unknown): boolean {
	const storedObject = jsonObject(stored);
	const incomingObject = jsonObject(incoming);
	for (const key of Object.keys(incomingObject)) {
		if (canonicalJson(storedObject[key]) !== canonicalJson(incomingObject[key])) return false;
	}
	return true;
}

/**
 * The registration's final fee in paise.
 *
 * `final_fee_paise` is authoritative. The legacy `amount` column holds rupees
 * and is only consulted when the paise column is zero, which is how the
 * PocketBase helper kept pre-port rows readable.
 */
export function finalFeePaise(row: {
	final_fee_paise?: number | null;
	amount?: number | null;
}): number {
	const paise = Number(row.final_fee_paise ?? 0);
	if (Number.isFinite(paise) && Math.floor(paise) === paise && paise >= 0) {
		if (paise > 0) return paise;
		const legacy = Number(row.amount ?? 0);
		if (!Number.isFinite(legacy) || legacy <= 0) return 0;
	}
	const rupees = Number(row.amount ?? 0);
	return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
}

/** The registration's discount in paise, with the same legacy fallback. */
export function discountPaise(row: {
	discount_paise?: number | null;
	discount_amount?: number | null;
}): number {
	const paise = Number(row.discount_paise ?? 0);
	if (Number.isFinite(paise) && Math.floor(paise) === paise && paise > 0) return paise;
	const rupees = Number(row.discount_amount ?? 0);
	return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
}

/** Rupee amount for display, derived from paise. */
export function amountRupees(row: { final_fee_paise?: number | null; amount?: number | null }): number {
	return finalFeePaise(row) / 100;
}

/** The event's base fee in paise, falling back to the legacy rupee `price`. */
export function eventBaseFeePaise(event: {
	base_fee_paise?: number | null;
	price?: number | null;
}): number {
	const paise = Number(event.base_fee_paise ?? 0);
	if (Number.isFinite(paise) && Math.floor(paise) === paise && paise > 0) return paise;
	const rupees = Number(event.price ?? 0);
	return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0;
}

/** A user-facing ticket id: `TKT-` + 16 characters. */
export function generateTicketId(): string {
	return `TKT-${randomBytes(12).toString("base64url").slice(0, 16).toUpperCase()}`;
}

/** The payment webhook lookup key (32 characters). */
export function generatePaymentTicketId(): string {
	return randomBytes(24).toString("base64url").slice(0, 32);
}
