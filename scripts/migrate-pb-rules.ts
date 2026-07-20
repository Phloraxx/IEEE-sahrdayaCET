const PB_URL = process.env.POCKETBASE_URL?.replace(/\/+$/, '')
let TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN || ''
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || ''
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || ''

if (!PB_URL) {
  console.error('Missing POCKETBASE_URL environment variable')
  process.exit(1)
}

async function ensureSuperuserToken(): Promise<void> {
  if (TOKEN) return
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error('Set POCKETBASE_SUPERUSER_TOKEN or PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD')
    process.exit(1)
  }
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok || typeof data.token !== 'string') {
    console.error('Superuser auth failed:', data.message || res.status)
    process.exit(1)
  }
  TOKEN = data.token
  console.log('[auth] Superuser login OK')
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
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PB API error: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`)
  }
  const parsed: unknown = await res.json()
  if (!isRecord(parsed)) {
    throw new Error(`Unexpected PB response: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  if (
    (typeof parsed.status === 'number' && parsed.status >= 400) ||
    (typeof parsed.code === 'number' && parsed.code >= 400)
  ) {
    const msg = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed)
    throw new Error(`PB API error: ${msg}`)
  }
  return parsed
}

interface CollectionRuleSet {
  listRule?: string | null
  viewRule?: string | null
  createRule?: string | null
  updateRule?: string | null
  deleteRule?: string | null
}

