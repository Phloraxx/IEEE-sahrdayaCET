import { createPublicPB } from "@/lib/pb.server";
import { escapeFilterValue } from "@/lib/pb";
import { getField } from "@/lib/safe-get";
import { resolveMatchBackground } from "@/lib/fifa-match-backgrounds";

export async function fetchMatch(id: string) {
    const pb = createPublicPB()
    try {
      const m = await pb.collection('fifa_matches').getOne(id, { fields: 'id,team_home,team_away,stage,kickoff_at,betting_locks_at,status,result_winner,result_home_goals,result_away_goals,result_advance,result_after_extra_time,result_after_penalties,settled,external_ids' })
      const markets = await pb.collection('fifa_bet_markets').getFullList({
        filter: `match = ${escapeFilterValue(id)}`,
        fields: 'id,market_type,mode,line,fixed_odds,options,is_open,void,pool_total,pool_by_option',
      })
      const externalIds = getField(m, 'external_ids', {}) as { espn?: string } | null
      const background = await resolveMatchBackground({
        team_home: getField(m, 'team_home', ''),
        team_away: getField(m, 'team_away', ''),
        kickoff_at: getField(m, 'kickoff_at', ''),
        espnId: externalIds?.espn ? String(externalIds.espn) : '',
      })
      return {
        id: getField(m, 'id', ''),
        team_home: getField(m, 'team_home', ''),
        team_away: getField(m, 'team_away', ''),
        stage: getField(m, 'stage', ''),
        kickoff_at: getField(m, 'kickoff_at', ''),
        betting_locks_at: getField(m, 'betting_locks_at', ''),
        status: getField(m, 'status', 'upcoming'),
        result_winner: getField(m, 'result_winner', ''),
        result_home_goals: getField(m, 'result_home_goals', 0),
        result_away_goals: getField(m, 'result_away_goals', 0),
        result_advance: getField(m, 'result_advance', ''),
        result_after_extra_time: getField(m, 'result_after_extra_time', false),
        result_after_penalties: getField(m, 'result_after_penalties', false),
        settled: getField(m, 'settled', false),
        background_image_url: background?.imageUrl ?? null,
        background_position: background?.position ?? null,
        markets: markets.map((mkt) => ({
          id: getField(mkt, 'id', ''),
          market_type: getField(mkt, 'market_type', ''),
          mode: getField(mkt, 'mode', 'pool'),
          line: getField(mkt, 'line', 0),
          fixed_odds: getField(mkt, 'fixed_odds', null),
          options: (getField(mkt, 'options', []) ?? []) as string[],
          is_open: getField(mkt, 'is_open', true),
          void: getField(mkt, 'void', false),
          pool_total: getField(mkt, 'pool_total', 0),
          pool_by_option: getField(mkt, 'pool_by_option', {}),
        })),
      }
    } catch {
      return null
    }
}
