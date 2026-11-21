/**
 * Certificate rules shared by every surface.
 *
 * Ported from `certificate-template-rules.js` and
 * `certificate-issuance-rules.js`. These are pure functions with no database
 * access, which is why the tests can pin them directly.
 */

import { createHash, randomBytes, randomInt } from "node:crypto";

export const CERTIFICATE_TYPES = [
	"participation",
	"completion",
	"achievement",
	"appreciation",
	"volunteer",
	"speaker",
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const AUDIENCE_TYPES = ["selected", "checked_in", "confirmed", "attendance_qualified"] as const;

export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const ALLOWED_PLACEHOLDERS = [
	"name",
	"firstName",
	"eventTitle",
	"credentialId",
	"verificationUrl",
	"certificateType",
	"issueDate",
] as const;

/** Names used to stress-test a layout before it is published. */
export const TEMPLATE_STRESS_NAMES = [
	"A. B. Roy",
	"Alexandra Joseph",
	"Mohammed Abdul Rahman Kizhakkedath",
	"Anne-Marie O'Connor",
	"Sourav P Bijoy",
	"José María Fernández",
	"Nivedita Krishnakumar Varghese",
];

/** Coerce a JSON-ish column value to an object. */
export function objectValue(value: unknown): Record<string, unknown> {
	if (!value) return {};
	let parsed: unknown = value;
	if (typeof parsed === "string") {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return {};
		}
	}
	return parsed && typeof parsed === "object" && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: {};
}

/** A JSON value with a fixed key order, ready to hash. */
export type StableJson =
	| string
	| number
	| boolean
	| null
	| StableJson[]
	| { [key: string]: StableJson };

function stableValue(value: unknown): StableJson {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!value || typeof value !== "object") {
		// Primitives pass through; anything else JSON cannot represent is dropped.
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			return value;
		}
		return null;
	}
	const out: { [key: string]: StableJson } = {};
	for (const key of Object.keys(value as Record<string, unknown>).sort()) {
		out[key] = stableValue((value as Record<string, unknown>)[key]);
	}
	return out;
}

/** Deterministic JSON, so a content hash does not depend on key order. */
export function stableStringify(value: unknown): string {
	return JSON.stringify(stableValue(value));
}

export function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function numberIn(value: unknown, min: number, max: number): boolean {
	const n = Number(value);
	return Number.isFinite(n) && n >= min && n <= max;
}

function colorValue(value: unknown): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(String(value ?? ""));
}

export interface LayoutValidation {
	valid: boolean;
	errors: string[];
	layout: Record<string, unknown>;
}

/** Ported verbatim from `validateLayout`. */
export function validateLayout(value: unknown): LayoutValidation {
	const layout = objectValue(value);
	const errors: string[] = [];
	const name = objectValue(layout.name);
	const credential = objectValue(layout.credentialId);
	const qr = objectValue(layout.qr);

	if (!numberIn(name.x, 0, 1) || !numberIn(name.y, 0, 1)) errors.push("Participant name position is invalid");
	if (!numberIn(name.maxWidth, 0.1, 0.95)) errors.push("Participant name max width is invalid");
	if (!numberIn(name.preferredFontSize, 20, 360)) errors.push("Participant name preferred font size is invalid");
	if (!numberIn(name.minFontSize, 16, Number(name.preferredFontSize ?? 0))) {
		errors.push("Participant name minimum font size is invalid");
	}
	if (!["left", "center", "right"].includes(String(name.align ?? ""))) {
		errors.push("Participant name alignment is invalid");
	}
	if (!colorValue(name.color)) errors.push("Participant name color is invalid");
	if (!["noto-sans", "noto-serif"].includes(String(name.fontFamily ?? ""))) {
		errors.push("Participant name font is invalid");
	}

	if (!numberIn(credential.x, 0, 1) || !numberIn(credential.y, 0, 1)) {
		errors.push("Credential ID position is invalid");
	}
	if (!numberIn(credential.fontSize, 12, 120)) errors.push("Credential ID font size is invalid");
	if (!["left", "center", "right"].includes(String(credential.align ?? ""))) {
		errors.push("Credential ID alignment is invalid");
	}
	if (!colorValue(credential.color)) errors.push("Credential ID color is invalid");

	if (qr.enabled !== undefined && qr.enabled !== true && qr.enabled !== false) {
		errors.push("QR enabled state is invalid");
	}
	const qrEnabled = qr.enabled === undefined ? true : qr.enabled === true;
	if (qrEnabled) {
		if (!numberIn(qr.x, 0, 1) || !numberIn(qr.y, 0, 1)) errors.push("QR position is invalid");
		if (!numberIn(qr.size, 0.04, 0.35)) errors.push("QR size is invalid");
	}

	return { valid: errors.length === 0, errors, layout };
}

