import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blurredVariant, buildSrcSet, isResizableUpload } from "../../../src/lib/image-srcset";

describe("upload srcset (?w= variants)", () => {
  it("only resizes /files/ URLs", () => {
    expect(isResizableUpload("/files/events/abc/poster.webp")).toBe(true);
    expect(isResizableUpload("/Events/curated-photo-480w.webp")).toBe(false);
    expect(isResizableUpload("/media/flagships/altair-2023-audience.webp")).toBe(false);
  });

  it("offers the documented widths and nothing for already-sized assets", () => {
    expect(buildSrcSet("/files/events/abc/poster.webp")).toBe(
      "/files/events/abc/poster.webp?w=320 320w, /files/events/abc/poster.webp?w=480 480w, /files/events/abc/poster.webp?w=640 640w, /files/events/abc/poster.webp?w=960 960w, /files/events/abc/poster.webp?w=1280 1280w",
    );
    // Static media is served as exported; the gallery names its own files.
    expect(buildSrcSet("/Events/curated-photo.webp?v=1")).toBeUndefined();
    expect(buildSrcSet("/media/sustainx/sustainx-01.webp")).toBeUndefined();
  });

  it("keeps existing query strings", () => {
    expect(buildSrcSet("/files/execom/x/portrait.jpg?v=2")).toContain("/files/execom/x/portrait.jpg?v=2&w=320 320w");
  });

  it("asks for a tiny variant behind blurred backdrops", () => {
    expect(blurredVariant("/files/events/abc/poster.webp")).toBe("/files/events/abc/poster.webp?w=64");
    expect(blurredVariant("/Events/curated-photo.webp")).toBe("/Events/curated-photo.webp");
    expect(existsSync(resolve(process.cwd(), "scripts/generate-gallery-derivatives.mjs"))).toBe(true);
  });
});
