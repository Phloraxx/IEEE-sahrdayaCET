/**
 * Shared helpers for outbound mail templates.
 *
 * Event operations run in Kerala, so every human-facing timestamp is formatted
 * in IST explicitly instead of inheriting the container's timezone. IST has no
 * daylight-saving transition, which is why the fixed offset is safe.
 */

export function htmlEscape(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function siteUrl(): string {
	const raw = String(process.env.SITE_URL || "https://ieeesahrdaya.com").trim();
	return raw.replace(/\/+$/, "") || "https://ieeesahrdaya.com";
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function istParts(value: string): Date | null {
	const date = new Date(String(value || ""));
	if (Number.isNaN(date.getTime())) return null;
	return new Date(date.getTime() + IST_OFFSET_MS);
}

/** `15 Jan 2026, 4:30 PM IST` — or `TBA`. */
export function formatDate(value: string): string {
	const ist = istParts(value);
	if (!ist) return "TBA";
	const day = String(ist.getUTCDate()).padStart(2, "0");
	const hours24 = ist.getUTCHours();
	const hours = hours24 % 12 || 12;
	const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
	const ampm = hours24 >= 12 ? "PM" : "AM";
	return `${day} ${MONTHS[ist.getUTCMonth()] ?? ""} ${ist.getUTCFullYear()}, ${hours}:${minutes} ${ampm} IST`;
}

export interface EventParts {
	date: string;
	time: string;
	year: string;
	day: string;
	month: string;
	weekday: string;
}

export function formatEventParts(value: string): EventParts {
	const ist = istParts(value);
	if (!ist) {
		return {
			date: "TBA",
			time: "TBA",
			year: String(new Date().getFullYear()),
			day: "--",
			month: "TBA",
			weekday: "",
		};
	}
	const hours24 = ist.getUTCHours();
	const hours = hours24 % 12 || 12;
	const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
	const ampm = hours24 >= 12 ? "pm" : "am";
	return {
		date: `${WEEKDAYS[ist.getUTCDay()] ?? ""}, ${ist.getUTCDate()} ${MONTHS_LONG[ist.getUTCMonth()] ?? ""} ${ist.getUTCFullYear()}`,
		time: `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`,
		year: String(ist.getUTCFullYear()),
		day: String(ist.getUTCDate()).padStart(2, "0"),
		month: MONTHS_SHORT[ist.getUTCMonth()] ?? "TBA",
		weekday: WEEKDAYS[ist.getUTCDay()] ?? "",
	};
}

export function firstName(name: string): string {
	return String(name || "").trim().split(/\s+/)[0] || "Student";
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	if (typeof value !== "string" || !value.trim()) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function parseJsonArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value !== "string" || !value.trim()) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