/** Placeholders in the email templates that the renderer cannot fill. */
export function unknownPlaceholders(value: string): string[] {
	const out: string[] = [];
	for (const match of String(value ?? "").matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) {
		const name = match[1] as string;
		if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(name) && !out.includes(name)) {
			out.push(name);
		}
	}
	return out;
}

export interface PublicationInput {
	renderBase?: string;
	canvasWidth?: number;
	canvasHeight?: number;
	layout?: unknown;
	emailSubject?: string;
	emailText?: string;
}

/** Everything that must be true before a template may be published. */
export function publicationErrors(input: PublicationInput): string[] {
	let errors: string[] = [];
	if (!String(input.renderBase ?? "")) errors.push("A flattened render-base PNG is required");
	if (!numberIn(input.canvasWidth, 1000, 6000) || !numberIn(input.canvasHeight, 700, 6000)) {
		errors.push("Certificate canvas dimensions are invalid");
	}
	if (Number(input.canvasWidth ?? 0) * Number(input.canvasHeight ?? 0) > 24_000_000) {
		errors.push("Certificate canvas is too large");
	}
	errors = errors.concat(validateLayout(input.layout).errors);
	if (!String(input.emailSubject ?? "").trim()) errors.push("Email subject is required");
	if (!String(input.emailText ?? "").trim()) errors.push("Email body is required");
	const unknown = unknownPlaceholders(`${String(input.emailSubject ?? "")}\n${String(input.emailText ?? "")}`);
	if (unknown.length) errors.push(`Unknown email placeholders: ${unknown.join(", ")}`);
	return errors;
}

// ---------------------------------------------------------------------------
// Name rendering warnings
// ---------------------------------------------------------------------------

