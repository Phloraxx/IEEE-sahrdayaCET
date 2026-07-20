import PocketBase from 'pocketbase'
import '@tanstack/react-start/server-only'
import { PB_AUTH_COOKIE } from './constants'

/**
 * Server-only. Reads the PB URL from the server environment.
 * Throws at build/import time if this module is pulled into a client bundle.
 */
export function getPBUrl(): string {
  const url = process.env.POCKETBASE_URL
  if (!url) {
    throw new Error('POCKETBASE_URL is not configured')
  }
  return url
}

export function createPB(cookieString?: string) {
  const pb = new PocketBase(getPBUrl())
  if (cookieString) {
    pb.authStore.loadFromCookie(cookieString, PB_AUTH_COOKIE)
  }
  return pb
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