import { afterEach, describe, expect, it, vi } from "vitest";
import { getPBUrl, getPublicPBUrl } from "../../../src/lib/pb.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PocketBase URL resolution", () => {
  it("preserves an explicit local Docker URL during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("POCKETBASE_URL", "http://pocketbase:8090");
    vi.stubEnv("PUBLIC_POCKETBASE_URL", "");

    expect(getPBUrl()).toBe("http://pocketbase:8090");
    expect(getPublicPBUrl()).toBe("http://pocketbase:8090");
  });

  it("rewrites ambiguous shared-network aliases only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("POCKETBASE_URL", "http://pocketbase:8090");
    vi.stubEnv("PUBLIC_POCKETBASE_URL", "http://pocketbase:8090");

    expect(getPBUrl()).toBe("https://db.ieeesahrdaya.com");
    expect(getPublicPBUrl()).toBe("https://db.ieeesahrdaya.com");
  });

  it("does not silently default local development to production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("POCKETBASE_URL", "");
    vi.stubEnv("PUBLIC_POCKETBASE_URL", "");

    expect(() => getPBUrl()).toThrow("POCKETBASE_URL is not configured");
    expect(() => getPublicPBUrl()).toThrow("POCKETBASE_URL is not configured");
  });
});
