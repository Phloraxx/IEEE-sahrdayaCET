import { describe, expect, it } from "vitest";
import { generateQRDataUrl } from "@/lib/qr-utils";

describe("QR image generation", () => {
  it("generates a real PNG data URL", async () => {
    const result = await generateQRDataUrl(
      "upi://pay?pa=test@example&am=1.23&cu=INR",
      {
        width: 256,
        margin: 4,
      },
    );

    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    const encoded = result.split(",", 2)[1];
    expect(encoded).toBeTruthy();
    if (!encoded) throw new Error("PNG payload missing");
    const bytes = Buffer.from(encoded, "base64");
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
