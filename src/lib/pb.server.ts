import PocketBase from 'pocketbase'
import '@tanstack/react-start/server-only'
import { PB_AUTH_COOKIE } from './constants'

const DEFAULT_PUBLIC_POCKETBASE_URL = 'https://db.ieeesahrdaya.com'
const LEGACY_OR_AMBIGUOUS_POCKETBASE_URLS = new Set([
  'https://db.phloraxx.us.to',
  'http://pocketbase:8090',
])

/**
 * Server-only. Reads the PB URL from the server environment.
 *
 * Production previews historically inherited either the retired public host or
 * the generic Docker service name `pocketbase`. The latter is unsafe on the
 * shared Dokploy overlay because multiple stacks can publish that same network
 * alias. Route those known deployment values through the canonical PB origin.
 * Local development still requires an explicit POCKETBASE_URL so it cannot
 * accidentally mutate production data.
 */
export function getPBUrl(): string {
  const configured = process.env.POCKETBASE_URL?.trim().replace(/\/+$/, '')

  if (!configured) {
    if (process.env.NODE_ENV === 'production') return DEFAULT_PUBLIC_POCKETBASE_URL
    throw new Error('POCKETBASE_URL is not configured')
  }

  if (LEGACY_OR_AMBIGUOUS_POCKETBASE_URLS.has(configured)) {
    return DEFAULT_PUBLIC_POCKETBASE_URL
  }

  return configured
}

/**
 * Public collection reads must not depend on a Docker-internal service alias.
 * Preview deployments can live in a different stack, so use the canonical
 * public PB origin unless an explicit public origin is configured.
 */
export function getPublicPBUrl(): string {
  return process.env.PUBLIC_POCKETBASE_URL?.trim().replace(/\/+$/, '') || DEFAULT_PUBLIC_POCKETBASE_URL
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