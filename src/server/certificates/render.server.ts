import { existsSync } from "node:fs";
import QRCode from "qrcode";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

export const CERTIFICATE_VERIFICATION_ORIGIN = "https://ieeesahrdaya.com";

export type CertificateTextAlign = "left" | "center" | "right";
export type CertificateNameFont = "noto-sans" | "noto-serif";

export interface CertificateTemplateLayout {
  name: {
    x: number;
    y: number;
    maxWidth: number;
    preferredFontSize: number;
    minFontSize: number;
    align: CertificateTextAlign;
    color: string;
    fontFamily: CertificateNameFont;
  };
  credentialId: {
    x: number;
    y: number;
    fontSize: number;
    align: CertificateTextAlign;
    color: string;
  };
  qr: {
    x: number;
    y: number;
    size: number;
  };
}

export interface CertificateRenderInput {
  renderBase: Buffer;
  canvasWidth: number;
  canvasHeight: number;
  layout: CertificateTemplateLayout;
  recipientName: string;
  credentialId: string;
  verificationToken: string;
}

const FONT_FILES: Record<CertificateNameFont, string[]> = {
  "noto-sans": [
    "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/local/share/fonts/NotoSans-Regular.ttf",
  ],
  "noto-serif": [
    "/usr/share/fonts/noto/NotoSerif-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
    "/usr/local/share/fonts/NotoSerif-Regular.ttf",
  ],
};

function fontConfig(family: CertificateNameFont) {
  const path = FONT_FILES[family].find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`Required certificate font is unavailable: ${family}`);
  return {
    path,
    name: family === "noto-serif" ? "Noto Serif" : "Noto Sans",
  };
}

export function certificateRendererFontsAvailable() {
  return (Object.keys(FONT_FILES) as CertificateNameFont[]).every((family) =>
    FONT_FILES[family].some((candidate) => existsSync(candidate)),
  );
}

function escapeXml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function renderMeasuredText(
  text: string,
  fontSize: number,
  color: string,
  family: CertificateNameFont,
) {
  const font = fontConfig(family);
  const dpi = Math.round(fontSize * 6);
  const rendered = await sharp({
    text: {
      text: `<span foreground="${escapeXml(color)}">${escapeXml(text)}</span>`,
      font: font.name,
      fontfile: font.path,
      rgba: true,
      dpi,
    },
  }).png().toBuffer({ resolveWithObject: true });
  return {
    buffer: rendered.data,
    width: rendered.info.width,
    height: rendered.info.height,
  };
}

async function fitName(input: CertificateRenderInput) {
  const config = input.layout.name;
  const maxWidth = Math.round(input.canvasWidth * config.maxWidth);
  for (let size = config.preferredFontSize; size >= config.minFontSize; size -= 2) {
    const rendered = await renderMeasuredText(input.recipientName, size, config.color, config.fontFamily);
    if (rendered.width <= maxWidth) return { ...rendered, fontSize: size, maxWidth };
  }
  const minimum = await renderMeasuredText(input.recipientName, config.minFontSize, config.color, config.fontFamily);
  if (minimum.width > maxWidth) {
    throw new Error(`Certificate recipient name requires manual review: ${input.recipientName}`);
  }
  return { ...minimum, fontSize: config.minFontSize, maxWidth };
}

function nameLeft(anchorX: number, width: number, containerWidth: number, align: CertificateTextAlign) {
  const containerLeft = anchorX - containerWidth / 2;
  if (align === "left") return containerLeft;
  if (align === "right") return containerLeft + containerWidth - width;
  return anchorX - width / 2;
}

function anchoredLeft(anchorX: number, width: number, align: CertificateTextAlign) {
  if (align === "left") return anchorX;
  if (align === "right") return anchorX - width;
  return anchorX - width / 2;
}

function assertInsideCanvas(label: string, left: number, top: number, width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (left < 0 || top < 0 || left + width > canvasWidth || top + height > canvasHeight) {
    throw new Error(`${label} falls outside the certificate canvas`);
  }
}

export function certificateVerificationUrl(token: string) {
  return `${CERTIFICATE_VERIFICATION_ORIGIN}/c/${encodeURIComponent(token)}`;
}

export async function renderCertificatePng(input: CertificateRenderInput) {
  const baseMetadata = await sharp(input.renderBase).metadata();
  if (baseMetadata.width !== input.canvasWidth || baseMetadata.height !== input.canvasHeight) {
    throw new Error(`Render base dimensions ${baseMetadata.width || 0}x${baseMetadata.height || 0} do not match ${input.canvasWidth}x${input.canvasHeight}`);
  }

  const fittedName = await fitName(input);
  const nameLeftPx = Math.round(nameLeft(
    input.layout.name.x * input.canvasWidth,
    fittedName.width,
    fittedName.maxWidth,
    input.layout.name.align,
  ));
  const nameTopPx = Math.round(input.layout.name.y * input.canvasHeight - fittedName.height / 2);
  assertInsideCanvas("Recipient name", nameLeftPx, nameTopPx, fittedName.width, fittedName.height, input.canvasWidth, input.canvasHeight);

  const credential = await renderMeasuredText(
    input.credentialId,
    input.layout.credentialId.fontSize,
    input.layout.credentialId.color,
    "noto-sans",
  );
  const credentialLeftPx = Math.round(anchoredLeft(
    input.layout.credentialId.x * input.canvasWidth,
    credential.width,
    input.layout.credentialId.align,
  ));
  const credentialTopPx = Math.round(input.layout.credentialId.y * input.canvasHeight - credential.height / 2);
  assertInsideCanvas("Credential ID", credentialLeftPx, credentialTopPx, credential.width, credential.height, input.canvasWidth, input.canvasHeight);

  const qrSize = Math.max(1, Math.round(input.layout.qr.size * input.canvasWidth));
  const qr = await QRCode.toBuffer(certificateVerificationUrl(input.verificationToken), {
    type: "png",
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrLeft = Math.round(input.layout.qr.x * input.canvasWidth - qrSize / 2);
  const qrTop = Math.round(input.layout.qr.y * input.canvasHeight - qrSize / 2);
  assertInsideCanvas("Verification QR", qrLeft, qrTop, qrSize, qrSize, input.canvasWidth, input.canvasHeight);

  const png = await sharp(input.renderBase)
    .composite([
      { input: fittedName.buffer, left: nameLeftPx, top: nameTopPx },
      { input: credential.buffer, left: credentialLeftPx, top: credentialTopPx },
      { input: qr, left: qrLeft, top: qrTop },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const metadata = await sharp(png).metadata();
  if (metadata.width !== input.canvasWidth || metadata.height !== input.canvasHeight) {
    throw new Error(`Rendered certificate dimensions are invalid: ${metadata.width || 0}x${metadata.height || 0}`);
  }
  return png;
}

export async function renderCertificatePdf(png: Buffer, canvasWidth: number, canvasHeight: number) {
  const pdf = await PDFDocument.create();
  pdf.setCreator("IEEE Sahrdaya Certificate Renderer");
  pdf.setProducer("IEEE Sahrdaya Certificate Renderer");
  const fixedMetadataDate = new Date("2000-01-01T00:00:00.000Z");
  pdf.setCreationDate(fixedMetadataDate);
  pdf.setModificationDate(fixedMetadataDate);

  const embedded = await pdf.embedPng(png);
  const pageWidth = 960;
  const pageHeight = pageWidth * (canvasHeight / canvasWidth);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
