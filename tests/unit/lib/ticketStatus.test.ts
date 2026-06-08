import { describe, it, expect } from 'vitest'
import { getTicketStatusInfo } from '@/lib/ticketStatus'

describe('getTicketStatusInfo', () => {
  it('returns checked_in variant for checked_in status', () => {
    const info = getTicketStatusInfo('checked_in', false)
    expect(info.text).toMatch(/checked/i)
  })

  it('returns confirmed variant for confirmed status', () => {
    const info = getTicketStatusInfo('confirmed', false)
    expect(info.text).toMatch(/confirmed/i)
  })

  it('returns pending variant for pending status', () => {
    const info = getTicketStatusInfo('pending', false)
    expect(info.text).toMatch(/pending/i)
  })

  it('returns past event variant when isPast is true', () => {
    const info = getTicketStatusInfo('confirmed', true)
    expect(info.text).toMatch(/past/i)
  })

  it('returns fallback for unknown status', () => {
    const info = getTicketStatusInfo('unknown', false)
    expect(info.text).toBe('unknown')
  })
})
