import { describe, it, expect } from 'vitest'
import { escapeCsv } from '@/lib/csv'

describe('escapeCsv', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(undefined)).toBe('')
  })

  it('returns simple strings unchanged', () => {
    expect(escapeCsv('hello')).toBe('hello')
    expect(escapeCsv('John Doe')).toBe('John Doe')
    expect(escapeCsv('123')).toBe('123')
  })

  it('wraps strings containing commas in quotes', () => {
    expect(escapeCsv('Doe, John')).toBe('"Doe, John"')
  })

  it('wraps strings containing newlines in quotes', () => {
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"')
  })

  it('escapes double quotes by doubling them', () => {
    expect(escapeCsv('He said "hello"')).toBe('"He said ""hello"""')
  })

  it('handles numbers', () => {
    expect(escapeCsv(42)).toBe('42')
    expect(escapeCsv(0)).toBe('0')
  })

  it('handles booleans', () => {
    expect(escapeCsv(true)).toBe('true')
    expect(escapeCsv(false)).toBe('false')
  })
})
