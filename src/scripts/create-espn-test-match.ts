import PocketBase from 'pocketbase'
import dotenv from 'dotenv'
import {
  defaultEspnTestMatchConfig,
  mockPhaseToMatchStatus,
  resolveMockEspnPhase,
} from '@/lib/fifa-mock-espn'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const MARKET_TEMPLATES = [
  { market_type: 'match_winner', mode: 'pool' as const, options: ['home', 'away'] },
  { market_type: 'total_goals_ou', mode: 'pool' as const, line: 2.5, options: ['over', 'under'] },
  { market_type: 'correct_score', mode: 'pool' as const, options: ['1-0', '2-1', '1-1', '0-0', '2-0', '0-1', '1-2', '0-2', '3-0', '0-3', '2-2'] },
  { market_type: 'clean_sheet', mode: 'pool' as const, options: ['home', 'away'] },
]

async function main() {
  const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'
  const token = process.env.POCKETBASE_SUPERUSER_TOKEN || ''
  if (!token) {
    throw new Error('POCKETBASE_SUPERUSER_TOKEN required in .env.local')
  }

  const pb = new PocketBase(PB_URL)
  pb.authStore.save(token, null)

  const cfg = defaultEspnTestMatchConfig()
  const now = new Date()
  const phase = resolveMockEspnPhase(cfg.mock.kickoff_at, cfg.mock.end_at, now)
  const status = mockPhaseToMatchStatus(phase)
  const marketsOpen = status === 'upcoming'
  const resultFields =
    phase === 'post'
      ? {
          result_winner: cfg.mock.home_goals > cfg.mock.away_goals ? 'home' : cfg.mock.away_goals > cfg.mock.home_goals ? 'away' : 'draw',
          result_home_goals: cfg.mock.home_goals,
          result_away_goals: cfg.mock.away_goals,
          result_scorers: [] as string[],
          result_yellow_cards: 0,
          result_red_cards: 0,
          result_home_clean_sheet: cfg.mock.away_goals === 0,
          result_away_clean_sheet: cfg.mock.home_goals === 0,
          result_advance: cfg.mock.home_goals !== cfg.mock.away_goals
            ? (cfg.mock.home_goals > cfg.mock.away_goals ? 'home' : 'away')
            : '',
          result_after_extra_time: false,
          result_after_penalties: false,
        }
      : {}

  console.log(`Creating ESPN test match: ${cfg.team_home} vs ${cfg.team_away}`)
  console.log(`  Kickoff: ${cfg.kickoff_at} (12:30 PM IST)`)
  console.log(`  Full-time: ${cfg.end_at} (1:59 PM IST)`)
  console.log(`  ESPN ID: ${cfg.espnId}`)
  console.log(`  Current phase: ${phase} → status: ${status}`)
  console.log(`  Mock scoreboard: ${PB_URL}/api/fifa/mock-espn/scoreboard`)

  const existing = await pb.collection('fifa_matches').getFullList({
    filter: `team_home = "France" && team_away = "England"`,
    fields: 'id,external_ids',
  })
  const mockExisting = existing.find((m) => {
    const ext = m.external_ids as { mock?: boolean; espn?: string } | undefined
    return ext?.mock === true
  })

  let matchId: string
  if (mockExisting) {
    matchId = mockExisting.id
    await pb.collection('fifa_matches').update(matchId, {
      kickoff_at: cfg.kickoff_at,
      betting_locks_at: cfg.kickoff_at,
      status,
      external_ids: cfg.external_ids,
      settled: false,
      ...resultFields,
    })
    console.log(`Updated existing match ${matchId}`)
  } else {
    const created = await pb.collection('fifa_matches').create({
      team_home: cfg.team_home,
      team_away: cfg.team_away,
      stage: cfg.stage,
      kickoff_at: cfg.kickoff_at,
      betting_locks_at: cfg.kickoff_at,
      status,
      external_ids: cfg.external_ids,
      settled: false,
      ...resultFields,
    })
    matchId = created.id
    console.log(`Created match ${matchId}`)
  }

  const markets = await pb.collection('fifa_bet_markets').getFullList({
    filter: `match = "${matchId}"`,
    fields: 'id,market_type',
  })
  const have = new Set(markets.map((m) => m.market_type))
  let createdMarkets = 0
  for (const tmpl of MARKET_TEMPLATES) {
    if (have.has(tmpl.market_type)) continue
    await pb.collection('fifa_bet_markets').create({
      match: matchId,
      market_type: tmpl.market_type,
      mode: tmpl.mode,
      line: tmpl.line ?? 0,
      options: tmpl.options,
      is_open: marketsOpen,
      pool_total: 0,
      pool_by_option: {},
    })
    createdMarkets++
  }
  console.log(`Markets ensured (${createdMarkets} new)`)
  console.log('\nDone. The fifa-espn-sync cron will drive lifecycle from the mock ESPN payload.')
}

main().catch((err) => {
  console.error('ERROR:', err.message || err)
  process.exit(1)
})