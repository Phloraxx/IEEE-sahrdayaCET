import { createFileRoute } from "@tanstack/react-router";
import type PocketBase from "pocketbase";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { getScheduledFixtures } from "@/lib/fifa-live";
import { getField } from "@/lib/safe-get";
import { z } from "zod";

// Admin testing console actions (FIFA-GAME.md §2.6). All admin-only + same-origin.
// The balance-adjust, auto-void trigger, and reset proxy to PB custom routes
// defined in pb_hooks/fifa.pb.js (admin-adjust, admin-reset). The auto-void
// trigger reuses the same cron logic via a direct call pattern — we just hit
// the matches and void them inline since PB cronAdd routes aren't callable.
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
            return await adjustBalanceProxy(request, pb);
          }
          if (action === 'trigger-auto-void') {
            return await triggerAutoVoid(pb);
          }
          if (action === 'reset') {
            return await resetProxy(request, pb);
          }
          return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        } catch (error) {
          return handleError(error, "admin-fifa-testing");
        }
      },
    },
  },
})

// ─── Create test match ──────────────────────────────────────────────
// Creates a match with kickoff +1h and all 6 standard market types
// pre-configured (pool mode, sensible default options) so the admin can
// immediately bet from their own account and settle.
async function createTestMatch(pb: PocketBase): Promise<Response> {
  const kickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString() // +1h
  const match = await pb.collection("fifa_matches").create({
    team_home: 'Test Home',
    team_away: 'Test Away',
    stage: 'qf',
    kickoff_at: kickoff,
    betting_locks_at: kickoff,
    status: 'upcoming',
  })
  const matchId = (match as Record<string, unknown>).id as string

  // Standard market templates. Pool mode, default options.
  const markets = [
    { market_type: 'match_winner', mode: 'pool' as const, options: ['home', 'away', 'draw'] },
    { market_type: 'total_goals_ou', mode: 'pool' as const, line: 2.5, options: ['over', 'under'] },
    { market_type: 'correct_score', mode: 'pool' as const, options: ['1-0', '2-1', '1-1', '0-0', '2-0', '0-1', '1-2', '0-2', '3-0', '0-3', '2-2'] },
    { market_type: 'any_scorer', mode: 'pool' as const, options: ['Player A', 'Player B', 'Player C', 'No scorer'] },
    { market_type: 'cards_ou', mode: 'pool' as const, line: 3.5, options: ['over', 'under'] },
    { market_type: 'clean_sheet', mode: 'pool' as const, options: ['home', 'away'] },
  ]
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

// ─── Import WC fixtures from football-data.org ──────────────────────
// Creates matches for all SCHEDULED WC fixtures that don't already exist
// (matched by team names, case-insensitive). Only knockout stages are
// imported — group-stage matches are skipped (the game is knockout-only).
// Works with both openfootball stage names ("Quarter-final", "Final") and
// football-data.org stage names ("QUARTER_FINALS", "FINAL") — the
// getScheduledFixtures() helper may return either depending on which source
// responded.
async function importFixtures(pb: PocketBase): Promise<Response> {
  const { matches, configured } = await getScheduledFixtures()
  if (!configured) {
    return Response.json({ error: 'No live-scores source available — cannot import' }, { status: 400 });
  }
  // Map stage names from both openfootball and football-data.org to our enum.
  const stageMap: Record<string, string> = {
    // openfootball
    'Round of 32': 'r32',
    'Round of 16': 'r16',
    'Quarter-final': 'qf',
    'Semi-final': 'sf',
    'Match for third place': 'third_place',
    'Final': 'final',
    // football-data.org
    'QUARTER_FINALS': 'qf',
    'SEMI_FINALS': 'sf',
    'THIRD_PLACE': 'third_place',
    'LAST_16': 'r16',
    'ROUND_OF_32': 'r32',
  }
  // Fetch existing matches to dedupe by team names.
  const existing = await pb.collection("fifa_matches").getFullList({
    fields: 'id,team_home,team_away',
  })
  const existingKeys = new Set(existing.map((m) => {
    const h = String(getField(m, 'team_home', '')).toLowerCase()
    const a = String(getField(m, 'team_away', '')).toLowerCase()
    return `${h}|${a}`
  }))

  let imported = 0
  let skipped = 0
  for (const fm of matches) {
    const stage = stageMap[fm.stage || ''] || ''
    if (!stage) { skipped++; continue } // skip group stage + unknown
    if (!fm.homeTeam || !fm.awayTeam) { skipped++; continue }
    // openfootball uses placeholder team names like "W95"/"L101" for
    // knockout matches where the team isn't decided yet — skip those.
    if (/^[WL]\d+$/.test(fm.homeTeam) || /^[WL]\d+$/.test(fm.awayTeam)) {
      skipped++; continue
    }
    const key = `${fm.homeTeam.toLowerCase()}|${fm.awayTeam.toLowerCase()}`
    if (existingKeys.has(key)) { skipped++; continue }
    await pb.collection("fifa_matches").create({
      team_home: fm.homeTeam,
      team_away: fm.awayTeam,
      stage,
      kickoff_at: fm.kickoffAt || new Date().toISOString(),
      betting_locks_at: fm.kickoffAt || new Date().toISOString(),
      status: 'upcoming',
    })
    imported++
  }
  return Response.json({ success: true, imported, skipped })
}

// ─── Adjust balance — proxy to PB /api/fifa/admin-adjust ─────────────
async function adjustBalanceProxy(request: Request, pb: PocketBase): Promise<Response> {
  const body = await request.json() as { userId?: string; amount?: number; note?: string }
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

// ─── Trigger auto-void sweep ────────────────────────────────────────
// Reuses the same logic as the cron — we inline it here since the cron
// function isn't directly callable from a route. Reads auto_void_hours from
// settings and voids drifted matches.
async function triggerAutoVoid(pb: PocketBase): Promise<Response> {
  // Read settings to get auto_void_hours
  let autoVoidHours = 6
  try {
    const s = await pb.collection("fifa_settings").getFirstListItem("1=1")
    autoVoidHours = Number(getField(s, 'auto_void_hours', 6)) || 6
  } catch { /* default */ }
  const now = Date.now()
  const autoVoidMs = autoVoidHours * 3600 * 1000
  const finishedTimeoutMs = 48 * 3600 * 1000

  // Fetch all non-finished, non-void matches + finished-but-unsettled
  const drifted: string[] = []
  const allMatches = await pb.collection("fifa_matches").getFullList({
    filter: 'status != "void"',
    fields: 'id,status,kickoff_at,settled',
  })
  for (const m of allMatches) {
    const status = String(getField(m, 'status', 'upcoming'))
    const kickoffStr = String(getField(m, 'kickoff_at', ''))
    if (!kickoffStr) continue
    const kickoffMs = new Date(kickoffStr).getTime()
    if (isNaN(kickoffMs)) continue
    let shouldVoid = false
    if (status === 'upcoming' || status === 'live') {
      if (now - kickoffMs > autoVoidMs) shouldVoid = true
    } else if (status === 'finished' && !getField(m, 'settled', false)) {
      if (now - kickoffMs > finishedTimeoutMs) shouldVoid = true
    }
    if (shouldVoid) {
      await pb.collection("fifa_matches").update(String(getField(m, 'id', '')), { status: 'void' })
      drifted.push(String(getField(m, 'id', '')))
    }
  }
  return Response.json({ success: true, voided: drifted.length, matchIds: drifted })
}

// ─── Reset game — proxy to PB /api/fifa/admin-reset ──────────────────
async function resetProxy(request: Request, pb: PocketBase): Promise<Response> {
  const body = await request.json() as { confirm?: string }
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
    body: JSON.stringify({ confirm: body.confirm || '' }),
  })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}