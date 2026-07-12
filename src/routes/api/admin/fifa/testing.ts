import { createFileRoute } from "@tanstack/react-router";
import type PocketBase from "pocketbase";
import { createPB } from "@/lib/pb.server"
import { escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { findLiveMatch, getLiveScores, getScheduledFixtures } from "@/lib/fifa-live";
import { teamPairKey } from "@/lib/fifa-team-names";
import { getField } from "@/lib/safe-get";
import { z } from "zod";

// Admin testing console actions (FIFA-GAME.md §2.6). All admin-only + same-origin.
// Balance-adjust and reset proxy to PB custom routes in pb_hooks/fifa.pb.js.
export const Route = createFileRoute("/api/admin/fifa/testing")({
  server: {
    handlers: {
      // ─── Create a one-click test match with all standard markets ───────
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);

          const body = (await request.json().catch(() => ({}))) as { action?: string };
          const action = body.action || '';

          if (action === 'create-test-match') {
            return await createTestMatch(pb);
          }
          if (action === 'import-fixtures') {
            return await importFixtures(pb);
          }
          if (action === 'adjust-balance') {
            return await adjustBalanceProxy(body, request, pb);
          }
          if (action === 'reset') {
            return await resetProxy(body, request, pb);
          }
          return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        } catch (error) {
          return handleError(error, "admin-fifa-testing");
        }
      },
    },
  },
})

// Default markets for imported matches (4 only — FIFA-AUTOMATION.md PR1).
const IMPORT_MARKET_TEMPLATES = [
  { market_type: 'match_winner', mode: 'pool' as const, options: ['home', 'away'] },
  { market_type: 'total_goals_ou', mode: 'pool' as const, line: 2.5, options: ['over', 'under'] },
  { market_type: 'correct_score', mode: 'pool' as const, options: ['1-0', '2-1', '1-1', '0-0', '2-0', '0-1', '1-2', '0-2', '3-0', '0-3', '2-2'] },
  { market_type: 'clean_sheet', mode: 'pool' as const, options: ['home', 'away'] },
]

// ─── Create test match ──────────────────────────────────────────────
// Creates a match with kickoff +1h and 4 default markets so the admin can
// immediately bet from their own account and settle.
async function createTestMatch(pb: PocketBase): Promise<Response> {
  const now = new Date()
  const kickoff = new Date(now.getTime() + 60 * 60 * 1000).toISOString() // +1h
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const match = await pb.collection("fifa_matches").create({
    team_home: `Test Home (${ts})`,
    team_away: `Test Away (${ts})`,
    stage: 'qf',
    kickoff_at: kickoff,
    betting_locks_at: kickoff,
    status: 'upcoming',
  })
  const matchId = (match as Record<string, unknown>).id as string

  const markets = IMPORT_MARKET_TEMPLATES
  const created = []
  for (const m of markets) {
    const rec = await pb.collection("fifa_bet_markets").create({
      match: matchId,
      market_type: m.market_type,
      mode: m.mode,
      line: m.line ?? 0,
      options: m.options,
      is_open: true,
      pool_total: 0,
      pool_by_option: {},
    })
    created.push((rec as Record<string, unknown>).id)
  }
  return Response.json({ success: true, matchId, marketsCreated: created.length })
}

