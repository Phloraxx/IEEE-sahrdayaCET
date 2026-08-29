import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

import {
  certificateRendererFontsAvailable,
  certificateVerificationUrl,
  renderCertificatePdf,
  renderCertificatePng,
  type CertificateRenderInput,
} from "../../src/server/certificates/render.server";

const describeWithFonts = certificateRendererFontsAvailable() ? describe : describe.skip;

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(): Promise<CertificateRenderInput> {
  const canvasWidth = 1600;
  const canvasHeight = 900;
  const renderBase = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 248, g: 251, b: 255, alpha: 1 },
    },
  }).png().toBuffer();

  return {
    renderBase,
    canvasWidth,
    canvasHeight,
    recipientName: "Mohammed Abdul Rahman Kizhakkedath",
    credentialId: "IEEESB-2026-COMP-ABC1234567",
    verificationToken: "Ab8kP2x9Qm7Vr4sL1Cd3Ef5Gh7Jk9Mn2Pq4Rs6Tu8Vw0Xy2Za",
    layout: {
      name: {
        x: 0.5,
        y: 0.48,
        maxWidth: 0.72,
        preferredFontSize: 92,
        minFontSize: 42,
        align: "center",
        color: "#0B243D",
        fontFamily: "noto-sans",
      },
      credentialId: {
        x: 0.06,
        y: 0.88,
        fontSize: 24,
        align: "left",
        color: "#0B243D",
      },
      qr: { x: 0.88, y: 0.78, size: 0.09 },
    },
  };
}

describe("certificate renderer contract", () => {
  it("always builds the canonical production verification URL", () => {
    expect(certificateVerificationUrl("ABC123")).toBe("https://ieeesahrdaya.com/c/ABC123");
  });
});

describeWithFonts("certificate deterministic renderer", () => {
  it("renders deterministic PNG output with exact dimensions and a one-page deterministic PDF", async () => {
    const input = await fixture();
    const first = await renderCertificatePng(input);
    const second = await renderCertificatePng(input);

    expect(sha256(first)).toBe(sha256(second));
    expect(first.subarray(0, 8)).toEqual(Buffer.from("89504e470d0a1a0a", "hex"));
    const metadata = await sharp(first).metadata();
    expect(metadata.width).toBe(input.canvasWidth);
    expect(metadata.height).toBe(input.canvasHeight);

    const pdfA = await renderCertificatePdf(first, input.canvasWidth, input.canvasHeight);
    const pdfB = await renderCertificatePdf(first, input.canvasWidth, input.canvasHeight);
    expect(pdfA.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sha256(pdfA)).toBe(sha256(pdfB));
    const loaded = await PDFDocument.load(pdfA);
    expect(loaded.getPageCount()).toBe(1);
  });
});
