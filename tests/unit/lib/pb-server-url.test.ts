import { afterEach, describe, expect, it, vi } from "vitest";
import { getPBUrl } from "../../../src/lib/pb.server";

afterEach(() => vi.unstubAllEnvs());

describe("PocketBase internal URL resolution", () => {
  it("uses the explicit internal URL verbatim", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("POCKETBASE_INTERNAL_URL", "http://pocketbase:8090/");
    expect(getPBUrl()).toBe("http://pocketbase:8090");
  });

  it("uses localhost only for local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("POCKETBASE_INTERNAL_URL", "");
    expect(getPBUrl()).toBe("http://127.0.0.1:8090");
  });

  it("fails closed when production has no backend configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("POCKETBASE_INTERNAL_URL", "");
    expect(() => getPBUrl()).toThrow("POCKETBASE_INTERNAL_URL is required in production");
  });
});
