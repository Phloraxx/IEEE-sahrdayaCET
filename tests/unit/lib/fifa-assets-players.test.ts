import { describe, it, expect } from 'vitest'
import {
  getTeamPlayerVisual,
  getTeamStarPlayer,
  normalizeTeamDisplayName,
} from '@/lib/fifa-assets'

describe('fifa team player visuals', () => {
  it('normalizes short team codes', () => {
    expect(normalizeTeamDisplayName('ENG')).toBe('England')
    expect(normalizeTeamDisplayName('SPA')).toBe('Spain')
  })

  it('returns star players for knockout teams', () => {
    expect(getTeamStarPlayer('France')?.name).toBe('Kylian Mbappé')
    expect(getTeamStarPlayer('Argentina')?.name).toBe('Lionel Messi')
    expect(getTeamStarPlayer('England')?.name).toBe('Harry Kane')
    expect(getTeamStarPlayer('Spain')?.name).toBe('Lamine Yamal')
  })

  it('falls back to team crest when no mapped star player', () => {
    const visual = getTeamPlayerVisual('Unknownland')
    expect(visual).toBeNull()
  })

  it('uses ESPN headshot URLs for mapped players', () => {
    const visual = getTeamPlayerVisual('France')
    expect(visual?.isPlayerPhoto).toBe(true)
    expect(visual?.photoUrl).toContain('headshots/soccer/players/full/231388.png')
  })
})