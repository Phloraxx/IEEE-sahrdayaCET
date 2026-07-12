// FIFA WC Predict '26 — one-time backfill
//
// 1. Seeds the single fifa_settings row with defaults (if not present).
// 2. Grants starting_balance to existing users who don't have a balance yet,
//    writing a starting_grant transaction for each.
//
// Idempotent: safe to re-run. Skips users/settings that are already done.
// Also patches missing fields onto an existing settings row (forward-
// compatible with auto_void_hours and the raised min-bets default — see
// FIFA-GAME.md §2.3, §2.4).
//
// Run AFTER migrate:game-schema and migrate:pb-rules.
//   bun scripts/migrate-game-backfill.ts
// Requires: POCKETBASE_URL, POCKETBASE_SUPERUSER_TOKEN

const PB_URL = (process.env.POCKETBASE_URL || process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '')
const TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN

if (!TOKEN) {
  console.error('Missing POCKETBASE_SUPERUSER_TOKEN environment variable')
  process.exit(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function api(method: string, endpoint: string, body?: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
  }
  const res = await fetch(`${PB_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`PB API ${method} ${endpoint} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) throw new Error(`Unexpected PB response: ${text.slice(0, 200)}`)
  return parsed
}

async function listAll(collection: string, filter: string, perPage = 500): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const q = filter ? `?page=${page}&perPage=${perPage}&filter=${encodeURIComponent(filter)}` : `?page=${page}&perPage=${perPage}`
    const res = await api('GET', `/api/collections/${collection}/records${q}`)
    const items = Array.isArray(res.items) ? res.items as Record<string, unknown>[] : []
    out.push(...items)
    const totalPages = typeof res.totalPages === 'number' ? res.totalPages : 1
    if (page >= totalPages) break
    page++
  }
  return out
}

const DEFAULT_SETTINGS = {
  event_name: "IEEE Sahrdaya WC Predict '26",
  starting_balance: 1000,
  max_bet_percent: 25,
  daily_topup_threshold: 100,
  daily_topup_target: 200,
  pool_house_cut_percent: 0,
  raffle_tickets_base: 50,
  raffle_tickets_decay: 2,
  // Raised from 1 → 5 (FIFA-GAME.md §2.4). Only players with ≥5 bets enter
  // the raffle, so a non-bettor at 1000 pts can't free-ride the draw.
  raffle_active_participant_min_bets: 5,
  // NEW (FIFA-GAME.md §2.3). Auto-void matches whose kickoff was more than
  // this many hours ago and are still upcoming/live, or finished-but-unsettled
  // past 48h. 6h gives the admin ample time after a ~2.5h match.
  auto_void_hours: 6,
  prize: "Sponsor voucher (TBD)",
  registration_open: true,
}

async function seedSettings(): Promise<void> {
  let existing: Record<string, unknown> | null = null
  let existingId = ''
  try {
    const res = await api('GET', '/api/collections/fifa_settings/records?perPage=1&filter=1%3D1')
    if (Array.isArray(res.items) && res.items.length > 0) {
      existing = res.items[0] as Record<string, unknown>
      existingId = String(existing.id || '')
    }
  } catch {
    // collection might not exist yet
    console.error('[FAIL] Could not read fifa_settings — run migrate:game-schema first')
    process.exit(1)
  }

  if (!existing) {
    await api('POST', '/api/collections/fifa_settings/records', DEFAULT_SETTINGS)
    console.log('[ok] Seeded fifa_settings with defaults')
    return
  }

  // Row exists — patch any missing fields onto it (forward-compat with the
  // auto_void_hours + raised min-bets default).
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    const cur = existing[k]
    if (cur === undefined || cur === null || cur === '') {
      patch[k] = v
    }
  }
  if (Object.keys(patch).length === 0) {
    console.log('[skip] fifa_settings already seeded and complete')
    return
  }
  await api('PATCH', `/api/collections/fifa_settings/records/${existingId}`, patch)
  console.log(`[ok] Patched fifa_settings with missing field(s): ${Object.keys(patch).join(', ')}`)
}

async function backfillUsers(): Promise<void> {
  // Find users with balance 0 or missing. PB number field defaults to 0,
  // so "missing" and "zero" are indistinguishable — we treat 0 as "needs grant"
  // but skip if they already have a starting_grant transaction.
  const allUsers = await listAll('users', '')
  console.log(`\nFound ${allUsers.length} users`)

  let granted = 0
  let skipped = 0
  const settings = await api('GET', '/api/collections/fifa_settings/records?perPage=1&filter=1%3D1')
  const settingsRow = Array.isArray(settings.items) && settings.items.length > 0 ? settings.items[0] : null
  if (!settingsRow) {
    console.error('[FAIL] No settings row — seedSettings() should have run')
    process.exit(1)
  }
  const startingBalance = Number(settingsRow.starting_balance) || 0

  for (const user of allUsers) {
    const userId = String(user.id || '')
    if (!userId) continue
    const balance = Number(user.balance) || 0
    if (balance > 0) { skipped++; continue }

    // Check if they already have a starting_grant tx (idempotency)
    const txs = await listAll('fifa_transactions', `user = "${userId}" && type = "starting_grant"`, 1)
    if (txs.length > 0) { skipped++; continue }

    // Grant: update balance + write ledger row
    await api('PATCH', `/api/collections/users/records/${userId}`, { balance: startingBalance })
    await api('POST', '/api/collections/fifa_transactions/records', {
      user: userId,
      type: 'starting_grant',
      amount: startingBalance,
      balance_after: startingBalance,
      ref_bet: '',
      note: 'Starting balance grant (backfill)',
    })
    granted++
  }

  console.log(`[ok] Granted starting balance to ${granted} users, skipped ${skipped} (already had balance or grant)`)
}

async function main(): Promise<void> {
  console.log(`\nFIFA WC Predict '26 — backfill`)
  console.log(`PocketBase: ${PB_URL}\n`)

  await seedSettings()
  await backfillUsers()

  console.log('\nBackfill complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})