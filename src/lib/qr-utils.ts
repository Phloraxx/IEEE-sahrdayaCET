import QRCode from "qrcode";

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export async function generateQRDataUrl(
  text: string,
  options?: QRCodeOptions,
): Promise<string> {
  return QRCode.toDataURL(text, {
    type: "image/png",
    errorCorrectionLevel: "M",
    width: options?.width ?? 1024,
    margin: options?.margin ?? 4,
    color: options?.color ?? { dark: "#0F172A", light: "#FFFFFF" },
  });
}

export function downloadQR(dataUrl: string, filename: string): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
