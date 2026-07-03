import { describe, it, expect } from 'vitest'
import { escapeFilterValue } from '@/lib/pb'

describe('escapeFilterValue', () => {
  it('wraps strings in single quotes and escapes embedded quotes', () => {
    expect(escapeFilterValue("O'Brien")).toBe("'O''Brien'")
  })

  it('passes through numbers as-is', () => {
    expect(escapeFilterValue(42)).toBe('42')
    expect(escapeFilterValue(0)).toBe('0')
    expect(escapeFilterValue(-1)).toBe('-1')
  })

  it('passes through booleans as true/false', () => {
    expect(escapeFilterValue(true)).toBe('true')
    expect(escapeFilterValue(false)).toBe('false')
  })

  it('handles strings with special PB filter characters', () => {
    expect(escapeFilterValue("hello world")).toBe("'hello world'")
    expect(escapeFilterValue("test@email.com")).toBe("'test@email.com'")
    expect(escapeFilterValue("")).toBe("''")
  })
})
