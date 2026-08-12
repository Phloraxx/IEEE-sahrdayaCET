import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface ReceiptHelpers {
  formatDate: (value: string) => string;
  paidAmount: (registration: FakeRecord) => string;
  receiptPdfBytes: (registration: FakeRecord, event: FakeRecord) => number[];
}

class FakeRecord {
  constructor(public id: string, private values: Record<string, unknown>) {}
  getString(key: string): string { return typeof this.values[key] === "string" ? String(this.values[key]) : ""; }
  getInt(key: string): number { return Number(this.values[key]) || 0; }
  get(key: string): unknown { return this.values[key]; }
}

function loadHelpers(): ReceiptHelpers {
  const source = readFileSync(resolve(process.cwd(), "pb_hooks/notification-helpers.js"), "utf8");
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, {
    module,
    exports: module.exports,
    console,
    Date,
    isFinite,
    encodeURIComponent,
    toBytes: (value: string) => Array.from(Buffer.from(value, "utf8")),
  });
  return module.exports as unknown as ReceiptHelpers;
}

const helpers = loadHelpers();

describe("payment receipt PDF", () => {
  it("uses the exact paid amount and generates a readable PDF payload", () => {
    const registration = new FakeRecord("reg123", {
      userName: "Student Name",
      userEmail: "student@example.test",
      ticketId: "TKT-ABC123",
      amount: 100,
      paymentData: { payableAmount: "100.37", paidAt: "2026-08-12T07:00:00Z" },
    });
    const event = new FakeRecord("evt123", { title: "Test Workshop", venue: "Main Auditorium" });

    expect(helpers.paidAmount(registration)).toBe("100.37");
    const pdf = Buffer.from(helpers.receiptPdfBytes(registration, event));
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("PAYMENT RECEIPT");
    expect(text).toContain("Amount received: INR 100.37");
    expect(text).toContain("Ticket ID: TKT-ABC123");
    expect(text).toContain("Event: Test Workshop");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });
  it("formats event and payment timestamps in India Standard Time", () => {
    expect(helpers.formatDate("2026-08-12T07:00:00Z")).toBe("12 Aug 2026, 12:30 PM IST");
    expect(helpers.formatDate("2026-08-11T20:45:00Z")).toBe("12 Aug 2026, 2:15 AM IST");
  });

});
