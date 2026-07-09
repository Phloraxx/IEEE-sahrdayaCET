// FIFA WC Predict '26 — schema migration
//
// Creates the 6 game collections and extends `users` with display_name + balance.
// Idempotent: skips collections/fields that already exist, adds missing fields
// to existing collections (forward-compatible with the knockout/any_scorer
// fixes documented in FIFA-GAME.md).
//
// Run with: bun scripts/migrate-game-schema.ts
// Requires: POCKETBASE_URL, POCKETBASE_SUPERUSER_TOKEN
//
// This is the only script in the repo that creates collections (the existing
// migrate-pb-rules.ts and migrate-indexes.ts only patch existing ones). The
// field shapes follow the PocketBase 0.39 collection collection API:
//   https://pocketbase.io/docs/api-collections/
//
// Relations reference collectionId (auto-generated _pbc_XXXXX), so we create
// referenced collections first, then read their IDs back to wire relations.

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
    throw new Error(`PB API ${method} ${endpoint} -> ${res.status} ${res.statusText}: ${text.slice(0, 300)}`)
  }
  if (!text) return {}
  const parsed: unknown = JSON.parse(text)
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

async function collectionExists(name: string): Promise<Record<string, unknown> | null> {
  try {
    return await api('GET', `/api/collections/${name}`)
  } catch {
    return null
  }
}

async function getCollectionId(name: string): Promise<string> {
  const col = await api('GET', `/api/collections/${name}`)
  const id = col.id
  if (typeof id !== 'string') throw new Error(`Could not read id for collection ${name}`)
  return id
}

// ─── Field builders ──────────────────────────────────────────────────
// Keep field objects minimal — PB fills in defaults for omitted options.

function textField(name: string, opts: { min?: number; max?: number; required?: boolean } = {}): Record<string, unknown> {
  return { name, type: 'text', ...opts }
}
function numberField(name: string, opts: { required?: boolean; min?: number; max?: number } = {}): Record<string, unknown> {
  return { name, type: 'number', ...opts }
}
function boolField(name: string): Record<string, unknown> {
  return { name, type: 'bool' }
}
function dateField(name: string, opts: { required?: boolean } = {}): Record<string, unknown> {
  return { name, type: 'date', ...opts }
}
function jsonField(name: string): Record<string, unknown> {
  return { name, type: 'json' }
}
function selectField(name: string, values: string[], opts: { maxSelect?: number; required?: boolean } = {}): Record<string, unknown> {
  return { name, type: 'select', values, maxSelect: opts.maxSelect ?? 1, required: opts.required ?? false }
}
function relationField(name: string, collectionId: string, opts: { maxSelect?: number; required?: boolean; cascadeDelete?: boolean } = {}): Record<string, unknown> {
  return {
    name,
    type: 'relation',
    collectionId,
    maxSelect: opts.maxSelect ?? 1,
    cascadeDelete: opts.cascadeDelete ?? false,
    required: opts.required ?? false,
  }
}

// ─── Collection field schemas (canonical shapes) ─────────────────────
// These are the full field lists. When creating, all fields land at once.
// When updating an existing collection, addField() only appends missing ones.

function matchFields(usersId: string): Record<string, unknown>[] {
  return [
    textField('team_home', { required: true, max: 100 }),
    textField('team_away', { required: true, max: 100 }),
    selectField('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'], { required: true }),
    dateField('kickoff_at', { required: true }),
    dateField('betting_locks_at'),
    selectField('status', ['upcoming', 'live', 'finished', 'void'], { required: true }),
    selectField('result_winner', ['home', 'away', 'draw']),
    numberField('result_home_goals'),
    numberField('result_away_goals'),
    jsonField('result_scorers'),
    numberField('result_yellow_cards'),
    numberField('result_red_cards'),
    boolField('result_home_clean_sheet'),
    boolField('result_away_clean_sheet'),
    // NEW (knockout football — see FIFA-GAME.md §2.1):
    selectField('result_advance', ['home', 'away']),
    boolField('result_after_extra_time'),
    boolField('result_after_penalties'),
    boolField('settled'),
  ]
}

function marketFields(matchesId: string): Record<string, unknown>[] {
  return [
    relationField('match', matchesId, { required: true, cascadeDelete: true }),
    // any_scorer replaces first_scorer (see FIFA-GAME.md §2.2)
    selectField('market_type', ['match_winner', 'total_goals_ou', 'correct_score', 'any_scorer', 'cards_ou', 'clean_sheet', 'custom'], { required: true }),
    selectField('mode', ['pool', 'fixed'], { required: true }),
    numberField('line'),
    jsonField('fixed_odds'),
    jsonField('options'),
    boolField('is_open'),
    boolField('void'),
    numberField('pool_total'),
    jsonField('pool_by_option'),
  ]
}

