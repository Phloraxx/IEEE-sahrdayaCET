import { getPbClient } from "@/lib/pb-client";
import { escapeFilterValue } from "@/lib/pb";
import { getExpand, getField } from "@/lib/safe-get";
import { userDisplayName } from "@/lib/user-display-name";

export interface FifaMatchData {
  id: string;
  team_home: string;
  team_away: string;
  stage: string;
  kickoff_at: string;
  betting_locks_at: string;
  status: string;
  result_winner: string;
  result_home_goals: number;
  result_away_goals: number;
  result_advance: string;
  result_after_extra_time: boolean;
  result_after_penalties: boolean;
  settled: boolean;
  background_image_url?: string | null;
  background_position?: string | null;
  markets: Array<{
    id: string;
    market_type: string;
    mode: string;
    line: number;
    fixed_odds?: Record<string, number> | null;
    options?: string[];
    is_open: boolean;
    void: boolean;
    pool_total: number;
    pool_by_option?: Record<string, number>;
  }>;
}

export async function listFifaMatches(): Promise<{ matches: FifaMatchData[] }> {
  const pb = getPbClient();
  const matches = await pb.collection("fifa_matches").getFullList({
    filter: 'status != "void"',
    sort: "kickoff_at",
    fields:
      "id,team_home,team_away,stage,kickoff_at,betting_locks_at,status,result_winner,result_home_goals,result_away_goals,result_advance,result_after_extra_time,result_after_penalties,settled",
  });
  const visible = matches.filter((m) => !String(m.team_home || "").toLowerCase().startsWith("test"));
  if (!visible.length) return { matches: [] };

  const filter = visible.map((m) => `match = ${escapeFilterValue(m.id)}`).join(" || ");
  const markets = await pb.collection("fifa_bet_markets").getFullList({
    filter,
    fields: "id,match,market_type,mode,line,fixed_odds,options,is_open,void,pool_total,pool_by_option",
  });
  const byMatch = new Map<string, FifaMatchData["markets"]>();
  for (const market of markets) {
    const matchId = String(market.match || "");
    const list = byMatch.get(matchId) ?? [];
    list.push({
      id: market.id,
      market_type: String(market.market_type || ""),
      mode: String(market.mode || "pool"),
      line: Number(market.line) || 0,
      fixed_odds: (market.fixed_odds || null) as Record<string, number> | null,
      options: Array.isArray(market.options) ? market.options.map(String) : [],
      is_open: Boolean(market.is_open),
      void: Boolean(market.void),
      pool_total: Number(market.pool_total) || 0,
      pool_by_option: (market.pool_by_option || {}) as Record<string, number>,
    });
    byMatch.set(matchId, list);
  }

  return {
    matches: visible.map((m) => ({
      id: m.id,
      team_home: String(m.team_home || ""),
      team_away: String(m.team_away || ""),
      stage: String(m.stage || ""),
      kickoff_at: String(m.kickoff_at || ""),
      betting_locks_at: String(m.betting_locks_at || ""),
      status: String(m.status || "upcoming"),
      result_winner: String(m.result_winner || ""),
      result_home_goals: Number(m.result_home_goals) || 0,
      result_away_goals: Number(m.result_away_goals) || 0,
      result_advance: String(m.result_advance || ""),
      result_after_extra_time: Boolean(m.result_after_extra_time),
      result_after_penalties: Boolean(m.result_after_penalties),
      settled: Boolean(m.settled),
      background_image_url: null,
      background_position: null,
      markets: byMatch.get(m.id) ?? [],
    })),
  };
}

export interface FifaDashboardPayload {
  user: { id: string; display_name: string; balance: number; email: string };
  max_bet_percent: number;
  valid_bets_count: number;
  bets: Array<{
    id: string;
    selection: string;
    stake: number;
    mode: string;
    odds_locked: number;
    status: string;
    payout: number;
    placed_at: string;
    match: { id: string; team_home: string; team_away: string } | null;
    market: { id: string; market_type: string } | null;
  }>;
  bet_statuses: Array<{ id: string; status: string }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balance_after: number;
    note: string;
    timestamp: string;
  }>;
}

