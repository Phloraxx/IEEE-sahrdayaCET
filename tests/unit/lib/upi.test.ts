import { describe, expect, it } from "vitest";

import { getUpiId, toPersonalUpiUri } from "@/lib/upi";

describe("UPI QR helpers", () => {
  const merchantLike =
    "upi://pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR&tr=payment_123&tn=payment_123&mc=1234";

  it("keeps only the fields used by the personal-account QR flow", () => {
    expect(toPersonalUpiUri(merchantLike)).toBe(
      "upi://pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR",
    );
  });

  it("extracts the payee UPI ID", () => {
    expect(getUpiId(merchantLike)).toBe("sourav@oksbi");
  });

  it("rejects non-UPI and incomplete links", () => {
    expect(toPersonalUpiUri("https://example.com")).toBeNull();
    expect(toPersonalUpiUri("upi://pay?pn=Sourav&am=100.37")).toBeNull();
  });
});