function betFields(usersId: string, matchesId: string, marketsId: string): Record<string, unknown>[] {
  return [
    relationField('user', usersId, { required: true, cascadeDelete: true }),
    relationField('match', matchesId, { required: true, cascadeDelete: true }),
    relationField('market', marketsId, { required: true, cascadeDelete: true }),
    textField('selection', { required: true, min: 1, max: 100 }),
    numberField('stake', { required: true }),
    selectField('mode', ['pool', 'fixed'], { required: true }),
    numberField('odds_locked'),
    selectField('status', ['pending', 'won', 'lost', 'void'], { required: true }),
    numberField('payout'),
    dateField('placed_at'),
  ]
}

function transactionFields(usersId: string, betsId: string): Record<string, unknown>[] {
  return [
    relationField('user', usersId, { required: true, cascadeDelete: true }),
    selectField('type', ['starting_grant', 'bet_placed', 'bet_payout', 'bet_refund', 'daily_topup', 'admin_adjust', 'raffle'], { required: true }),
    numberField('amount', { required: true }),
    numberField('balance_after'),
    relationField('ref_bet', betsId, { cascadeDelete: false }),
    textField('note', { max: 500 }),
  ]
}

function settingsFields(): Record<string, unknown>[] {
  return [
    textField('event_name', { max: 200 }),
    numberField('starting_balance'),
    numberField('max_bet_percent'),
    numberField('daily_topup_threshold'),
    numberField('daily_topup_target'),
    numberField('pool_house_cut_percent'),
    numberField('raffle_tickets_base'),
    numberField('raffle_tickets_decay'),
    numberField('raffle_active_participant_min_bets'),
    // NEW (auto-void — see FIFA-GAME.md §2.3):
    numberField('auto_void_hours'),
    textField('prize', { max: 500 }),
    boolField('registration_open'),
  ]
}

function raffleDrawsFields(usersId: string): Record<string, unknown>[] {
  return [
    dateField('drawn_at'),
    relationField('winner', usersId, { cascadeDelete: false }),
    jsonField('entries_snapshot'),
    textField('seed', { max: 200 }),
  ]
}

function feedEventsFields(usersId: string, matchesId: string): Record<string, unknown>[] {
  return [
    selectField('type', ['bet_placed', 'result', 'raffle', 'system'], { required: true }),
    relationField('user', usersId, { cascadeDelete: false }),
    relationField('match', matchesId, { cascadeDelete: false }),
    textField('message', { max: 500 }),
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false } as Record<string, unknown>,
  ]
}

// ─── Indexes per collection ──────────────────────────────────────────

const MATCH_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_matches_stage_kickoff ON fifa_matches (stage, kickoff_at)',
  'CREATE INDEX IF NOT EXISTS idx_fifa_matches_status ON fifa_matches (status)',
]
const MARKET_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_bet_markets_match ON fifa_bet_markets (match)',
]
const BET_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_bets_user_market ON fifa_bets (user, market)',
  'CREATE INDEX IF NOT EXISTS idx_fifa_bets_match_status ON fifa_bets (match, status)',
  'CREATE INDEX IF NOT EXISTS idx_fifa_bets_user_status ON fifa_bets (user, status)',
]
const TRANSACTION_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_transactions_user ON fifa_transactions (user)',
  'CREATE INDEX IF NOT EXISTS idx_fifa_transactions_type ON fifa_transactions (type)',
]
const RAFFLE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_raffle_draws_drawn_at ON fifa_raffle_draws (drawn_at)',
]
const FEED_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_fifa_feed_events_type ON fifa_feed_events (type)',
]

// ─── Main ────────────────────────────────────────────────────────────

async function createCollection(name: string, fields: Record<string, unknown>[], indexes: string[]): Promise<void> {
  const existing = await collectionExists(name)
  if (existing) {
    console.log(`[skip] Collection "${name}" already exists — will add missing fields`)
    await addMissingFields(name, existing, fields)
    await addMissingIndexes(name, existing, indexes)
    return
  }
  // Resolve relation collectionId placeholders (names) to real IDs.
  const resolvedFields: Record<string, unknown>[] = []
  for (const f of fields) {
    if (f.type === 'relation' && typeof f.collectionId === 'string' && !f.collectionId.startsWith('_pbc_')) {
      const refName = f.collectionId
      const refId = await getCollectionId(refName)
      resolvedFields.push({ ...f, collectionId: refId })
    } else {
      resolvedFields.push({ ...f })
    }
  }
  const body: Record<string, unknown> = {
    name,
    type: 'base',
    fields: resolvedFields,
    // Permissive rules here — migrate-pb-rules.ts is the source of truth and
    // will tighten them. Starting permissive lets the schema land even if the
    // rules script hasn't run yet.
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
  }
  // Create without indexes first — PB validates index expressions at creation
  // time, but the `created` system column isn't available until the collection
  // exists. Add indexes via PATCH after creation.
  await api('POST', '/api/collections', body)
  if (indexes.length > 0) {
    await api('PATCH', `/api/collections/${name}`, { indexes })
  }
  console.log(`[ok] Created collection "${name}" (${fields.length} fields)`)
}

/** Adds fields present in the canonical schema but missing on the existing
 * collection (forward-compatible — lets new fields land without a drop). */
