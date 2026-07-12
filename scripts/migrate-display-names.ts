// FIFA WC Predict '26 — one-time display name backfill
//
// Updates users whose display_name is empty or starts with "Player "
// to their actual name (if available in the 'name' field populated
// by Google OAuth).
//
// Run with:
//   bun scripts/migrate-display-names.ts
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

async function main(): Promise<void> {
  console.log(`\nFIFA WC Predict '26 — Display Name Backfill`)
  console.log(`PocketBase: ${PB_URL}\n`)

  const allUsers = await listAll('users', '')
  console.log(`Found ${allUsers.length} users`)

  let updated = 0
  let skipped = 0

  for (const user of allUsers) {
    const userId = String(user.id || '')
    const displayName = String(user.display_name || '').trim()
    const realName = String(user.name || '').trim()

    if (!userId) continue

    if (realName && (!displayName || displayName.startsWith('Player '))) {
      await api('PATCH', `/api/collections/users/records/${userId}`, { display_name: realName })
      updated++
    } else {
      skipped++
    }
  }

  console.log(`[ok] Updated ${updated} users, skipped ${skipped} (already had custom names or missing real name).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
