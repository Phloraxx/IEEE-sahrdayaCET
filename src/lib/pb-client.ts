import PocketBase from "pocketbase";

let instance: PocketBase | null = null;

/**
 * The browser talks to PocketBase on the same origin under /api.
 * Never configure a public database hostname in frontend code.
 */
export function getPbClient(): PocketBase {
  if (typeof window === "undefined") {
    throw new Error("getPbClient() is browser-only");
  }
  if (!instance) {
    instance = new PocketBase(window.location.origin);
    instance.autoCancellation(false);
  }
  return instance;
}
