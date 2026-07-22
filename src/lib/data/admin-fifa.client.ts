import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { userDisplayName } from "@/lib/user-display-name";
import { FifaRaffleSnapshotSchema, type FifaRaffleSnapshot, type FifaSettings } from "@/schemas/fifa";

export interface AdminFifaMatchRecord {
  id: string;
  team_home: string;
  team_away: string;
  stage: string;
  kickoff_at: string;
  betting_locks_at: string;
  status: string;
  settled: boolean;
  result_winner: string;
  result_home_goals: number;
  result_away_goals: number;
  result_advance: string;
  result_after_extra_time: boolean;
  result_after_penalties: boolean;
}

export interface AdminFifaMarketRecord {
  id: string;
  match: string;
  market_type: string;
  mode: string;
  line: number;
  fixed_odds: Record<string, number> | null;
  options: string[];
  is_open: boolean;
  void: boolean;
  pool_total: number;
  pool_by_option: Record<string, number>;
}

function mapMatch(record: Record<string, unknown>): AdminFifaMatchRecord {
  return {
    id: String(record.id || ""),
    team_home: String(record.team_home || ""),
    team_away: String(record.team_away || ""),
    stage: String(record.stage || ""),
    kickoff_at: String(record.kickoff_at || ""),
    betting_locks_at: String(record.betting_locks_at || ""),
    status: String(record.status || "upcoming"),
    settled: Boolean(record.settled),
    result_winner: String(record.result_winner || ""),
    result_home_goals: Number(record.result_home_goals) || 0,
    result_away_goals: Number(record.result_away_goals) || 0,
    result_advance: String(record.result_advance || ""),
    result_after_extra_time: Boolean(record.result_after_extra_time),
    result_after_penalties: Boolean(record.result_after_penalties),
  };
}

function mapMarket(record: Record<string, unknown>): AdminFifaMarketRecord {
  return {
    id: String(record.id || ""),
    match: String(record.match || ""),
    market_type: String(record.market_type || ""),
    mode: String(record.mode || "pool"),
    line: Number(record.line) || 0,
    fixed_odds: record.fixed_odds && typeof record.fixed_odds === "object" ? record.fixed_odds as Record<string, number> : null,
    options: Array.isArray(record.options) ? record.options.map(String) : [],
    is_open: Boolean(record.is_open),
    void: Boolean(record.void),
    pool_total: Number(record.pool_total) || 0,
    pool_by_option: record.pool_by_option && typeof record.pool_by_option === "object" ? record.pool_by_option as Record<string, number> : {},
  };
}

export async function listAdminFifaMatches() {
  const records = await getPbClient().collection("fifa_matches").getFullList({ sort: "kickoff_at" });
  return { matches: records.map((record) => mapMatch(record)) };
}

export async function getAdminFifaMatch(id: string) {
  const record = await getPbClient().collection("fifa_matches").getOne(id);
  return { match: mapMatch(record) };
}

export async function saveAdminFifaMatch(id: string | undefined, data: Record<string, unknown>) {
  const pb = getPbClient();
  const body = { ...data };
  delete body.settled;
  if (!body.betting_locks_at && body.kickoff_at) body.betting_locks_at = body.kickoff_at;
  const match = id
    ? await pb.collection("fifa_matches").update(id, body)
    : await pb.collection("fifa_matches").create(body);
  return { match };
}

export async function deleteAdminFifaMatch(id: string) {
  const pb = getPbClient();
  const pending = await pb.collection("fifa_bets").getList(1, 1, {
    filter: `match = ${escapeFilterValue(id)} && status = 'pending'`,
    fields: "id",
  });
  if (pending.totalItems > 0) throw new Error("Cannot delete match with pending bets — void the match instead");
  await pb.collection("fifa_matches").delete(id);
}

export async function listAdminFifaMarkets(matchId?: string) {
  const records = await getPbClient().collection("fifa_bet_markets").getFullList({
    filter: matchId ? `match = ${escapeFilterValue(matchId)}` : undefined,
    sort: "id",
  });
  return { markets: records.map((record) => mapMarket(record)) };
}

export async function createAdminFifaMarket(data: Record<string, unknown>) {
  const market = await getPbClient().collection("fifa_bet_markets").create({
    ...data,
    pool_total: 0,
    pool_by_option: {},
  });
  return { market };
}

export async function updateAdminFifaMarket(id: string, data: Record<string, unknown>) {
  const pb = getPbClient();
  if (data.void === true) {
    return pb.send(`/api/fifa/markets/${encodeURIComponent(id)}/void`, { method: "POST" });
  }
  const body = { ...data };
  delete body.pool_total;
  delete body.pool_by_option;
  const market = await pb.collection("fifa_bet_markets").update(id, body);
  return { market: mapMarket(market) };
}

