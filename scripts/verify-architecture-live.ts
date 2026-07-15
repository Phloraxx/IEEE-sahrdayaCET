/**
 * Live architectural verification against staging PB + preview app.
 * Run: bun scripts/verify-architecture-live.ts
 *
 * Reads credentials from env vars (set in shell or .env.local).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const PB = (process.env.POCKETBASE_URL || 'https://db.phloraxx.us.to').replace(/\/+$/, '')
const APP = process.env.PUBLIC_APP_URL || 'https://preview-ieee-website-rcffnz-mu1lfg.ieeesahrdaya.com'
const PB_AUTH_COOKIE = 'pb_auth'

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const path = join(process.cwd(), '.env.local')
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim()
    }
  } catch { /* optional */ }
  return env
}

const envLocal = loadEnvLocal()
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || envLocal.ADMIN_TOKEN || ''
const SU_EMAIL = process.env.PB_ADMIN_EMAIL || 'souravpbijoy@gmail.com'
const SU_PASSWORD = process.env.PB_ADMIN_PASSWORD || ''
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || envLocal.PAYMENT_WEBHOOK_SECRET || ''
const PB_AUTH_JSON = process.env.PB_AUTH_JSON || ''

interface Result {
  id: string
  claim: string
  status: 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE' | 'CODE_ONLY'
  evidence: string
}

const results: Result[] = []
const cleanup: Array<() => Promise<void>> = []

function log(r: Result) {
  results.push(r)
  const icon = { CONFIRMED: '✓', REFUTED: '✗', INCONCLUSIVE: '?', CODE_ONLY: '~' }[r.status]
  console.log(`${icon} [${r.id}] ${r.claim}`)
  console.log(`    ${r.evidence}\n`)
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  retries = 4,
) {
  const hasBody = body !== undefined && body !== null
  for (let i = 0; i < retries; i++) {
    try {
      const init: RequestInit = {
        method,
        headers: { ...headers },
      }
      if (hasBody) {
        init.headers = { 'Content-Type': 'application/json', ...headers }
        init.body = JSON.stringify(body)
      }
      const res = await fetch(base + path, init)
      const text = await res.text()
      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        data = text.slice(0, 400)
      }
      return { status: res.status, data: data as Record<string, unknown> }
    } catch (e) {
      if (i === retries - 1) throw e
      await sleep(1200 * (i + 1))
    }
  }
  throw new Error('unreachable')
}

