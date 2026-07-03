import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PB_URL = process.env.POCKETBASE_URL || process.env.PB_URL || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL!
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD!
const PB_SUPERUSER_TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN!

let AUTH_TOKEN = PB_SUPERUSER_TOKEN || ''

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function run(method: string, endpoint: string, opts?: { body?: string }): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`

  const res = await fetch(`${PB_URL}${endpoint}`, {
    method,
    headers,
    body: opts?.body ?? undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PB API error: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
  }

  const parsed: unknown = await res.json()
  if (!isRecord(parsed)) {
    throw new Error(`Unexpected PB response: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  if (typeof parsed.status === 'number' && parsed.status >= 400) {
    throw new Error(`PB API error (${parsed.status}): ${parsed.message || JSON.stringify(parsed.data)}`)
  }
  if (typeof parsed.code === 'number' && parsed.code >= 400) {
    throw new Error(`PB API error (${parsed.code}): ${parsed.message || JSON.stringify(parsed.data)}`)
  }
  return parsed
}

async function pbGet(endpoint: string): Promise<any> {
  return run('GET', endpoint)
}

async function pbPatch(endpoint: string, body: object): Promise<any> {
  return run('PATCH', endpoint, { body: JSON.stringify(body) })
}

async function main() {
  // Login (skip if token already provided via POCKETBASE_SUPERUSER_TOKEN)
  if (!AUTH_TOKEN) {
    if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
      console.error('Either POCKETBASE_SUPERUSER_TOKEN or PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD required')
      process.exit(1)
    }
    console.log('\nLogging in...')
    const loginRes = await run('POST', '/api/collections/_superusers/auth-with-password', {
      body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
    })
    AUTH_TOKEN = loginRes.token
    console.log('OK:', loginRes.record?.email || 'unknown')
  } else {
    console.log('\nUsing provided POCKETBASE_SUPERUSER_TOKEN')
  }

  // --- Add indexes and fields to events ---
  console.log('\nUpdating events collection...')
  const eventsCol = await pbGet('/api/collections/events')
  const eventsFields = eventsCol.fields || []

  // Add registeredCount and checkedInCount if missing
  const hasRegisteredCount = eventsFields.some((f: any) => f.name === 'registeredCount')
  const hasCheckedInCount = eventsFields.some((f: any) => f.name === 'checkedInCount')

  if (!hasRegisteredCount) {
    eventsFields.push({ name: 'registeredCount', type: 'number' })
    console.log('  + Adding registeredCount field')
  }
  if (!hasCheckedInCount) {
    eventsFields.push({ name: 'checkedInCount', type: 'number' })
    console.log('  + Adding checkedInCount field')
  }

  await pbPatch('/api/collections/events', {
    fields: eventsFields,
    indexes: [
      'CREATE INDEX idx_events_status_date ON events (status, date)',
      'CREATE INDEX idx_events_dates ON events (date, endDate)',
      'CREATE INDEX idx_events_society ON events (society)',
      'CREATE INDEX idx_events_isDeleted ON events (isDeleted)',
    ],
  })
  console.log('  Events indexes added: (status, date), (date, endDate), (society), (isDeleted)')

  // --- Add indexes to societies ---
  console.log('\nUpdating societies collection...')
  await pbPatch('/api/collections/societies', {
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_societies_chairs ON societies (chairs)',
    ],
  })
  console.log('  Societies indexes added: (chairs)')

  // --- Add indexes to registrations ---
  console.log('\nUpdating registrations collection...')
  await pbPatch('/api/collections/registrations', {
    indexes: [
      'CREATE UNIQUE INDEX idx_registrations_ticketId ON registrations (ticketId)',
      'CREATE UNIQUE INDEX idx_registrations_user_event ON registrations (user, event) WHERE registrationStatus != "cancelled"',
      'CREATE UNIQUE INDEX idx_registrations_payment_ticket ON registrations (paymentTicketId) WHERE paymentTicketId != ""',
      'CREATE INDEX idx_registrations_event ON registrations (event)',
      'CREATE INDEX idx_registrations_status ON registrations (registrationStatus)',
      'CREATE INDEX idx_registrations_event_ticket ON registrations (event, ticketId)',
      'CREATE INDEX idx_registrations_event_payment ON registrations (event, paymentTicketId)',
      'CREATE INDEX idx_registrations_regdate ON registrations (registrationDate)',
    ],
  })
  console.log('  Registrations indexes added: (user, event) UNIQUE partial, (ticketId) UNIQUE, (paymentTicketId) UNIQUE partial [excludes empty], (event), (status), (event, ticketId), (event, paymentTicketId)')

  // --- Add indexes to coupons ---
  console.log('\nUpdating coupons collection...')
  await pbPatch('/api/collections/coupons', {
    indexes: [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code)',
    ],
  })
  console.log('  Coupons index added: (code) UNIQUE')

  console.log('\nMigration complete!')
}

main().catch(err => { console.error(err); process.exit(1) })
