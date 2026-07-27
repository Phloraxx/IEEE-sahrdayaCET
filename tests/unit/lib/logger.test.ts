import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logError } from '@/lib/logger'

describe('logError', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
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
  })

  it('emits one structured JSON record in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('test-context', new Error('something broke'), { requestId: 'req-1' })
    expect(spy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]))
    expect(payload).toMatchObject({
      level: 'error',
      context: 'test-context',
      message: 'something broke',
      requestId: 'req-1',
    })
  })
})
