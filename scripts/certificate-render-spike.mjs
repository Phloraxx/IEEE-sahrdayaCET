import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const WIDTH = 2400;
const HEIGHT = 1350;
const OUTPUT_DIR = process.env.CERT_SPIKE_OUTPUT || "/tmp/ieee-certificate-render-spike";
const FONT_PATH = "/usr/share/fonts/noto/NotoSans-Regular.ttf";
const preferredFontSize = 132;
const minimumFontSize = 68;
const maxNameWidth = 1450;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function renderMeasuredText(text, fontSize, color = "#0b243d") {
  const dpi = Math.round(fontSize * 6);
  const rendered = await sharp({
    text: {
      text: `<span foreground="${color}">${escapeXml(text)}</span>`,
      font: "Noto Sans",
      fontfile: FONT_PATH,
      rgba: true,
      dpi,
    },
  }).png().toBuffer({ resolveWithObject: true });
  return { buffer: rendered.data, width: rendered.info.width, height: rendered.info.height };
}

async function fitName(name) {
  for (let size = preferredFontSize; size >= minimumFontSize; size -= 2) {
    const rendered = await renderMeasuredText(name, size);
    if (rendered.width <= maxNameWidth) return { ...rendered, fontSize: size };
  }
  const minimum = await renderMeasuredText(name, minimumFontSize);
  if (minimum.width > maxNameWidth) {
    throw new Error(`Name requires manual review: ${name}`);
  }
  return { ...minimum, fontSize: minimumFontSize };
}

function baseSvg() {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f7fbff"/><stop offset="1" stop-color="#e9f4fb"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="64" y="64" width="2272" height="1222" rx="18" fill="none" stroke="#00629b" stroke-width="5"/>
      <text x="1200" y="245" text-anchor="middle" font-family="sans-serif" font-size="38" fill="#00629b" letter-spacing="7">IEEE SAHRDAYA STUDENT BRANCH</text>
      <text x="1200" y="390" text-anchor="middle" font-family="sans-serif" font-size="82" font-weight="700" fill="#0b243d">CERTIFICATE OF PARTICIPATION</text>
      <text x="1200" y="520" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#516171">This certificate is presented to</text>
      <line x1="510" y1="775" x2="1890" y2="775" stroke="#9bb7c8" stroke-width="2"/>
      <text x="1200" y="880" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#516171">for participating in the IEEE Sahrdaya certificate rendering validation.</text>
    </svg>
  `);
}

async function renderCertificate({ name, credentialId, verificationUrl }) {
  const fitted = await fitName(name);
  const qr = await QRCode.toBuffer(verificationUrl, {
    type: "png",
    width: 250,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const idSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="620" height="90">
      <text x="0" y="40" font-family="sans-serif" font-size="28" fill="#43576b">Credential ID</text>
      <text x="0" y="78" font-family="monospace" font-size="30" font-weight="700" fill="#0b243d">${escapeXml(credentialId)}</text>
    </svg>
  `);

  const png = await sharp(baseSvg())
    .composite([
      {
        input: fitted.buffer,
        left: Math.round((WIDTH - fitted.width) / 2),
        top: 585,
      },
      { input: qr, left: 2055, top: 1010 },
      { input: idSvg, left: 115, top: 1090 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const metadata = await sharp(png).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`Unexpected PNG dimensions ${metadata.width}x${metadata.height}`);
  }
  return { png, fitted };
}

async function renderPdf(png) {
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(png);
  const pageWidth = 960;
  const pageHeight = pageWidth * (HEIGHT / WIDTH);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fixtures = [
    "A. B. Roy",
    "Sourav P Bijoy",
    "Mohammed Abdul Rahman Kizhakkedath",
    "Anne-Marie O'Connor",
    "José Álvarez",
  ];

  const fitResults = [];
  for (const name of fixtures) {
    const fitted = await fitName(name);
    fitResults.push({ name, fontSize: fitted.fontSize, width: fitted.width });
  }

  const input = {
    name: "Mohammed Abdul Rahman Kizhakkedath",
    credentialId: "IEEESB-CERT-2026-000154",
    verificationUrl: "https://ieeesahrdaya.com/c/Ab8kP2x9Qm7Vr4sL",
  };
  const first = await renderCertificate(input);
  const second = await renderCertificate(input);
  const firstHash = sha256(first.png);
  const secondHash = sha256(second.png);
  if (firstHash !== secondHash) throw new Error("PNG rendering is not deterministic");

  const pdf = await renderPdf(first.png);
  const loadedPdf = await PDFDocument.load(pdf);
  if (loadedPdf.getPageCount() !== 1) throw new Error("PDF must contain exactly one page");
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF signature");
  if (first.png.length > 3_000_000) throw new Error(`PNG is unexpectedly large: ${first.png.length}`);

  const pngPath = resolve(OUTPUT_DIR, "certificate-spike.png");
  const pdfPath = resolve(OUTPUT_DIR, "certificate-spike.pdf");
  await writeFile(pngPath, first.png);
  await writeFile(pdfPath, pdf);

  console.log(JSON.stringify({
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    dimensions: `${WIDTH}x${HEIGHT}`,
    pngBytes: first.png.length,
    pdfBytes: pdf.length,
    sha256: firstHash,
    fittedNameFontSize: first.fitted.fontSize,
    fixtures: fitResults,
    pngPath,
    pdfPath,
  }, null, 2));
}

await main();
