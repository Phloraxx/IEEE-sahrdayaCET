import { describe, it, expect } from 'vitest'
import {
  formatMarketOptionLabel,
  formatOuLineSummary,
  formatOuMarketBlurb,
  formatOuOptionLabel,
  formatSideLabel,
} from '@/lib/fifa-market-labels'

const teams = { team_home: 'France', team_away: 'England' }

describe('fifa-market-labels', () => {
  it('formats total goals line and options', () => {
    expect(formatOuLineSummary('total_goals_ou', 2.5)).toBe('2.5 goals in 90 minutes')
    expect(formatOuOptionLabel('total_goals_ou', 'over', 2.5)).toBe('Over 2.5 goals')
    expect(formatOuOptionLabel('total_goals_ou', 'under', 2.5)).toBe('Under 2.5 goals')
    expect(formatOuMarketBlurb('total_goals_ou', 2.5)).toContain('under 2.5')
  })

  it('uses team names instead of home/away for World Cup markets', () => {
    expect(formatMarketOptionLabel('match_winner', 'home', teams)).toBe('France')
    expect(formatMarketOptionLabel('match_winner', 'away', teams)).toBe('England')
    expect(formatMarketOptionLabel('match_winner', 'draw', teams)).toBe('Draw')
    expect(formatMarketOptionLabel('clean_sheet', 'home', teams)).toBe('France clean sheet')
    expect(formatMarketOptionLabel('clean_sheet', 'away', teams)).toBe('England clean sheet')
    expect(formatMarketOptionLabel('total_goals_ou', 'over', teams, 2.5)).toBe('Over 2.5 goals')
    expect(formatMarketOptionLabel('correct_score', '2-1', teams)).toBe('2-1')
  })

  it('formatSideLabel for admin settle', () => {
    expect(formatSideLabel('home', teams, ' win (90 min)')).toBe('France win (90 min)')
    expect(formatSideLabel('away', teams)).toBe('England')
    expect(formatSideLabel('draw', teams, ' (90 min)')).toBe('Draw (90 min)')
  })
})