export class FifaDashboardAuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "FifaDashboardAuthError";
  }
}

export async function fetchFifaDashboardDirect(): Promise<FifaDashboardPayload> {
  const pb = getPbClient();
  if (!pb.authStore.isValid || !pb.authStore.record?.id) throw new FifaDashboardAuthError();
  const userId = pb.authStore.record.id;
  const userIdFilter = escapeFilterValue(userId);

  const [userRec, bets, transactions, countPage, statusPage, settings] = await Promise.all([
    pb.collection("users").getOne(userId, { fields: "id,name,display_name,balance,email" }),
    pb.collection("fifa_bets").getList(1, 20, {
      filter: `user = ${userIdFilter}`,
      sort: "-placed_at",
      expand: "match,market",
      fields: "id,selection,stake,mode,odds_locked,status,payout,placed_at,match,market,expand.match.id,expand.match.team_home,expand.match.team_away,expand.market.id,expand.market.market_type",
    }),
    pb.collection("fifa_transactions").getList(1, 30, {
      filter: `user = ${userIdFilter}`,
      sort: "-timestamp",
      fields: "id,type,amount,balance_after,note,timestamp",
    }),
    pb.collection("fifa_bets").getList(1, 1, {
      filter: `user = ${userIdFilter} && status != 'void'`,
      fields: "id",
    }),
    pb.collection("fifa_bets").getList(1, 100, {
      filter: `user = ${userIdFilter}`,
      sort: "-placed_at",
      fields: "id,status",
    }),
    pb.collection("fifa_settings").getFirstListItem("1=1", { fields: "max_bet_percent" }).catch(() => null),
  ]);

  return {
    user: {
      id: userRec.id,
      display_name: userDisplayName({
        name: String(userRec.name || ""),
        display_name: String(userRec.display_name || ""),
      }),
      balance: Number(userRec.balance) || 0,
      email: String(userRec.email || ""),
    },
    max_bet_percent: Number(settings?.max_bet_percent) || 25,
    valid_bets_count: countPage.totalItems ?? 0,
    bet_statuses: statusPage.items.map((b) => ({ id: b.id, status: String(b.status || "pending") })),
    bets: bets.items.map((b) => {
      const expand = getExpand(b);
      return {
        id: b.id,
        selection: getField(b, "selection", ""),
        stake: Number(getField(b, "stake", 0)) || 0,
        mode: getField(b, "mode", "pool"),
        odds_locked: Number(getField(b, "odds_locked", 0)) || 0,
        status: getField(b, "status", "pending"),
        payout: Number(getField(b, "payout", 0)) || 0,
        placed_at: getField(b, "placed_at", ""),
        match: expand?.match
          ? {
              id: getField(expand.match, "id", ""),
              team_home: getField(expand.match, "team_home", ""),
              team_away: getField(expand.match, "team_away", ""),
            }
          : null,
        market: expand?.market
          ? {
              id: getField(expand.market, "id", ""),
              market_type: getField(expand.market, "market_type", ""),
            }
          : null,
      };
    }),
    transactions: transactions.items.map((t) => ({
      id: t.id,
      type: String(t.type || ""),
      amount: Number(t.amount) || 0,
      balance_after: Number(t.balance_after) || 0,
      note: String(t.note || ""),
      timestamp: String(t.timestamp || ""),
    })),
  };
}

export async function listMyFifaBets(matchId?: string) {
  const pb = getPbClient();
  if (!pb.authStore.record?.id) throw new Error("Not authenticated");
  const parts = [`user = ${escapeFilterValue(pb.authStore.record.id)}`];
  if (matchId) parts.push(`match = ${escapeFilterValue(matchId)}`);
  const result = await pb.collection("fifa_bets").getList(1, 100, {
    filter: parts.join(" && "),
    sort: "-placed_at",
    expand: "match,market",
  });
  return { bets: result.items, total: result.totalItems };
}

export async function placeFifaBet(input: {
  match: string;
  market: string;
  selection: string;
  stake: number;
}) {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  return pb.send("/api/fifa/bets", { method: "POST", body: input });
}
