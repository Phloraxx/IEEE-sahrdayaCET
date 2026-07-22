import PocketBase from "pocketbase";

const LOCAL_POCKETBASE_URL = "http://127.0.0.1:8090";

export function getPBUrl(): string {
  const configured = process.env.POCKETBASE_INTERNAL_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return LOCAL_POCKETBASE_URL;
  throw new Error("POCKETBASE_INTERNAL_URL is required in production");
}

/** Public SSR client only. It has no user or superuser credentials. */
export function createPublicPB(): PocketBase {
  return new PocketBase(getPBUrl());
}

/**
 * Transitional alias for public SSR reads while old route modules are migrated.
 * Authenticated browser operations must use getPbClient() directly.
 */
export function createPB(): PocketBase {
  return createPublicPB();
}

export function serializeToFormData(data: Record<string, unknown>): FormData | Record<string, unknown> {
  const hasFile = Object.values(data).some((value) => value instanceof File);
  if (!hasFile) return data;

  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (value instanceof File) formData.append(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null) continue;
        formData.append(key, item instanceof File ? item : typeof item === "object" ? JSON.stringify(item) : String(item));
      }
    } else if (typeof value === "object") formData.append(key, JSON.stringify(value));
    else formData.append(key, String(value));
  }
  return formData;
}
