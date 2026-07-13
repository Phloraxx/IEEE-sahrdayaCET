import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateShort,
  formatDateCompact,
  formatTime,
  formatDay,
  formatMonth,
  formatKickoffParts,
  toIso,
} from '@/lib/dates'

const TEST_DATE = '2026-06-08T14:30:00.000Z'

describe('date formatting', () => {
  it('formatDate returns full date string', () => {
    const result = formatDate(TEST_DATE)
    expect(result).toContain('June')
    expect(result).toContain('2026')
  })

  it('formatDateShort returns abbreviated date', () => {
    const result = formatDateShort(TEST_DATE)
    expect(result).toContain('Jun')
    expect(result).toContain('2026')
  })

  it('formatDateCompact returns month + day only', () => {
    const result = formatDateCompact(TEST_DATE)
    expect(result).toContain('Jun')
    expect(result).toContain('8')
  })

  it('formatTime returns 12-hour time', () => {
    const result = formatTime(TEST_DATE)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })

  it('formatDay returns zero-padded day', () => {
    expect(formatDay(TEST_DATE)).toBe('08')
  })

  it('formatMonth returns uppercase month', () => {
    expect(formatMonth(TEST_DATE)).toBe('JUN')
  })

  it('toIso returns ISO string', () => {
    const d = new Date('2026-06-08T00:00:00.000Z')
    expect(toIso(d)).toBe('2026-06-08T00:00:00.000Z')
  })

  it('formatKickoffParts splits date and time', () => {
    const { date, time } = formatKickoffParts(TEST_DATE)
    expect(date).toContain('2026')
    expect(time).toMatch(/\d{1,2}:\d{2}/)
  })
})
