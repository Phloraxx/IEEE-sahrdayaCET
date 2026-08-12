const PERSONAL_UPI_PARAMS = ["pa", "pn", "am", "cu"] as const;

export function toPersonalUpiUri(upiUri: string): string | null {
  try {
    const source = new URL(upiUri);
    if (source.protocol !== "upi:" || source.hostname !== "pay") return null;

    const params = new URLSearchParams();
    for (const key of PERSONAL_UPI_PARAMS) {
      const value = source.searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }

    if (!params.get("pa") || !params.get("am")) return null;
    if (!params.get("cu")) params.set("cu", "INR");
    return `upi://pay?${params.toString()}`;
  } catch {
    return null;
  }
}

export function getUpiId(upiUri: string): string | null {
  const personalUri = toPersonalUpiUri(upiUri);
  if (!personalUri) return null;

  try {
    return new URL(personalUri).searchParams.get("pa");
  } catch {
    return null;
  }
}
