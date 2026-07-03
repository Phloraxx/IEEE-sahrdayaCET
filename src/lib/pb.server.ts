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
