import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public resource URL architecture", () => {
  it("uses the configured public origin for calendar and ticket QR URLs", () => {
    const calendar = read("src/routes/events.$slug.calendar.ts");
    const ticketQr = read("src/routes/ticket-qr.$ticketId.ts");
    for (const source of [calendar, ticketQr]) {
      expect(source).toContain("publicRequestOrigin(request)");
      expect(source).not.toContain("new URL(request.url).origin");
    }
  });
});
