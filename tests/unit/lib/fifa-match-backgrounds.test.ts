import { describe, it, expect } from 'vitest'
import {
  pickBestBackgroundCandidate,
  scoreMatchImageText,
} from '@/lib/fifa-match-backgrounds'

describe('scoreMatchImageText', () => {
  it('scores both teams highly in a vs headline', () => {
    const score = scoreMatchImageText(
      'Klinsmann: Argentina vs England semifinal will be 50-50',
      'England',
      'Argentina',
    )
    expect(score).toBeGreaterThanOrEqual(10)
  })

  it('scores France and Spain in Yamal thumbnail path', () => {
    const score = scoreMatchImageText(
      "Spain's Yamal: If anyone can stop France, it's us dm_260710_Spains_Yamal",
      'France',
      'Spain',
    )
    expect(score).toBeGreaterThanOrEqual(6)
  })
})

describe('pickBestBackgroundCandidate', () => {
  it('prefers dual-team promo thumbnails over generic schedule art', () => {
    const picked = pickBestBackgroundCandidate([
      {
        url: 'https://a.espncdn.com/photo/2025/1204/r1584809_2_1296x729_16-9.jpg',
        score: 1,
        width: 1296,
      },
      {
        url: 'https://a.espncdn.com/media/motion/2026/0712/dm_260712_Klinsmann_Argentina_vs_England_semifinal_will_be_50_50/dm_260712_Klinsmann_Argentina_vs_England_semifinal_will_be_50_50.jpg',
        score: 14,
        width: 1280,
      },
    ])
    expect(picked?.imageUrl).toContain('Argentina_vs_England')
    expect(picked?.source).toBe('espn-summary')
  })
})