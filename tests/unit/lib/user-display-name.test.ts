import { describe, expect, it } from 'vitest'
import { userDisplayName } from '@/lib/user-display-name'

describe('userDisplayName', () => {
  it('prefers Google OAuth name over legacy display_name', () => {
    expect(userDisplayName({ name: 'Vijay A', display_name: 'CoolPlayer99' })).toBe('Vijay A')
  })

  it('falls back to display_name when name is empty', () => {
    expect(userDisplayName({ name: '', display_name: 'Legacy Name' })).toBe('Legacy Name')
  })

  it('returns empty when both are unset', () => {
    expect(userDisplayName({})).toBe('')
  })
})