export async function deleteAdminFifaMarket(id: string) {
  const pb = getPbClient();
  const pending = await pb.collection("fifa_bets").getList(1, 1, {
    filter: `market = ${escapeFilterValue(id)} && status = 'pending'`,
    fields: "id",
  });
  if (pending.totalItems > 0) throw new Error("Cannot delete market with pending bets — void it instead");
  await pb.collection("fifa_bet_markets").delete(id);
}

export async function listAdminFifaFeed() {
  const result = await getPbClient().collection("fifa_feed_events").getList(1, 50, {
    sort: "-created",
    expand: "user",
  });
  return {
    events: result.items.map((record) => {
      const user = record.expand?.user;
      return {
        id: record.id,
        type: String(record.type || "system"),
        message: String(record.message || ""),
        created: String(record.created || ""),
        user: user
          ? { id: user.id, display_name: userDisplayName({ name: user.name, display_name: user.display_name }) }
          : null,
      };
    }),
    total: result.totalItems,
  };
}

export async function deleteAdminFifaFeedEvent(id: string) {
  await getPbClient().collection("fifa_feed_events").delete(id);
}

export interface FifaRaffleResult {
  success: boolean;
  winner: { user_id: string; display_name: string; rank: number; tickets: number; bets_count: number };
  totalTickets: number;
  totalEntries: number;
  seed: string;
  drawn_at: string;
  entries_snapshot: FifaRaffleSnapshot;
}

