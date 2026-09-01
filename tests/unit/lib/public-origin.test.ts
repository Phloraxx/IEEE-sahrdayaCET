import { describe, expect, it } from "vitest";
import { publicRequestOrigin } from "@/server/public-origin.server";

describe("public request origin", () => {
  it("prefers the configured public site over an internal HTTP request", () => {
    const request = new Request("http://web:3000/events/example/calendar.ics");
    expect(publicRequestOrigin(request, "https://staging.ieeesahrdaya.com/"))
      .toBe("https://staging.ieeesahrdaya.com");
  });

  it("honors forwarded HTTPS when no site URL is configured", () => {
    const request = new Request("http://staging.ieeesahrdaya.com/events/example", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(publicRequestOrigin(request, "")).toBe("https://staging.ieeesahrdaya.com");
  });

  it("fails back to the request origin for an invalid configured URL", () => {
    const request = new Request("https://ieeesahrdaya.com/ticket/TKT-ABC123");
    expect(publicRequestOrigin(request, "javascript:alert(1)"))
      .toBe("https://ieeesahrdaya.com");
  });
});