const rules: Record<string, CollectionRuleSet> = {
  events: {
    // M2: soft-deleted events must not leak to the public listing/detail.
    listRule: `(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || @request.auth.role = "chair"`,
    viewRule: `(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || @request.auth.role = "chair"`,
    // H3: a chair may only create events under a society they chair.
    createRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)`,
    // #3: chairs may edit title/date/venue but cannot rewrite counters or un-delete.
    // Soft-delete (isDeleted: false→true) is allowed via the extra clause;
    // un-delete (true→false) remains admin-only — the hook also enforces this.
    updateRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && (@request.body.isDeleted:changed = false || @request.body.isDeleted = true))`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  blogs: {
    // Public readers only see published posts. Admin/content editors can manage drafts.
    listRule: `published = true || @request.auth.role = "admin" || @request.auth.role = "content"`,
    viewRule: `published = true || @request.auth.role = "admin" || @request.auth.role = "content"`,
    // Both administrative roles exposed by the blog UI may create posts. Content
    // editors must remain the author of records they create and cannot rewrite authorship.
    createRule: `@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id)`,
    updateRule: `@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation:changed = false)`,
    deleteRule: `@request.auth.role = "admin" || @request.auth.role = "content"`,
  },
  societies: {
    listRule: `isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id`,
    viewRule: `isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id`,
    createRule: `@request.auth.role = "admin"`,
    // H4: chairs may edit their own society but must not rewrite the `chairs`
    // relation (no self-/peer-escalation). Admins satisfy the first branch;
    // the admin-role service client is an admin and is allowed through it.
    updateRule: `@request.auth.role = "admin" || (chairs.id ?= @request.auth.id && @request.body.chairs:changed = false)`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  coupons: {
    // Admins and chairs can access coupons. The deep relation chain
    // (event.society.chairs.id ?= @request.auth.id) causes PocketBase to
    // return 400 when resolving the 4-hop join. Per-event scoping is already
    // enforced at the app layer via requireEventScope before any PB call.
    listRule: `@request.auth.role = "admin" || @request.auth.role = "chair"`,
    viewRule: `@request.auth.role = "admin" || @request.auth.role = "chair"`,
    createRule: `@request.auth.role = "admin" || @request.auth.role = "chair"`,
    updateRule: `@request.auth.role = "admin" || @request.auth.role = "chair"`,
    deleteRule: `@request.auth.role = "admin" || @request.auth.role = "chair"`,
  },
  registrations: {
    listRule: `user = @request.auth.id || @request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
    viewRule: `user = @request.auth.id || @request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
    // C2: createRule is a backstop — the onRecordCreateRequest hook
    // (pb_hooks/registrations.pb.js) enforces all business rules. This rule
    // prevents direct PB REST POSTs from setting paymentStatus or checkedIn.
    createRule: `user = @request.auth.id && @request.body.paymentStatus:changed = false && @request.body.checkedIn:changed = false`,
    updateRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id && @request.body.paymentStatus:changed = false && @request.body.amount:changed = false && @request.body.registrationStatus != "confirmed")`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  execom: {
    // Public committee directory (rendered on unauthenticated society pages).
    // NOTE (M4): the `email`/`phone` fields are world-readable via the raw PB
    // API because PocketBase has no field-level rules. The app's public routes
    // do not return them, but direct API reads expose them. Locking the
    // collection would break public society pages; removing the fields is a
    // product decision. Left public intentionally — revisit if PII matters.
    listRule: ``,
    viewRule: ``,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  users: {
    // C1: previously every rule was "" (public) on the live instance, allowing
    // anonymous enumeration, account creation, and role-escalation to admin.
    // H-1: chairs had unscoped access — removed. Self + admin may read;
    // only OAuth2 sign-up may create; a user may edit their own profile but
    // NEVER their own role; deletes are superuser-only.
    listRule: `id = @request.auth.id || @request.auth.role = "admin"`,
    viewRule: `id = @request.auth.id || @request.auth.role = "admin"`,
    createRule: `@request.context = "oauth2"`,
    // FIFA: balance is hook-only for ALL roles (incl. admin). Economy changes
    // go through /api/fifa/admin-adjust (custom route + $app internal access).
    // display_name is set once from the Google profile (OAuth2 hook) and is
    // not self-editable — the public leaderboard shows real identities.
    // Admins may still correct it.
    updateRule: `(id = @request.auth.id && @request.body.role:changed = false && @request.body.balance:changed = false && @request.body.display_name:changed = false && @request.body.name:changed = false) || (@request.auth.role = "admin" && @request.body.balance:changed = false && @request.body.role:changed = false)`,
    deleteRule: null,
  },
  // ─── FIFA WC Predict '26 ───────────────────────────────────────────
  // Public read collections (anyone can view the game state); writes are
  // admin-only or hook-only. Direct REST writes that affect the economy
  // (bets, transactions, balance) are blocked at the rule layer and enforced
  // by pb_hooks/fifa.pb.js at the DB layer.
  fifa_matches: {
    // Public match list/detail (excluding voided matches from public list).
    listRule: ``,
    viewRule: ``,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  fifa_bet_markets: {
    // Public market detail (pool totals, odds). Admin-only writes so
    // chairs/users can't bump pool counters — those are maintained by the
    // bet hook via $app.dao (bypasses rules).
    listRule: ``,
    viewRule: ``,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  fifa_bets: {
    // Owner can read their own bets; everyone else (incl. chairs) cannot.
    listRule: `user = @request.auth.id || @request.auth.role = "admin"`,
    viewRule: `user = @request.auth.id || @request.auth.role = "admin"`,
    // createRule is a backstop — the onRecordCreateRequest hook in
    // pb_hooks/fifa.pb.js enforces all business rules (market open, deadline,
    // stake limits). This rule prevents direct REST POSTs from setting
    // status/payout/odds_locked (the hook sets those server-side).
    createRule: `user = @request.auth.id && @request.body.status:changed = false && @request.body.payout:changed = false && @request.body.odds_locked:changed = false`,
    updateRule: null,
    deleteRule: null,
  },
  fifa_transactions: {
    // Ledger is hook-only. No client create/update/delete under any
    // circumstance — every balance change goes through a PB hook or custom
    // route that writes via $app.dao.
    listRule: `user = @request.auth.id || @request.auth.role = "admin"`,
    viewRule: `user = @request.auth.id || @request.auth.role = "admin"`,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  fifa_settings: {
    listRule: ``,
    viewRule: ``,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  fifa_raffle_draws: {
    listRule: ``,
    viewRule: ``,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
  },
  fifa_feed_events: {
    listRule: ``,
    viewRule: ``,
    createRule: null,
    updateRule: null,
    deleteRule: `@request.auth.role = "admin"`,
  },
}

async function main(): Promise<void> {
  await ensureSuperuserToken()
  const collectionNames = Object.keys(rules)
  let hasError = false

  for (const name of collectionNames) {
    const ruleSet = rules[name]!
    try {
      await api('GET', `/api/collections/${name}`)
      await api('PATCH', `/api/collections/${name}`, { ...ruleSet })
      console.log(`[OK] Updated rules for "${name}"`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[FAIL] "${name}": ${msg}`)
      hasError = true
    }
  }

  if (hasError) process.exit(1)
}

main()