function glyphWidthEm(character: string): number {
	if (/\s/.test(character)) return 0.3;
	if (/[ilI1.,'`|]/.test(character)) return 0.3;
	if (/[MW@%&]/.test(character)) return 0.9;
	if (/[A-Z]/.test(character)) return 0.64;
	return 0.56;
}

function estimatedNameWidthEm(value: string): number {
	let total = 0;
	for (const character of String(value ?? "").trim()) total += glyphWidthEm(character);
	return total;
}

export interface RenderWarning {
	code: string;
	severity: string;
	name?: string;
	message: string;
}

/** Would this name overflow the configured layout? */
export function nameRenderWarnings(name: string, layout: unknown, canvasWidth: number): RenderWarning[] {
	const text = String(name ?? "").trim();
	const parsed = objectValue(layout);
	const nameLayout = objectValue(parsed.name);
	const width = Number(canvasWidth || 0);
	const maxWidth = Number(nameLayout.maxWidth || 0);
	const preferred = Number(nameLayout.preferredFontSize || 0);
	const minimum = Number(nameLayout.minFontSize || 0);
	if (!text || width <= 0 || maxWidth <= 0 || preferred <= 0 || minimum <= 0) return [];

	const available = width * maxWidth;
	const em = estimatedNameWidthEm(text);
	const warnings: RenderWarning[] = [];

	if (em * minimum > available) {
		warnings.push({
			code: "likely_overflow",
			severity: "high",
			name: text,
			message:
				"Name may not fit even at the configured minimum font size; inspect the rendered credential before issuing.",
		});
	} else if (em * preferred > available) {
		warnings.push({
			code: "auto_fit",
			severity: "medium",
			name: text,
			message: "Name will require font auto-fit below the preferred size.",
		});
	}

	if (/[^\u0000-\u024F\u1E00-\u1EFF]/.test(text)) {
		warnings.push({
			code: "font_coverage_review",
			severity: "medium",
			name: text,
			message:
				"Name contains characters outside the built-in Latin stress set; inspect font coverage before issuing.",
		});
	}
	return warnings;
}

/** Run the stress names through a layout, for the publish preflight. */
export function templateNameWarnings(layout: unknown, canvasWidth: number): RenderWarning[] {
	const warnings: RenderWarning[] = [];
	for (const name of TEMPLATE_STRESS_NAMES) {
		warnings.push(...nameRenderWarnings(name, layout, canvasWidth));
	}
	return warnings;
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export function uniqueSorted(values: unknown): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of Array.isArray(values) ? values : []) {
		const id = String(value ?? "").trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	out.sort();
	return out;
}

export function normalizeAudienceConfig(type: string, input: unknown): Record<string, unknown> {
	const raw = objectValue(input);
	if (type === "selected") {
		// One audience, one source: registrations or event volunteers. The
		// config keeps whichever list was supplied so the fingerprint covers it.
		const registrationIds = uniqueSorted(raw.registrationIds);
		const volunteerIds = uniqueSorted(raw.volunteerIds);
		const config: Record<string, unknown> = {};
		if (registrationIds.length) config.registrationIds = registrationIds;
		if (volunteerIds.length) config.volunteerIds = volunteerIds;
		return config;
	}
	return {};
}

export function validEmail(value: unknown): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function audienceInputErrors(type: string, config: Record<string, unknown>): string[] {
	const errors: string[] = [];
	if (!(AUDIENCE_TYPES as readonly string[]).includes(type)) errors.push("Invalid certificate audience type");
	const ids = Array.isArray(config.registrationIds) ? config.registrationIds : [];
	const volunteerIds = Array.isArray(config.volunteerIds) ? config.volunteerIds : [];
	if (type === "selected" && !ids.length && !volunteerIds.length) {
		errors.push("Select at least one registration or volunteer");
	}
	if (type === "selected" && ids.length && volunteerIds.length) {
		errors.push("Select registrations or volunteers, not both");
	}
	if (type === "selected" && ids.length + volunteerIds.length > 2000) {
		errors.push("Selected audience exceeds the supported batch size");
	}
	return errors;
}

export interface FingerprintInput {
	eventId: string;
	templateId: string;
	templateContentHash: string;
	certificateType: string;
	audienceType: string;
	audienceConfig: unknown;
	qualification: unknown;
	recipients: Array<{ id: string; source?: string; name: string; email: string }>;
}

/**
 * The audience fingerprint.
 *
 * Issuance requires the caller to echo this value back, so a batch cannot be
 * created against an audience the operator never reviewed.
 */
export function fingerprint(input: FingerprintInput): string {
	return sha256(
		stableStringify({
			eventId: String(input.eventId ?? ""),
			templateId: String(input.templateId ?? ""),
			templateContentHash: String(input.templateContentHash ?? ""),
			certificateType: String(input.certificateType ?? ""),
			audienceType: String(input.audienceType ?? ""),
			audienceConfig: normalizeAudienceConfig(input.audienceType, input.audienceConfig),
			qualification: input.qualification ?? null,
			recipients: (input.recipients ?? []).map((row) => ({
				id: row.id,
				name: row.name,
				email: row.email,
			})),
		}),
	);
}

/** The batch idempotency key: same event, template, audience and review. */
export function issueKey(input: {
	eventId: string;
	templateId: string;
	audienceType: string;
	audienceConfig: unknown;
	audienceFingerprint: string;
}): string {
	return sha256(
		stableStringify({
			eventId: String(input.eventId ?? ""),
			templateId: String(input.templateId ?? ""),
			audienceType: String(input.audienceType ?? ""),
			audienceConfig: normalizeAudienceConfig(input.audienceType, input.audienceConfig),
			audienceFingerprint: String(input.audienceFingerprint ?? ""),
		}),
	);
}

// ---------------------------------------------------------------------------
// Credential identifiers
// ---------------------------------------------------------------------------

const TYPE_CODES: Record<string, string> = {
	participation: "PART",
	completion: "COMP",
	achievement: "ACHV",
	appreciation: "APPR",
	volunteer: "VOL",
	speaker: "SPKR",
};

export function certificateTypeCode(value: string): string {
	return TYPE_CODES[String(value ?? "")] ?? "CERT";
}

function issueYear(eventDate: string | null, issuedAt: string): string {
	const match = /^(\d{4})/.exec(eventDate ?? "");
	if (match) return match[1] as string;
	return String(new Date(issuedAt).getUTCFullYear());
}

/** `IEEESB-YYYY-TYPE-XXXXXXXXXX`, matching the public verifier's pattern. */
export function credentialId(
	eventDate: string | null,
	certificateType: string,
	issuedAt: string,
): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let suffix = "";
	for (let i = 0; i < 10; i += 1) suffix += alphabet[randomInt(alphabet.length)];
	return `IEEESB-${issueYear(eventDate, issuedAt)}-${certificateTypeCode(certificateType)}-${suffix}`;
}

/** 48 alphanumeric characters, matching the verifier's token pattern. */
export function verificationToken(): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let token = "";
	const bytes = randomBytes(48);
	for (let i = 0; i < 48; i += 1) token += alphabet[(bytes[i] as number) % alphabet.length];
	return token;
}

export const TOKEN_RE = /^[A-Za-z0-9]{48}$/;
export const CREDENTIAL_ID_RE = /^IEEESB-\d{4}-[A-Z]{3,5}-[A-Z0-9]{10}$/;

/** The public status vocabulary. Anything else is reported as INVALID. */
export function publicStatus(status: string | null): "ACTIVE" | "REVOKED" | "SUPERSEDED" | "INVALID" {
	const value = String(status ?? "").toUpperCase();
	if (value === "ACTIVE" || value === "REVOKED" || value === "SUPERSEDED") return value;
	return "INVALID";
}
