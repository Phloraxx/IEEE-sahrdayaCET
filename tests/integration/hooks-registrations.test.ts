/**
 * Integration tests for registration hooks + ticket lookup.
 * Requires POCKETBASE_URL, POCKETBASE_SUPERUSER_TOKEN, PAYMENT_WEBHOOK_SECRET.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const PB_URL = process.env.POCKETBASE_URL?.replace(/\/+$/, '')
const SU_TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN
const skip = !PB_URL || !SU_TOKEN

function loadWebhookSecret(): string {
  if (process.env.PAYMENT_WEBHOOK_SECRET) return process.env.PAYMENT_WEBHOOK_SECRET
  try {
    const envPath = join(process.cwd(), '.env.local')
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*PAYMENT_WEBHOOK_SECRET=(.*)$/)
      if (m) return m[1].trim()
    }
  } catch { /* optional */ }
  return ''
}

async function pb(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data: data as Record<string, unknown> }
}

const cleanup: Array<{ col: string; id: string }> = []

describe.skipIf(skip)('Registration hooks (live PB)', () => {
  let suAuth: Record<string, string>
  let societyId = ''
  let userId = ''

  beforeAll(async () => {
    suAuth = { Authorization: `Bearer ${SU_TOKEN}` }
    const soc = await pb('GET', '/api/collections/societies/records?perPage=1&fields=id', undefined, suAuth)
    societyId = (soc.data.items as Array<{ id: string }>)?.[0]?.id ?? ''
    const users = await pb('GET', '/api/collections/users/records?perPage=1&fields=id', undefined, suAuth)
    userId = (users.data.items as Array<{ id: string }>)?.[0]?.id ?? ''
    expect(societyId).toBeTruthy()
    expect(userId).toBeTruthy()
  })

  afterAll(async () => {
    for (const item of [...cleanup].reverse()) {
      try {
        await pb('DELETE', `/api/collections/${item.col}/records/${item.id}`, undefined, suAuth)
      } catch { /* ok */ }
    }
  })

  it('creates a free registration via REST', async () => {
    const ev = await pb('POST', '/api/collections/events/records', {
      title: `IntTest Free ${Date.now()}`,
      status: 'published',
      registrationOpen: true,
      price: 0,
      maxCapacity: 10,
      society: societyId,
      date: '2026-12-20',
      venue: 'Lab',
    }, suAuth)
    expect(ev.status).toBe(200)
    const eventId = ev.data.id as string
    cleanup.push({ col: 'events', id: eventId })

    const reg = await pb('POST', '/api/collections/registrations/records', {
      user: userId,
      event: eventId,
      userName: 'Test',
      userEmail: 'test@sahrdaya.ac.in',
      userPhone: '9999999999',
      formResponses: { name: 'Test' },
    }, suAuth)
    expect(reg.status).toBe(200)
    const regId = reg.data.id as string
    cleanup.push({ col: 'registrations', id: regId })

    const full = await pb('GET', `/api/collections/registrations/records/${regId}`, undefined, suAuth)
    expect(full.data.ticketId).toMatch(/^TKT-/)
    expect(full.data.registrationStatus).toBe('confirmed')
  })

  it('paid registration + webhook mints ticketId', async () => {
    const webhook = loadWebhookSecret()
    expect(webhook).toBeTruthy()

    const ev = await pb('POST', '/api/collections/events/records', {
      title: `IntTest Paid ${Date.now()}`,
      status: 'published',
      registrationOpen: true,
      price: 250,
      maxCapacity: 10,
      society: societyId,
      date: '2026-12-20',
      venue: 'Lab',
    }, suAuth)
    const eventId = ev.data.id as string
    cleanup.push({ col: 'events', id: eventId })

    const reg = await pb('POST', '/api/collections/registrations/records', {
      user: userId,
      event: eventId,
      userName: 'Paid Test',
      userEmail: 'paid@sahrdaya.ac.in',
      userPhone: '8888888888',
      formResponses: {},
    }, suAuth)
    expect(reg.status).toBe(200)
    const regId = reg.data.id as string
    cleanup.push({ col: 'registrations', id: regId })

    const paymentTicketId = reg.data.paymentTicketId as string
    expect(paymentTicketId).toBeTruthy()

    const wh = await pb('POST', '/api/webhooks/payment-confirm', {
      ticketId: paymentTicketId,
      status: 'success',
      transactionId: `int-${Date.now()}`,
      amount: 250,
    }, { 'x-webhook-secret': webhook })
    expect(wh.status).toBe(200)

    const after = await pb('GET', `/api/collections/registrations/records/${regId}`, undefined, suAuth)
    expect(after.data.ticketId).toMatch(/^TKT-/)
    expect(after.data.paymentStatus).toBe('paid')
    expect(after.data.registrationStatus).toBe('confirmed')
  })

  it('public ticket lookup returns found without auth', async () => {
    const ev = await pb('POST', '/api/collections/events/records', {
      title: `IntTest Lookup ${Date.now()}`,
      status: 'published',
      registrationOpen: true,
      price: 0,
      maxCapacity: 10,
      society: societyId,
      date: '2026-12-20',
      venue: 'Lab',
    }, suAuth)
    const eventId = ev.data.id as string
    cleanup.push({ col: 'events', id: eventId })

    const reg = await pb('POST', '/api/collections/registrations/records', {
      user: userId,
      event: eventId,
      userName: 'Lookup',
      userEmail: 'lookup@sahrdaya.ac.in',
      userPhone: '1',
      formResponses: {},
    }, suAuth)
    const regId = reg.data.id as string
    cleanup.push({ col: 'registrations', id: regId })

    const ticketId = reg.data.ticketId as string
    const lookup = await pb('GET', `/api/tickets/lookup?ticketId=${encodeURIComponent(ticketId)}`)
    expect(lookup.status).toBe(200)
    expect(lookup.data.found).toBe(true)
    expect((lookup.data.ticket as Record<string, string>)?.id).toBe(ticketId)
    expect(lookup.data.userName).toBeUndefined()
    expect(lookup.data.userEmail).toBeUndefined()
  })
})