async function main() {
  console.log(`\n=== Architecture verification ===`)
  console.log(`PB:  ${PB}`)
  console.log(`App: ${APP}\n`)

  // ── Auth ──────────────────────────────────────────────────────────
  let adminToken = ADMIN_TOKEN
  if (!adminToken && PB_AUTH_JSON) {
    try {
      adminToken = JSON.parse(PB_AUTH_JSON).token as string
    } catch { /* */ }
  }
  if (!adminToken) {
    console.error('Missing ADMIN_TOKEN or PB_AUTH_JSON')
    process.exit(1)
  }
  const adminAuth = { Authorization: `Bearer ${adminToken}` }

  let suToken = ''
  if (SU_PASSWORD) {
    const su = await fetchJson(PB, 'POST', '/api/collections/_superusers/auth-with-password', {
      identity: SU_EMAIL,
      password: SU_PASSWORD,
    })
    suToken = (su.data?.token as string) || ''
    log({
      id: '00',
      claim: 'PocketBase reachable',
      status: su.status === 200 ? 'CONFIRMED' : 'INCONCLUSIVE',
      evidence: `superuser auth HTTP ${su.status}`,
    })
  } else {
    const health = await fetchJson(PB, 'GET', '/api/health')
    log({
      id: '00',
      claim: 'PocketBase reachable',
      status: health.status === 200 ? 'CONFIRMED' : 'INCONCLUSIVE',
      evidence: `health HTTP ${health.status}`,
    })
  }
  const suAuth = suToken ? { Authorization: `Bearer ${suToken}` } : adminAuth

  // ── 1. events.pb.js e.next() blocks all updates? ─────────────────
  const evList = await fetchJson(PB, 'GET', '/api/collections/events/records?perPage=1&fields=id,title,registeredCount', null, adminAuth)
  const eventId = (evList.data?.items as Array<{ id: string; title: string; registeredCount: number }>)?.[0]?.id
  const titleBefore = (evList.data?.items as Array<{ title: string }>)?.[0]?.title
  const rcBefore = (evList.data?.items as Array<{ registeredCount: number }>)?.[0]?.registeredCount ?? 0

  if (eventId && titleBefore !== undefined) {
    const probe = ` [v${Date.now()}]`
    const titleUpd = await fetchJson(PB, 'PATCH', `/api/collections/events/records/${eventId}`, { title: titleBefore + probe }, adminAuth)
    if (titleUpd.status === 200) {
      await fetchJson(PB, 'PATCH', `/api/collections/events/records/${eventId}`, { title: titleBefore }, adminAuth)
    }
    log({
      id: '01',
      claim: 'events.pb.js missing e.next() blocks ALL event updates',
      status: titleUpd.status === 200 ? 'REFUTED' : 'CONFIRMED',
      evidence: `admin title PATCH → HTTP ${titleUpd.status}`,
    })

    const counterUpd = await fetchJson(PB, 'PATCH', `/api/collections/events/records/${eventId}`, { registeredCount: rcBefore + 999 }, adminAuth)
    log({
      id: '02',
      claim: 'Bearer auth not visible in events hook (admin treated as chair)',
      status: counterUpd.status === 403 ? 'CONFIRMED' : 'INCONCLUSIVE',
      evidence: `admin registeredCount PATCH → HTTP ${counterUpd.status} (expected 403 if hook sees empty role)`,
    })
  }

  // ── 2. blogs.pb.js / createRule ───────────────────────────────────
  const blogCreate = await fetchJson(PB, 'POST', '/api/collections/blogs/records', {
    title: `Verify ${Date.now()}`,
    content: 'test',
    published: false,
  }, adminAuth)
  log({
    id: '03',
    claim: 'blogs.pb.js missing e.next() blocks blog create',
    status: blogCreate.status === 403 || blogCreate.status === 400 ? 'REFUTED' : blogCreate.status === 201 || blogCreate.status === 200 ? 'INCONCLUSIVE' : 'INCONCLUSIVE',
    evidence: `admin blog POST → HTTP ${blogCreate.status} "${blogCreate.data?.message}" (createRule requires content role, not admin)`,
  })

  // ── 3. Public ticket lookup (unauth) ──────────────────────────────
  const anonList = await fetchJson(PB, 'GET', '/api/collections/registrations/records?perPage=1')
  log({
    id: '04',
    claim: 'Unauthenticated registrations list returns empty (blocks public ticket BFF)',
    status: anonList.status === 200 && (anonList.data?.totalItems as number) === 0 ? 'CONFIRMED' : 'INCONCLUSIVE',
    evidence: `anon list → HTTP ${anonList.status}, totalItems=${anonList.data?.totalItems}`,
  })

  // ── 4. Registration create (dao bug) ────────────────────────────
  const soc = await fetchJson(PB, 'GET', '/api/collections/societies/records?perPage=1&fields=id', null, suAuth)
  const societyId = (soc.data?.items as Array<{ id: string }>)?.[0]?.id
  let testEventId = ''
  let testRegId = ''
  let regCreate: { status: number; data: Record<string, unknown> } | undefined

  if (societyId) {
    const newEv = await fetchJson(PB, 'POST', '/api/collections/events/records', {
      title: `ArchVerify ${Date.now()}`,
      status: 'published',
      registrationOpen: true,
      price: 500,
      maxCapacity: 50,
      society: societyId,
      date: '2026-12-20',
      venue: 'Test Hall',
      registrationDeadline: '2026-12-31',
    }, adminAuth)
    testEventId = (newEv.data?.id as string) || ''
    if (testEventId) {
      cleanup.push(() => fetchJson(PB, 'DELETE', `/api/collections/events/records/${testEventId}`, null, suAuth).then(() => {}))
    }

    regCreate = await fetchJson(PB, 'POST', '/api/collections/registrations/records', {
      user: 'epi2d6fhu2v7j20',
      event: testEventId,
      userName: 'Verify',
      userEmail: 'verify@sahrdaya.ac.in',
      userPhone: '9999999999',
      formResponses: { name: 'Verify' },
    }, adminAuth)

    log({
      id: '05',
      claim: 'Registration create is broken on staging',
      status: regCreate.status === 200 || regCreate.status === 201 ? 'REFUTED' : 'CONFIRMED',
      evidence: `POST registration → HTTP ${regCreate.status} "${regCreate.data?.message}" | likely $app.dao() removed in PB 0.23+ (registrations.pb.js:249)`,
    })

    // ── 5. Webhook ticketId mint (simulate via superuser seed) ─────
    if (testEventId && suToken && WEBHOOK_SECRET) {
      // Seed a pending paid registration directly (bypass broken after-create)
      const seed = await fetchJson(PB, 'POST', '/api/collections/registrations/records', {
        user: 'epi2d6fhu2v7j20',
        event: testEventId,
        userName: 'WH Test',
        userEmail: 'wh@sahrdaya.ac.in',
        userPhone: '1',
        paymentTicketId: `pay-${Date.now()}`,
        ticketId: '',
        paymentStatus: 'pending',
        registrationStatus: 'pending',
        amount: 500,
        formResponses: {},
      }, suAuth)

      const seededId = (seed.data?.id as string) || ''
      const payId = (seed.data?.paymentTicketId as string) || `pay-${Date.now()}`

      if (seed.status === 200 || seed.status === 201) {
        testRegId = seededId
        cleanup.push(() => fetchJson(PB, 'DELETE', `/api/collections/registrations/records/${testRegId}`, null, suAuth).then(() => {}))

        const wh = await fetchJson(PB, 'POST', '/api/webhooks/payment-confirm', {
          ticketId: payId,
          status: 'success',
          transactionId: `verify-${Date.now()}`,
          amount: 500,
        }, { 'x-webhook-secret': WEBHOOK_SECRET })

        const after = await fetchJson(PB, 'GET', `/api/collections/registrations/records/${seededId}?fields=ticketId,paymentTicketId,paymentStatus,registrationStatus`, null, suAuth)
        const ticketAfter = (after.data?.ticketId as string) || ''

        log({
          id: '06',
          claim: 'Webhook payment-confirm mints ticketId (onRecordUpdateRequest on $app.save)',
          status: wh.status === 200 && !ticketAfter ? 'CONFIRMED' : wh.status !== 200 ? 'INCONCLUSIVE' : 'REFUTED',
          evidence: `webhook HTTP ${wh.status}; after confirm ticketId="${ticketAfter || '(EMPTY)'}" regStatus=${after.data?.registrationStatus}`,
        })

        // public ticket lookup
        const pubPay = await fetch(APP + '/api/ticket/' + encodeURIComponent(payId))
        const pubPayData = await pubPay.json()
        log({
          id: '07',
          claim: 'Public /api/ticket/:id works without login (paymentTicketId)',
          status: pubPayData.found === true ? 'REFUTED' : 'CONFIRMED',
          evidence: `GET /api/ticket/paymentTicketId → found=${pubPayData.found}`,
        })
        if (ticketAfter) {
          const pubTkt = await fetch(APP + '/api/ticket/' + encodeURIComponent(ticketAfter))
          const pubTktData = await pubTkt.json()
          log({
            id: '08',
            claim: 'Public /api/ticket/:id works without login (ticketId)',
            status: pubTktData.found === true ? 'REFUTED' : 'CONFIRMED',
            evidence: `GET /api/ticket/ticketId → found=${pubTktData.found}`,
          })
        }
      } else {
        log({
          id: '06',
          claim: 'Webhook ticketId mint',
          status: 'INCONCLUSIVE',
          evidence: `could not seed registration for webhook test: HTTP ${seed.status}`,
        })
      }
    }
  }

  // ── 6. Existing paid regs missing ticketId ────────────────────────
  const paidRegs = await fetchJson(PB, 'GET', '/api/collections/registrations/records?perPage=50&filter=(paymentStatus="paid")&fields=id,ticketId', null, suAuth)
  const paidItems = (paidRegs.data?.items as Array<{ ticketId?: string }>) || []
  const missingTicket = paidItems.filter((r) => !r.ticketId).length
  log({
    id: '09',
    claim: 'Production data has paid registrations with empty ticketId',
    status: paidItems.length === 0 ? 'INCONCLUSIVE' : missingTicket > 0 ? 'CONFIRMED' : 'REFUTED',
    evidence: `paid regs: ${paidItems.length}, missing ticketId: ${missingTicket}`,
  })

  // ── 7. FIFA stranded pending bets ─────────────────────────────────
  const settled = await fetchJson(PB, 'GET', '/api/collections/fifa_matches/records?perPage=20&filter=settled=true&fields=id', null, suAuth)
  let stranded = 0
  for (const m of (settled.data?.items as Array<{ id: string }>) || []) {
    const bets = await fetchJson(PB, 'GET', `/api/collections/fifa_bets/records?perPage=1&filter=match="${m.id}"&&status="pending"`, null, suAuth)
    if ((bets.data?.totalItems as number) > 0) stranded++
  }
  log({
    id: '10',
    claim: 'FIFA settled matches have stranded pending bets in live data',
    status: stranded > 0 ? 'CONFIRMED' : (settled.data?.totalItems as number) > 0 ? 'REFUTED' : 'INCONCLUSIVE',
    evidence: `settled matches checked: ${(settled.data?.items as unknown[])?.length || 0}, with pending bets: ${stranded}`,
  })

  // ── 8. Admin balance PATCH bypass ─────────────────────────────────
  const userBefore = await fetchJson(PB, 'GET', '/api/collections/users/records/epi2d6fhu2v7j20?fields=balance', null, adminAuth)
  const balBefore = (userBefore.data?.balance as number) ?? 0
  const balPatch = await fetchJson(PB, 'PATCH', '/api/collections/users/records/epi2d6fhu2v7j20', { balance: balBefore + 1 }, adminAuth)
  const userAfter = await fetchJson(PB, 'GET', '/api/collections/users/records/epi2d6fhu2v7j20?fields=balance', null, adminAuth)
  const balAfter = (userAfter.data?.balance as number) ?? balBefore
  if (balPatch.status === 200 && balAfter !== balBefore) {
    await fetchJson(PB, 'PATCH', '/api/collections/users/records/epi2d6fhu2v7j20', { balance: balBefore }, adminAuth)
  }
  const balanceBlocked = balPatch.status === 403 || balAfter === balBefore
  log({
    id: '11',
    claim: 'Admin can PATCH users.balance directly (ledger bypass)',
    status: balanceBlocked ? 'REFUTED' : balPatch.status === 200 && balAfter === balBefore + 1 ? 'CONFIRMED' : 'INCONCLUSIVE',
    evidence: balanceBlocked
      ? `balance unchanged (${balBefore}) — updateRule blocks balance:changed (HTTP ${balPatch.status})`
      : `PATCH balance ${balBefore}→${balAfter} HTTP ${balPatch.status}`,
  })

  // ── 9. College email not enforced ─────────────────────────────────
  log({
    id: '12',
    claim: 'FIFA college-email-only enforced server-side',
    status: 'CODE_ONLY',
    evidence: 'No @sahrdaya.ac.in check in auth callback or fifa.pb.js; UI copy only — needs OAuth test with external Google account',
  })

  // ── 10. Capacity counts non-cancelled ─────────────────────────────
  log({
    id: '13',
    claim: 'Capacity hook counts only confirmed (excludes pending paid regs)',
    status: 'CODE_ONLY',
    evidence: 'post-fix code counts registrationStatus != cancelled; live overflow test needs event at maxCapacity',
  })

  // ── 11. $app.dao() migration ──────────────────────────────────────
  const regCreateOk = !!regCreate && (regCreate.status === 200 || regCreate.status === 201)
  log({
    id: '14',
    claim: 'Registration create broken by $app.dao() (removed PB 0.23+)',
    status: regCreateOk ? 'REFUTED' : 'CONFIRMED',
    evidence: regCreateOk
      ? 'create returned HTTP 200/201 — $app.findRecordById/saveNoValidate fix deployed'
      : 'create still fails — deploy pb_hooks/registrations.pb.js without $app.dao()',
  })

  // ── 12. Rate limit bypass direct PB ───────────────────────────────
  const betSpam: number[] = []
  for (let i = 0; i < 3; i++) {
    const m = await fetchJson(PB, 'GET', '/api/collections/fifa_bet_markets/records?perPage=1&fields=id,match', null, adminAuth)
    const market = (m.data?.items as Array<{ id: string; match: string }>)?.[0]
    if (!market) break
    const r = await fetchJson(PB, 'POST', '/api/collections/fifa_bets/records', {
      user: 'epi2d6fhu2v7j20',
      match: market.match,
      market: market.id,
      selection: 'home',
      stake: 1,
    }, adminAuth)
    betSpam.push(r.status)
  }
  log({
    id: '15',
    claim: 'Direct PB fifa_bets POST bypasses TanStack rate limit',
    status: betSpam.some((s) => s === 200 || s === 201) ? 'CONFIRMED' : 'INCONCLUSIVE',
    evidence: `3 rapid direct PB bet POST statuses: ${betSpam.join(', ')} (no 429 from PB itself)`,
  })

  // ── Cleanup ───────────────────────────────────────────────────────
  for (const fn of cleanup.reverse()) {
    try { await fn() } catch { /* */ }
  }

  // ── Summary ─────────────────────────────────────────────────────
  const counts = { CONFIRMED: 0, REFUTED: 0, INCONCLUSIVE: 0, CODE_ONLY: 0 }
  for (const r of results) counts[r.status]++
  console.log('=== SUMMARY ===')
  console.log(`CONFIRMED: ${counts.CONFIRMED} | REFUTED: ${counts.REFUTED} | INCONCLUSIVE: ${counts.INCONCLUSIVE} | CODE_ONLY: ${counts.CODE_ONLY}`)
}

main().catch((e) => {
  console.error('Verification failed:', e)
  process.exit(1)
})