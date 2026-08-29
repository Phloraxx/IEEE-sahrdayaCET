import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadHookModule<T>(path: string): T {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const sandbox = { module: { exports: {} as Record<string, unknown> }, exports: {} };
  vm.runInNewContext(source, sandbox, { filename: path });
  return sandbox.module.exports as T;
}

const rules = loadHookModule<{
  validateLayout: (value: unknown) => { valid: boolean; errors: string[] };
  publicationErrors: (value: Record<string, unknown>) => string[];
  stableStringify: (value: unknown) => string;
}>("pb_hooks/certificate-template-rules.js");
const files = loadHookModule<{
  pngInfo: (bytes: number[]) => { format: string; width: number; height: number } | null;
  jpegInfo: (bytes: number[]) => { format: string; width: number; height: number } | null;
}>("pb_hooks/certificate-file-validation.js");

const validLayout = {
  name: { x: 0.5, y: 0.47, maxWidth: 0.62, preferredFontSize: 132, minFontSize: 68, align: "center", color: "#0B243D", fontFamily: "noto-sans" },
  credentialId: { x: 0.05, y: 0.88, fontSize: 30, align: "left", color: "#0B243D" },
  qr: { x: 0.86, y: 0.76, size: 0.11 },
};

describe("certificate template publication rules", () => {
  it("accepts the production layout contract", () => {
    expect(rules.validateLayout(validLayout)).toMatchObject({ valid: true, errors: [] });
    expect(rules.publicationErrors({
      renderBase: "base.png", canvasWidth: 2400, canvasHeight: 1350, layout: validLayout,
      emailSubject: "Your certificate | {{eventTitle}}",
      emailText: "Hi {{firstName}} — {{credentialId}} — {{verificationUrl}}",
    })).toEqual([]);
  });
  it("rejects incomplete layout, oversized canvas, and unknown mail variables", () => {
    const errors = rules.publicationErrors({
      renderBase: "base.png", canvasWidth: 8000, canvasHeight: 7000,
      layout: { name: {}, credentialId: {}, qr: {} },
      emailSubject: "Hello {{madeUpVariable}}", emailText: "Body",
    });
    expect(errors.some((value: string) => value.includes("canvas"))).toBe(true);
    expect(errors.some((value: string) => value.includes("Unknown email placeholders"))).toBe(true);
    expect(errors.length).toBeGreaterThan(4);
  });

  it("keeps the publication fingerprint deterministic across key order", () => {
    expect(rules.stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      rules.stableStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});

describe("certificate asset signature parsing", () => {
  it("reads PNG dimensions from the real magic bytes", () => {
    const png = [137,80,78,71,13,10,26,10, 0,0,0,13, 73,72,68,82, 0,0,9,96, 0,0,5,70];
    expect(files.pngInfo(png)).toEqual({ format: "png", width: 2400, height: 1350 });
  });

  it("rejects arbitrary bytes as an image", () => {
    expect(files.pngInfo([1,2,3,4])).toBeNull();
    expect(files.jpegInfo([1,2,3,4])).toBeNull();
  });
});
