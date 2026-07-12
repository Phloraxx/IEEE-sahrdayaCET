import { describe, it, expect } from 'vitest'
import {
  formatOuLineSummary,
  formatOuMarketBlurb,
  formatOuOptionLabel,
} from '@/lib/fifa-market-labels'

describe('fifa-market-labels', () => {
  it('formats total goals line and options', () => {
    expect(formatOuLineSummary('total_goals_ou', 2.5)).toBe('2.5 goals in 90 minutes')
    expect(formatOuOptionLabel('total_goals_ou', 'over', 2.5)).toBe('Over 2.5 goals')
    expect(formatOuOptionLabel('total_goals_ou', 'under', 2.5)).toBe('Under 2.5 goals')
    expect(formatOuMarketBlurb('total_goals_ou', 2.5)).toContain('under 2.5')
  })
})