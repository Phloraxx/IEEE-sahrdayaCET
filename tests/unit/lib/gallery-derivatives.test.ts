import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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

function webpHeader(file: string) {
  const bytes = readFileSync(file);
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return { isWebp, bytes: bytes.length };
}

describe("homepage gallery derivatives", () => {
  it("scopes derivatives to the seven curated frames at two widths", () => {
    expect(frames).toHaveLength(7);
    expect(GALLERY_WIDTHS).toEqual([320, 480]);
    for (const frame of frames) {
      expect(frame.widths).toEqual([320, 480]);
    }
    // Every frame is a real checked-in original: the `src` never depends on a
    // derivative existing.
    for (const frame of frames) {
      const original = resolve(root, `public${frame.src.split("?")[0]}`);
      expect(existsSync(original), original).toBe(true);
    }
  });

  it("keeps the checked-in derivative set small and limited to /Events", () => {
    const extra = readdirSync(resolve(root, "public/Events")).filter((name) => /-\d+w\.webp$/.test(name));
    // 7 photos × 2 widths, nothing else in the repository.
    expect(extra).toHaveLength(14);
    const bytes = extra.reduce((total, name) => total + statSync(resolve(root, "public/Events", name)).size, 0);
    expect(bytes).toBeLessThan(320 * 1024);
  });

  it("introduces no derivative outside /Events relative to the base commit", async () => {
    // The base commit (de807dfa) is the contract: the only image the working
    // tree adds is the gallery's fourteen files — no static-media derivatives.
    const { execFileSync } = await import("node:child_process");
    const base = "de807dfa";
    const addedInTree = execFileSync("git", ["ls-tree", "-r", "--name-only", base, "public"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((path) => /-\d+w\.webp$/.test(path));
    expect(addedInTree).toHaveLength(0);
  });

  it("ships every derivative at its exact card ratio", () => {
    for (const frame of frames) {
      for (const width of frame.widths) {
        const file = resolve(root, `public${derivativePath(frame.src, width)}`);
        expect(existsSync(file), file).toBe(true);
        const header = webpHeader(file);
        expect(header.isWebp).toBe(true);
        expect(header.bytes).toBeGreaterThan(0);
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
