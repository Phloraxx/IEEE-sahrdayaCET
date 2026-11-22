/**
 * Magic-byte sniffing for uploaded images.
 *
 * The browser-declared `Content-Type` is attacker-controlled: a valid SVG (or an
 * HTML document, or a polyglot) declared as `image/png` used to pass the upload
 * filter and reach `sharp`, which sniffs content and hands SVG to librsvg. That
 * is the parse surface CVE-2026-96889 lives in, and it is unnecessary: the
 * supported formats all start with a fixed signature, so the server can decide
 * what the bytes are and ignore what the client says.
 *
 * The sniffed type is also what names the stored file, so the extension can never
 * come from the client's filename or its MIME claim.
 */

export type SniffedImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
	if (bytes.length < signature.length) return false;
	return signature.every((value, index) => bytes[index] === value);
}

/** The image type the bytes actually are, or `null` for anything else. */
export function sniffImageMime(bytes: Uint8Array): SniffedImageMime | null {
	if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
	if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";

	// GIF87a / GIF89a.
	if (
		bytes.length >= 6 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
	}

	// RIFF....WEBP
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}

	return null;
}

/** Browser aliases that mean the same format. */
export function normalizeDeclaredImageType(value: string | null | undefined): string {
	const raw = String(value ?? "").trim().toLowerCase();
	if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
	return raw;
}
