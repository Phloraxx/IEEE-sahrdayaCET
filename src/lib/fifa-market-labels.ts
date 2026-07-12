/** Human-readable O/U line for total goals / cards markets. */

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