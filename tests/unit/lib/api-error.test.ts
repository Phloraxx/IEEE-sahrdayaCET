import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleError } from '@/lib/api-error'

// Mock ClientResponseError from pocketbase so instanceof checks work
vi.mock('pocketbase', () => {
  class MockClientResponseError extends Error {
    status: number
    data: Record<string, unknown>
    url: string
    response: Record<string, unknown>
    constructor(status: number, message: string, data?: Record<string, unknown>) {
      super(message)
      this.name = 'ClientResponseError'
      this.status = status
      this.url = ''
      this.response = {}
      this.data = data || { message }
    }
  }
  return { ClientResponseError: MockClientResponseError }
})

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns 500 for generic Error', () => {
    const response = handleError(new Error('Something broke'), 'test-context')
    expect(response.status).toBe(500)
  })

  it('returns 500 with default message for string errors', async () => {
    const response = handleError('string error', 'test-context')
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })

  it('handles PB-style 404 error', async () => {
    const { ClientResponseError } = await import('pocketbase')
    const err = new (ClientResponseError as any)(404, 'Not found')
    const response = handleError(err, 'test-context')
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Resource not found')
  })

  it('handles PB-style 400 error', async () => {
    const { ClientResponseError } = await import('pocketbase')
    const err = new (ClientResponseError as any)(400, 'Bad request', {
      message: 'Failed to create record.',
      data: { title: { code: 'validation_required', message: 'Missing required value.' } },
    })
    const response = handleError(err, 'test-context')
    expect(response.status).toBe(400)
    const body = await response.json()
    // handleError returns the PB error.message verbatim for 400s.
    expect(body.error).toBe('Bad request')
  })

  it('handles PB-style 403 error', async () => {
    const { ClientResponseError } = await import('pocketbase')
    const err = new (ClientResponseError as any)(403, 'Forbidden')
    const response = handleError(err, 'test-context')
    expect(response.status).toBe(403)
  })

  it('handles unknown PB-style status (e.g. 429)', async () => {
    const { ClientResponseError } = await import('pocketbase')
    const err = new (ClientResponseError as any)(429, 'Too many requests')
    const response = handleError(err, 'test-context')
    expect(response.status).toBe(429)
  })
})
