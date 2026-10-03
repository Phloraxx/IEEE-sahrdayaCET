import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/server/public/certificate.server", () => ({ fetchCertificateVerificationById: lookup }));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
import { headers, loader } from "@/routes/verify";

function request(id = "") {
  const url = new URL(`http://localhost/verify?id=${encodeURIComponent(id)}`);
  return { request: new Request(url), url, pattern: "/verify", params: {}, context: {} };
}

describe("public credential lookup", () => {
  beforeEach(() => { lookup.mockReset(); });
  it("does not query the registry for an empty ID", async () => {
    const result = await loader(request("  "));
    expect(result.data).toEqual({ query: "", verification: null, unavailable: false });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("normalizes pasted IDs and retains the verified projection", async () => {
    lookup.mockResolvedValue({ status: "ACTIVE", credentialId: "IEEESB-2026-COMP-ABCDEFGHIJ" });
    const result = await loader(request("  ieeesb-2026-comp-abcdefghij  "));
    expect(lookup).toHaveBeenCalledWith("IEEESB-2026-COMP-ABCDEFGHIJ");
    expect(result.data.verification?.status).toBe("ACTIVE");
    expect(result.data.unavailable).toBe(false);
  });
  it.each(["REVOKED", "SUPERSEDED", "INVALID"])("preserves the registry's %s status", async status => {
    lookup.mockResolvedValue({ status });
    const result = await loader(request("IEEESB-2026-COMP-ABCDEFGHIJ"));
    expect(result.data.verification?.status).toBe(status);
    expect(result.data.unavailable).toBe(false);
  });
  it("returns 503 with the ID preserved when the registry is unreachable", async () => {
    lookup.mockRejectedValue(new Error("Registry unavailable"));
    const result = await loader(request("IEEESB-2026-COMP-ABCDEFGHIJ"));
    expect(result.init?.status).toBe(503);
    expect(result.data).toEqual({ query: "IEEESB-2026-COMP-ABCDEFGHIJ", verification: null, unavailable: true });
    const responseHeaders = headers({ parentHeaders: new Headers() });
    expect(responseHeaders.get("Cache-Control")).toBe("no-store");
    expect(responseHeaders.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