async function addMissingFields(
  name: string,
  existingCol: Record<string, unknown>,
  canonicalFields: Record<string, unknown>[],
): Promise<void> {
  const existingFields = Array.isArray(existingCol.fields) ? existingCol.fields as Array<Record<string, unknown>> : []
  const existingNames = new Set(existingFields.map((f) => f.name))
  const missing = canonicalFields.filter((f) => f.name && !existingNames.has(f.name as string))
  if (missing.length === 0) return
  // Resolve any relation placeholders to real IDs before appending.
  const resolvedMissing: Record<string, unknown>[] = []
  for (const f of missing) {
    if (f.type === 'relation' && typeof f.collectionId === 'string' && !f.collectionId.startsWith('_pbc_')) {
      const refId = await getCollectionId(f.collectionId)
      resolvedMissing.push({ ...f, collectionId: refId })
    } else {
      resolvedMissing.push({ ...f })
    }
  }
  const newFields = [...existingFields, ...resolvedMissing]
  await api('PATCH', `/api/collections/${name}`, { fields: newFields })
  console.log(`[ok] Added ${missing.length} missing field(s) to "${name}": ${missing.map((f) => f.name).join(', ')}`)
}

/** Adds indexes present in the canonical set but missing on the collection. */
async function addMissingIndexes(
  name: string,
  existingCol: Record<string, unknown>,
  canonicalIndexes: string[],
): Promise<void> {
  const existingIndexes = Array.isArray(existingCol.indexes) ? existingCol.indexes as string[] : []
  const existingSet = new Set(existingIndexes.map((s) => String(s)))
  const missing = canonicalIndexes.filter((s) => !existingSet.has(s))
  if (missing.length === 0) return
  const newIndexes = [...existingIndexes, ...missing]
  await api('PATCH', `/api/collections/${name}`, { indexes: newIndexes })
  console.log(`[ok] Added ${missing.length} missing index(es) to "${name}"`)
}

async function extendUsers(): Promise<void> {
  const col = await api('GET', '/api/collections/users')
  const fields = Array.isArray(col.fields) ? col.fields as Array<Record<string, unknown>> : []
  const hasDisplayName = fields.some((f) => f.name === 'display_name')
  const hasBalance = fields.some((f) => f.name === 'balance')
  if (hasDisplayName && hasBalance) {
    console.log('[skip] users already has display_name + balance')
    return
  }
  const newFields = [...fields]
  if (!hasDisplayName) {
    newFields.push(textField('display_name', { max: 40 }))
    console.log('  + adding display_name')
  }
  if (!hasBalance) {
    newFields.push(numberField('balance'))
    console.log('  + adding balance')
  }
  await api('PATCH', '/api/collections/users', { fields: newFields })
  console.log('[ok] Extended users with display_name + balance')
}

async function addUsersDisplayNameIndex(): Promise<void> {
  const col = await api('GET', '/api/collections/users')
  const existingIndexes = Array.isArray(col.indexes) ? col.indexes : []
  const hasIndex = existingIndexes.some((s: string) => String(s).includes('idx_users_display_name'))
  if (hasIndex) {
    console.log('[skip] users.display_name unique index already present')
    return
  }
  const indexes = [
    ...existingIndexes,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name ON users (display_name) WHERE display_name != ""',
  ]
  await api('PATCH', '/api/collections/users', { indexes })
  console.log('[ok] Added unique index on users.display_name')
}

async function main(): Promise<void> {
  console.log(`\nFIFA WC Predict '26 — schema migration`)
  console.log(`PocketBase: ${PB_URL}\n`)

  // 1. Extend users first (relations from other collections point at it).
  await extendUsers()
  await addUsersDisplayNameIndex()

  const usersId = await getCollectionId('users')

  // 2. Create/patch collections in dependency order. Relation fields inside
  //    each schema refer to collections by name; createCollection resolves
  //    them to IDs at create time, so referenced collections must already exist.
  await createCollection('fifa_matches', matchFields(usersId), MATCH_INDEXES)
  const matchesId = await getCollectionId('fifa_matches')
  await createCollection('fifa_bet_markets', marketFields(matchesId), MARKET_INDEXES)
  const marketsId = await getCollectionId('fifa_bet_markets')
  await createCollection('fifa_bets', betFields(usersId, matchesId, marketsId), BET_INDEXES)
  const betsId = await getCollectionId('fifa_bets')
  await createCollection('fifa_transactions', transactionFields(usersId, betsId), TRANSACTION_INDEXES)
  await createCollection('fifa_settings', settingsFields(), [])
  await createCollection('fifa_raffle_draws', raffleDrawsFields(usersId), RAFFLE_INDEXES)
  await createCollection('fifa_feed_events', feedEventsFields(usersId, matchesId), FEED_INDEXES)

  console.log('\nSchema migration complete.')
  console.log('Next: run `bun run migrate:pb-rules` to tighten API rules,')
  console.log('      then `bun run migrate:indexes` for additional indexes,')
  console.log('      then `bun run migrate:game-backfill` to seed settings + grants.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})