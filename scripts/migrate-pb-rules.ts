
const PB_URL = process.env.POCKETBASE_URL?.replace(/\/+$/, '')
const TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN

if (!PB_URL) {
  console.error('Missing POCKETBASE_URL environment variable')
  process.exit(1)
}
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
    updateRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && @request.body.isDeleted:changed = false)`,
    deleteRule: `@request.auth.role = "admin"`,
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
    // #4: only admins and chairs of the event's society can read coupons.
    // The app validates via the PB internal route (pb_hooks/coupons.pb.js).
    listRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
    viewRule: `@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)`,
    createRule: `@request.auth.role = "admin"`,
    updateRule: `@request.auth.role = "admin"`,
    deleteRule: `@request.auth.role = "admin"`,
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
    updateRule: `(id = @request.auth.id && @request.body.role:changed = false) || @request.auth.role = "admin"`,
    deleteRule: null,
  },
}

async function main(): Promise<void> {
  const collectionNames = Object.keys(rules)
  let hasError = false

  for (const name of collectionNames) {
    const ruleSet = rules[name]!
    try {
      // Verify collection exists by reading its current config
      await api('GET', `/api/collections/${name}`)
      // PATCH with only the rule fields (PB merges partial updates)
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
