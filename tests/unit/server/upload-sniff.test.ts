import { describe, expect, it } from "vitest";

import {
	normalizeDeclaredImageType,
	sniffImageMime,
} from "../../../src/server/uploads/sniff";

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00", "binary");
const WEBP = Buffer.concat([
	Buffer.from("RIFF", "ascii"),
	Buffer.from([0x24, 0x00, 0x00, 0x00]),
	Buffer.from("WEBP", "ascii"),
	Buffer.from("VP8 ", "ascii"),
]);

describe("upload image sniffing", () => {
	it("recognises the four supported formats from their magic bytes", () => {
		expect(sniffImageMime(PNG)).toBe("image/png");
		expect(sniffImageMime(JPEG)).toBe("image/jpeg");
		expect(sniffImageMime(GIF)).toBe("image/gif");
		expect(sniffImageMime(WEBP)).toBe("image/webp");
	});

	it("rejects SVG, HTML and a text file dressed as an image", () => {
		const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
		expect(sniffImageMime(svg)).toBeNull();
		expect(sniffImageMime(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
		expect(sniffImageMime(Buffer.from("just text"))).toBeNull();
		expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
	});

	it("does not accept a truncated signature", () => {
		expect(sniffImageMime(PNG.subarray(0, 4))).toBeNull();
		expect(sniffImageMime(Buffer.from("RIFFxxxxWAVE"))).toBeNull();
	});

	it("normalises the browser's jpg aliases", () => {
		expect(normalizeDeclaredImageType("image/jpg")).toBe("image/jpeg");
		expect(normalizeDeclaredImageType("IMAGE/PNG")).toBe("image/png");
		expect(normalizeDeclaredImageType("")).toBe("");
	});
});
