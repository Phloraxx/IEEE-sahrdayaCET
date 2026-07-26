import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateShort,
  formatDateLong,
  formatDateCompact,
  formatTime,
  formatDay,
  formatMonth,
  formatKickoffParts,
  formatDateTime,
  formatHour12,
  formatAMPM,
  toAppDateTimeLocal,
  fromAppDateTimeLocal,
  getAppDayBounds,
  toIso,
} from '@/lib/dates'

const TEST_DATE = '2026-06-08T14:30:00.000Z'

describe('date formatting', () => {
  it('formatDate returns full date string', () => {
    const result = formatDate(TEST_DATE)
    expect(result).toBe('Monday, 8 June 2026')
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

  it('uses Asia/Kolkata consistently across SSR and browser display helpers', () => {
    const boundary = '2026-07-26T20:30:00.000Z' // 27 Jul, 02:00 IST
    expect(formatDate(boundary)).toBe('Monday, 27 July 2026')
    expect(formatDateShort(boundary)).toContain('27')
    expect(formatDateLong(boundary)).toContain('July')
    expect(formatDateCompact(boundary)).toContain('27')
    expect(formatDay(boundary)).toBe('27')
    expect(formatTime(boundary)).toMatch(/02:00/i)
    expect(formatDateTime(boundary)).toMatch(/27/)
    expect(formatHour12(boundary)).toBe('02')
    expect(formatAMPM(boundary)).toBe('AM')
  })

  it('round-trips India wall-clock values independently of host timezone', () => {
    const iso = '2026-07-26T03:30:00.000Z'
    const local = toAppDateTimeLocal(iso)
    expect(local).toBe('2026-07-26T09:00')
    expect(fromAppDateTimeLocal(local)).toBe(iso)
    expect(fromAppDateTimeLocal('2026-02-30T09:00')).toBeUndefined()
  })

  it('computes Asia/Kolkata day bounds from any instant', () => {
    const bounds = getAppDayBounds(new Date('2026-07-26T20:30:00.000Z'))
    expect(bounds.startIso).toBe('2026-07-26T18:30:00.000Z')
    expect(bounds.endIso).toBe('2026-07-27T18:30:00.000Z')
  })

  it('returns empty display parts for invalid dates', () => {
    expect(formatDateTime('not-a-date')).toBe('')
    expect(formatHour12('not-a-date')).toBe('')
    expect(formatAMPM('not-a-date')).toBe('')
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
