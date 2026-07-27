import PocketBase from "pocketbase";

const LOCAL_POCKETBASE_URL = "http://127.0.0.1:8090";

export function getPBUrl(): string {
  const configured = process.env.POCKETBASE_INTERNAL_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return LOCAL_POCKETBASE_URL;
  throw new Error("POCKETBASE_INTERNAL_URL is required in production");
}

/** Unauthenticated SSR client for data that PocketBase rules expose publicly. */
export function createPublicPB(): PocketBase {
  return new PocketBase(getPBUrl());
}
