import PocketBase from 'pocketbase'
import '@tanstack/react-start/server-only'
import { PB_AUTH_COOKIE } from './constants'

const DEFAULT_PUBLIC_POCKETBASE_URL = 'https://db.ieeesahrdaya.com'

/**
 * Server-only. Reads the private/internal PB URL from the server environment.
 * Authenticated/admin operations intentionally require explicit configuration.
 */
export function getPBUrl(): string {
  const url = process.env.POCKETBASE_URL
  if (!url) {
    throw new Error('POCKETBASE_URL is not configured')
  }
  return url
}

/**
 * Public collection reads must not depend on a Docker-internal service alias.
 * Preview deployments can live in a different stack, and a shared overlay may
 * contain multiple services named `pocketbase`. Use the canonical public PB
 * origin unless an explicit public origin is configured.
 */
export function getPublicPBUrl(): string {
  return process.env.PUBLIC_POCKETBASE_URL?.trim() || DEFAULT_PUBLIC_POCKETBASE_URL
}

export function createPB(cookieString?: string) {
  const pb = new PocketBase(getPBUrl())
  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, PB_AUTH_COOKIE)
  }
  return pb
}

export function createPublicPB() {
  return new PocketBase(getPublicPBUrl())
}

/**
 * Converts a plain object containing File objects into a FormData instance.
 * If no File instances are found, returns the original object.
 * This is required because PocketBase JS SDK only uploads files when passed a FormData instance.
 */
export function serializeToFormData(data: Record<string, any>): FormData | Record<string, any> {
  let hasFile = false;
  for (const value of Object.values(data)) {
    if (value instanceof File) {
      hasFile = true;
      break;
    }
  }
  if (!hasFile) {
    return data;
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (value instanceof File) {
      formData.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          if (item instanceof File) {
            formData.append(key, item);
          } else {
            formData.append(
              key,
              typeof item === "object" ? JSON.stringify(item) : String(item),
            );
          }
        }
      });
    } else if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }
  return formData;
}