function asRaffleSnapshot(value: unknown): FifaRaffleSnapshot | null {
  const parsed = FifaRaffleSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listFifaRaffleDraws() {
  const s = await getPbClient().collection("fifa_settings").getFirstListItem("1=1", {
    fields: "id,raffle_drawn_at,raffle_winner,raffle_entries_snapshot,raffle_seed",
  });
  if (!s.raffle_drawn_at) return { draws: [] };
  return {
    draws: [{
      id: s.id,
      drawn_at: String(s.raffle_drawn_at || ""),
      winner: String(s.raffle_winner || ""),
      entries_snapshot: asRaffleSnapshot(s.raffle_entries_snapshot),
      seed: String(s.raffle_seed || ""),
    }],
  };
}

export async function getFifaSettings(): Promise<FifaSettings> {
  const s = await getPbClient().collection("fifa_settings").getFirstListItem("1=1");
  return {
    event_name: String(s.event_name || ""),
    starting_balance: Number(s.starting_balance) || 1000,
    max_bet_percent: Number(s.max_bet_percent) || 25,
    daily_topup_threshold: Number(s.daily_topup_threshold) || 100,
    daily_topup_target: Number(s.daily_topup_target) || 200,
    pool_house_cut_percent: Number(s.pool_house_cut_percent) || 0,
    raffle_tickets_base: Number(s.raffle_tickets_base) || 50,
    raffle_tickets_decay: Number(s.raffle_tickets_decay) || 2,
    raffle_active_participant_min_bets: Number(s.raffle_active_participant_min_bets) || 5,
    prize: String(s.prize || ""),
    registration_open: Boolean(s.registration_open),
    raffle_drawn_at: String(s.raffle_drawn_at || ""),
    raffle_winner: String(s.raffle_winner || ""),
    raffle_seed: String(s.raffle_seed || ""),
    raffle_entries_snapshot: asRaffleSnapshot(s.raffle_entries_snapshot),
  };
}

export async function updateFifaSettings(values: Partial<FifaSettings>) {
  const pb = getPbClient();
  const s = await pb.collection("fifa_settings").getFirstListItem("1=1", { fields: "id" });
  await pb.collection("fifa_settings").update(s.id, values);
}

export async function settleFifaMatch(payload: Record<string, unknown>) {
  return getPbClient().send("/api/fifa/settle", { method: "POST", body: payload });
}

export async function runFifaRaffle(): Promise<FifaRaffleResult> {
  return getPbClient().send("/api/fifa/raffle", { method: "POST" }) as Promise<FifaRaffleResult>;
}

export async function listAdminFifaBets(matchId?: string) {
  const result = await getPbClient().collection("fifa_bets").getList(1, 200, {
    filter: matchId ? `match = ${escapeFilterValue(matchId)}` : undefined,
    sort: "-placed_at",
    expand: "match,market,user",
  });
  return {
    bets: result.items.map((b) => ({
      id: b.id,
      user: b.expand?.user
        ? { id: b.expand.user.id, display_name: userDisplayName({ name: b.expand.user.name, display_name: b.expand.user.display_name }), email: String(b.expand.user.email || "") }
        : { id: String(b.user || ""), display_name: "", email: "" },
      selection: String(b.selection || ""),
      stake: Number(b.stake) || 0,
      mode: String(b.mode || "pool"),
      odds_locked: Number(b.odds_locked) || 0,
      status: String(b.status || "pending"),
      payout: Number(b.payout) || 0,
      placed_at: String(b.placed_at || ""),
      match: b.expand?.match ? { id: b.expand.match.id, team_home: String(b.expand.match.team_home || ""), team_away: String(b.expand.match.team_away || "") } : null,
      market: b.expand?.market ? { id: b.expand.market.id, market_type: String(b.expand.market.market_type || "") } : null,
    })),
    total: result.totalItems,
  };
}

const TEST_MARKETS = [
  { market_type: "match_winner", mode: "pool", options: ["home", "away"] },
  { market_type: "total_goals_ou", mode: "pool", line: 2.5, options: ["over", "under"] },
  { market_type: "correct_score", mode: "pool", options: ["1-0", "2-1", "1-1", "0-0", "2-0", "0-1", "1-2", "0-2", "3-0", "0-3", "2-2"] },
  { market_type: "clean_sheet", mode: "pool", options: ["home", "away"] },
] as const;

async function ensureTestMarkets(matchId: string, isOpen = true) {
  const pb = getPbClient();
  const existing = await pb.collection("fifa_bet_markets").getFullList({
    filter: `match = ${escapeFilterValue(matchId)}`,
    fields: "id,market_type",
  });
  const types = new Set(existing.map((m) => String(m.market_type || "")));
  let created = 0;
  for (const template of TEST_MARKETS) {
    if (types.has(template.market_type)) continue;
    await pb.collection("fifa_bet_markets").create({
      match: matchId,
      ...template,
      line: "line" in template ? template.line : 0,
      is_open: isOpen,
      pool_total: 0,
      pool_by_option: {},
    });
    created += 1;
  }
  return created;
}

export async function createFifaTestMatch() {
  const pb = getPbClient();
  const now = new Date();
  const kickoff = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const match = await pb.collection("fifa_matches").create({
    team_home: `Test Home (${ts})`,
    team_away: `Test Away (${ts})`,
    stage: "qf",
    kickoff_at: kickoff,
    betting_locks_at: kickoff,
    status: "upcoming",
  });
  const marketsCreated = await ensureTestMarkets(match.id);
  return { success: true, matchId: match.id, marketsCreated };
}

export async function createEspnFifaTestMatch() {
  const pb = getPbClient();
  const now = new Date();
  const kickoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const match = await pb.collection("fifa_matches").create({
    team_home: "France",
    team_away: "England",
    stage: "qf",
    kickoff_at: kickoff,
    betting_locks_at: kickoff,
    status: "live",
    external_ids: { mock: true, mock_end_at: endAt },
    settled: false,
  });
  await ensureTestMarkets(match.id, false);
  return { success: true, matchId: match.id, team_home: "France", team_away: "England", status: "live", end_at: endAt };
}

export async function importFifaFixturesFromPublicFeed() {
  const pb = getPbClient();
  const response = await fetch("/api/fifa/live-scores");
  if (!response.ok) throw new Error("Live fixture source unavailable");
  const payload = await response.json() as { matches?: Array<{ homeTeam?: string; awayTeam?: string; kickoffAt?: string | null; stage?: string | null; status?: string }> };
  const rows = payload.matches ?? [];
  let imported = 0, updated = 0, skipped = 0, marketsCreated = 0;
  for (const row of rows) {
    if (!row.homeTeam || !row.awayTeam || !row.kickoffAt) { skipped += 1; continue; }
    const keyFilter = `team_home = ${escapeFilterValue(row.homeTeam)} && team_away = ${escapeFilterValue(row.awayTeam)}`;
    const existing = await pb.collection("fifa_matches").getFirstListItem(keyFilter, { fields: "id" }).catch(() => null);
    let matchId: string;
    if (existing) {
      matchId = existing.id;
      await pb.collection("fifa_matches").update(matchId, {
        kickoff_at: row.kickoffAt,
        betting_locks_at: row.kickoffAt,
      });
      updated += 1;
    } else {
      const created = await pb.collection("fifa_matches").create({
        team_home: row.homeTeam,
        team_away: row.awayTeam,
        stage: row.stage || "group",
        kickoff_at: row.kickoffAt,
        betting_locks_at: row.kickoffAt,
        status: row.status === "FINISHED" ? "finished" : row.status === "IN_PLAY" ? "live" : "upcoming",
      });
      matchId = created.id;
      imported += 1;
    }
    marketsCreated += await ensureTestMarkets(matchId, row.status !== "FINISHED");
  }
  return { success: true, imported, updated, skipped, marketsCreated };
}

export async function adjustFifaBalance(userId: string, amount: number, note?: string) {
  return getPbClient().send("/api/fifa/admin-adjust", {
    method: "POST",
    body: { userId, amount, note },
  });
}
