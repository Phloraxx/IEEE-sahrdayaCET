import { describe, it, expect } from 'vitest'
import { normalizeTeamName, teamNamesMatch } from '@/lib/fifa-team-names'

describe('normalizeTeamName', () => {
  it('lowercases and trims', () => {
    expect(normalizeTeamName('  France  ')).toBe('france')
  })

  it('removes FC suffix', () => {
    expect(normalizeTeamName('Barcelona FC')).toBe('barcelona')
    expect(normalizeTeamName('barcelona fc')).toBe('barcelona')
  })

  it('maps USA aliases to united states', () => {
    expect(normalizeTeamName('USA')).toBe('united states')
    expect(normalizeTeamName('United States')).toBe('united states')
    expect(normalizeTeamName('U.S.A.')).toBe('united states')
  })

  it('maps common abbreviations', () => {
    expect(normalizeTeamName('GER')).toBe('germany')
    expect(normalizeTeamName('KOR')).toBe('south korea')
    expect(normalizeTeamName('KSA')).toBe('saudi arabia')
  })
})

describe('teamNamesMatch', () => {
  it('matches aliases for the same team', () => {
    expect(teamNamesMatch('USA', 'United States')).toBe(true)
    expect(teamNamesMatch('GER', 'Germany')).toBe(true)
    expect(teamNamesMatch('South Korea', 'KOR')).toBe(true)
  })

  it('does not match different teams', () => {
    expect(teamNamesMatch('USA', 'Mexico')).toBe(false)
    expect(teamNamesMatch('France', 'England')).toBe(false)
  })
})