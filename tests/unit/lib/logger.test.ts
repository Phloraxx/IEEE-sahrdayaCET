import { describe, it, expect, vi } from 'vitest'
import { logError } from '@/lib/logger'

describe('logError', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
  })

  it('logs error message with context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('test-context', new Error('something broke'))
    expect(spy).toHaveBeenCalledWith('[test-context]', 'something broke')
    spy.mockRestore()
  })

  it('handles non-Error objects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('test-context', 'string error')
    expect(spy).toHaveBeenCalledWith('[test-context]', 'string error')
    spy.mockRestore()
  })
})
