import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
// The generator is a plain ESM script; importing it gives this suite the same
// code path `--check` uses, so the checked-in files and the component agree.
// @ts-expect-error - plain .mjs script, no declarations by design
import { GALLERY_ASPECT, GALLERY_WIDTHS, derivativePath } from "../../../scripts/generate-gallery-derivatives.mjs";

const root = process.cwd();
const gallery = readFileSync(resolve(root, "src/components/EventsShowcase.tsx"), "utf8");

/** `src` + `widths` pairs, read exactly as the generator reads them. */
const frames = [...(/const eventImages = \[([\s\S]*?)\n\];/.exec(gallery)?.[1] ?? "").matchAll(/src:\s*'([^']+)'\s*,\s*widths:\s*\[([^\]]*)\]/g)].map((match) => ({
  src: match[1] as string,
  widths: (match[2] ?? "").split(",").map((value) => Number(value.trim())).filter(Boolean),
}));

/** The `/Events` filenames this component asks for, e.g. `photo-480w.webp`. */
const derivativeNames = frames.flatMap((frame) => frame.widths.map((width) => derivativePath(frame.src, width).replace("/Events/", "")));

describe("homepage gallery derivatives", () => {
  it("scopes derivatives to the seven curated frames at two widths", () => {
    expect(frames).toHaveLength(7);
    expect(GALLERY_WIDTHS).toEqual([320, 480]);
    for (const frame of frames) {
      expect(frame.widths).toEqual([320, 480]);
      // The gallery only ever serves its derivatives from `/Events`.
      expect(derivativePath(frame.src, 320).startsWith("/Events/")).toBe(true);
    }
    // Every frame is a real checked-in original: the `src` never depends on a
    // derivative existing.
    for (const frame of frames) {
      const original = resolve(root, `public${frame.src.split("?")[0]}`);
      expect(existsSync(original), original).toBe(true);
    }
  });

  it("keeps the checked-in /Events derivative set small and exact", () => {
    const files = readdirSync(resolve(root, "public/Events")).filter((name) => /-\d+w\.webp$/.test(name));
    // Exactly the frames' own names — an orphan or a stray width is a failure.
    expect(files.sort()).toEqual([...derivativeNames].sort());
    const bytes = files.reduce((total, name) => total + statSync(resolve(root, "public/Events", name)).size, 0);
    expect(bytes).toBeLessThan(320 * 1024);
  });

  it("ships every derivative at its exact card ratio", async () => {
    for (const frame of frames) {
      for (const width of frame.widths) {
        const file = resolve(root, `public${derivativePath(frame.src, width)}`);
        expect(existsSync(file), file).toBe(true);
        // The same measurement `--check` makes: WebP, asked-for width, 4:3 crop.
        const metadata = await sharp(file).metadata();
        expect(metadata.format, file).toBe("webp");
        expect(metadata.width, file).toBe(width);
        expect(metadata.height, file).toBe(Math.round(width / GALLERY_ASPECT));
      }
    }
    expect(GALLERY_ASPECT).toBeCloseTo(4 / 3, 5);
    // The component and the generator must not drift on sizes.
    expect(gallery).toContain("(min-width: 640px) 260px, 166px");
  });

  it("names the derivative beside the original, whatever its extension", () => {
    expect(derivativePath("/Events/photo_n.jpg?v=1", 480)).toBe("/Events/photo_n-480w.webp");
    expect(derivativePath("/Events/photo_n.webp", 320)).toBe("/Events/photo_n-320w.webp");
  });
});
