import { describe, expect, it } from 'vitest'

type Bet = { id: string; status: string }

function statusById(bets: Bet[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of bets) out[b.id] = b.status
  return out
}

function hadMatchSettlement(prev: Record<string, string>, next: Bet[]): boolean {
  for (const b of next) {
    const was = prev[b.id]
    if (was === 'pending' && (b.status === 'won' || b.status === 'lost')) {
      return true
    }
  }
  return false
}

describe('fifa settle rank toast', () => {
  it('fires on pending → won', () => {
    const prev = statusById([{ id: 'a', status: 'pending' }])
    expect(hadMatchSettlement(prev, [{ id: 'a', status: 'won' }])).toBe(true)
  })

  it('does not fire on pending → void', () => {
    const prev = statusById([{ id: 'a', status: 'pending' }])
    expect(hadMatchSettlement(prev, [{ id: 'a', status: 'void' }])).toBe(false)
  })

  it('does not fire when only new pending bets appear', () => {
    const prev = statusById([{ id: 'a', status: 'won' }])
    expect(
      hadMatchSettlement(prev, [
        { id: 'a', status: 'won' },
        { id: 'b', status: 'pending' },
      ]),
    ).toBe(false)
  })
})