// ─── Import WC fixtures ─────────────────────────────────────────────
// Upserts knockout fixtures (matched by normalized team pair), stores ESPN
// ids when available, and ensures exactly 4 default markets per match.
// Re-import is idempotent — no duplicate matches or markets.
async function importFixtures(pb: PocketBase): Promise<Response> {
  const { matches, configured } = await getScheduledFixtures()
  if (!configured) {
    return Response.json({ error: 'No live-scores source available — cannot import' }, { status: 400 });
  }

  // Fetch ESPN scoreboard for external_ids.espn mapping.
  let espnMatches: Awaited<ReturnType<typeof getLiveScores>>['matches'] = []
  try {
    const live = await getLiveScores()
    if (live.source === 'espn') {
      espnMatches = live.matches
    }
  } catch { /* import still works without ESPN ids */ }

  const stageMap: Record<string, string> = {
    'Round of 32': 'r32',
    'Round of 16': 'r16',
    'Quarter-final': 'qf',
    'Semi-final': 'sf',
    'Match for third place': 'third_place',
    'Final': 'final',
    'QUARTER_FINALS': 'qf',
    'SEMI_FINALS': 'sf',
    'THIRD_PLACE': 'third_place',
    'LAST_16': 'r16',
    'ROUND_OF_32': 'r32',
  }

  const existing = await pb.collection("fifa_matches").getFullList({
    fields: 'id,team_home,team_away,external_ids',
  })
  const existingByKey = new Map<string, { id: string; external_ids: Record<string, string> }>()
  for (const m of existing) {
    const home = String(getField(m, 'team_home', ''))
    const away = String(getField(m, 'team_away', ''))
    const key = teamPairKey(home, away)
    const ext = getField(m, 'external_ids', {}) as Record<string, string>
    existingByKey.set(key, { id: String(getField(m, 'id', '')), external_ids: ext || {} })
  }

  let imported = 0
  let updated = 0
  let skipped = 0
  let marketsCreated = 0

  for (const fm of matches) {
    const stage = stageMap[fm.stage || ''] || ''
    if (!stage) { skipped++; continue }
    if (!fm.homeTeam || !fm.awayTeam) { skipped++; continue }
    if (/^[WL]\d+$/.test(fm.homeTeam) || /^[WL]\d+$/.test(fm.awayTeam)) {
      skipped++; continue
    }

    const kickoff = fm.kickoffAt || new Date().toISOString()
    const espnLive = findLiveMatch(espnMatches, fm.homeTeam, fm.awayTeam)
    const espnId = espnLive?.id || ''
    const key = teamPairKey(fm.homeTeam, fm.awayTeam)
    const existingMatch = existingByKey.get(key)

    let matchId: string
    if (existingMatch) {
      matchId = existingMatch.id
      const patch: Record<string, unknown> = {
        kickoff_at: kickoff,
        betting_locks_at: kickoff,
      }
      if (espnId) {
        patch.external_ids = { ...existingMatch.external_ids, espn: espnId }
      }
      await pb.collection("fifa_matches").update(matchId, patch)
      updated++
    } else {
      const createData: Record<string, unknown> = {
        team_home: fm.homeTeam,
        team_away: fm.awayTeam,
        stage,
        kickoff_at: kickoff,
        betting_locks_at: kickoff,
        status: 'upcoming',
      }
      if (espnId) {
        createData.external_ids = { espn: espnId }
      }
      const created = await pb.collection("fifa_matches").create(createData)
      matchId = String(getField(created, 'id', ''))
      existingByKey.set(key, { id: matchId, external_ids: espnId ? { espn: espnId } : {} })
      imported++
    }

    // Ensure 4 default markets exist (idempotent).
    const existingMarkets = await pb.collection("fifa_bet_markets").getFullList({
      filter: `match = ${escapeFilterValue(matchId)}`,
      fields: 'id,market_type',
    })
    const existingTypes = new Set(existingMarkets.map((m) => String(getField(m, 'market_type', ''))))
    for (const tmpl of IMPORT_MARKET_TEMPLATES) {
      if (existingTypes.has(tmpl.market_type)) continue
      await pb.collection("fifa_bet_markets").create({
        match: matchId,
        market_type: tmpl.market_type,
        mode: tmpl.mode,
        line: tmpl.line ?? 0,
        options: tmpl.options,
        is_open: true,
        pool_total: 0,
        pool_by_option: {},
      })
      marketsCreated++
    }
  }

  return Response.json({ success: true, imported, updated, skipped, marketsCreated })
}

// ─── Adjust balance — proxy to PB /api/fifa/admin-adjust ─────────────
async function adjustBalanceProxy(
  body: Record<string, unknown>,
  request: Request,
  pb: PocketBase,
): Promise<Response> {
  const parsed = z.object({
    userId: z.string().min(1),
    amount: z.number().int(),
    note: z.string().max(200).optional(),
  }).parse(body)
  const token = pb.authStore.token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['cookie'] = request.headers.get('cookie') || '';
  }
  const res = await fetch(`${process.env.POCKETBASE_URL}/api/fifa/admin-adjust`, {
    method: 'POST',
    headers,
    body: JSON.stringify(parsed),
  })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}

// ─── Reset game — proxy to PB /api/fifa/admin-reset ──────────────────
async function resetProxy(
  body: Record<string, unknown>,
  request: Request,
  pb: PocketBase,
): Promise<Response> {
  const token = pb.authStore.token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['cookie'] = request.headers.get('cookie') || '';
  }
  const res = await fetch(`${process.env.POCKETBASE_URL}/api/fifa/admin-reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirm: String(body.confirm || '') }),
  })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}