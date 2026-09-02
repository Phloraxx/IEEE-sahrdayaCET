function validPublicOrigin(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

export function publicRequestOrigin(request: Request, configuredSiteUrl = process.env.SITE_URL) {
  const configured = validPublicOrigin(String(configuredSiteUrl || ""));
  if (configured) return configured;

  const url = new URL(request.url);
  const forwardedProto = (String(request.headers.get("x-forwarded-proto") || "").split(",")[0] || "")
    .trim()
    .toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") {
    url.protocol = `${forwardedProto}:`;
  }
  return url.origin;
}
