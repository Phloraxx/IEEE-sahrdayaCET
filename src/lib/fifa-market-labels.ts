/** Human-readable labels for FIFA market options (World Cup — no "home/away"). */

export type MatchTeams = {
  team_home?: string | null
  team_away?: string | null
}

export function isOuMarket(marketType: string): boolean {
  return marketType === 'total_goals_ou' || marketType === 'cards_ou'
}

export function formatOuLineSummary(marketType: string, line: number): string | null {
  if (!isOuMarket(marketType) || line <= 0) return null
  if (marketType === 'total_goals_ou') {
    return `${line} goals in 90 minutes`
  }
  return `${line} total cards (yellow + red)`
}

export function formatOuOptionLabel(marketType: string, option: string, line: number): string {
  if (!isOuMarket(marketType) || line <= 0) return option
  const word = option.charAt(0).toUpperCase() + option.slice(1)
  if (marketType === 'total_goals_ou') {
    return `${word} ${line} goals`
  }
  return `${word} ${line}`
}

export function formatOuMarketBlurb(marketType: string, line: number): string {
  if (marketType === 'total_goals_ou' && line > 0) {
    return `Will the 90-minute goal total be over or under ${line}? Land exactly on a whole-number line = push (refund).`
  }
  if (marketType === 'cards_ou' && line > 0) {
    return `Will total cards be over or under ${line}? Push = refund.`
  }
  if (marketType === 'total_goals_ou') {
    return 'Over/under the 90-minute goal total. Push = refund.'
  }
  return 'Over/under total cards (yellow + red). Push = refund.'
}

/**
 * Display label for a market option / bet selection.
 * Internal values stay home|away|draw — UI shows team names for World Cup.
 */
export function formatMarketOptionLabel(
  marketType: string | null | undefined,
  option: string,
  teams?: MatchTeams | null,
  line = 0,
): string {
  const team1 = teams?.team_home?.trim() || 'Team 1'
  const team2 = teams?.team_away?.trim() || 'Team 2'
  const type = marketType || ''

  if (isOuMarket(type)) {
    return formatOuOptionLabel(type, option, line)
  }

  if (type === 'clean_sheet') {
    if (option === 'home') return `${team1} clean sheet`
    if (option === 'away') return `${team2} clean sheet`
    return option
  }

  if (type === 'match_winner' || option === 'home' || option === 'away' || option === 'draw') {
    if (option === 'home') return team1
    if (option === 'away') return team2
    if (option === 'draw') return 'Draw'
  }

  return option
}

/** Admin settle form: "France win (90 min)" instead of "Home win". */
export function formatSideLabel(
  side: 'home' | 'away' | 'draw',
  teams?: MatchTeams | null,
  suffix = '',
): string {
  const team1 = teams?.team_home?.trim() || 'Team 1'
  const team2 = teams?.team_away?.trim() || 'Team 2'
  const base =
    side === 'home' ? team1 : side === 'away' ? team2 : 'Draw'
  return suffix ? `${base}${suffix}` : base
}