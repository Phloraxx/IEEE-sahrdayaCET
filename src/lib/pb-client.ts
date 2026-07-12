'use client'

import PocketBase from 'pocketbase'
import { PB_PUBLIC_URL } from '@/lib/constants'

// Client-side PocketBase instance, used ONLY for realtime SSE subscriptions
// on public collections (fifa_feed_events, fifa_bet_markets, fifa_matches).
// All reads and writes still go through TanStack server functions (SSR +
// cookie auth). POCKETBASE_URL itself stays server-side; this client talks
// to the same-origin /pb proxy (Caddy rewrites /pb/* -> PB :8090, Vite dev
// proxy does the same).
//
// The pb_auth HttpOnly cookie auto-attaches to same-origin /pb requests, so
// authed SSE would work — but we only use this for public collections, so
// no auth needed. Authed data (dashboard, own bets) is polled via React
// Query against /api/fifa/* server functions instead.

let _pb: PocketBase | null = null

export function getPbClient(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(PB_PUBLIC_URL)
    _pb.autoCancellation(false)
  }
  return _pb
}
