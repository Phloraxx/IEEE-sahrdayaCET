import { describe, it, expect, vi } from 'vitest'
import { softDeleteEvent } from '@/lib/event-service'

const { mockUpdate } = vi.hoisted(() => ({
  mockUpdate: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/pb', () => ({
  createAdminPB: () => ({
    collection: vi.fn((name: string) => {
      if (name === 'events') return { update: mockUpdate }
      throw new Error(`Unexpected collection: ${name}`)
    }),
  }),
}))

describe('softDeleteEvent', () => {
  it('sets isDeleted, status, and registrationOpen', async () => {
    await softDeleteEvent('event-1')

    expect(mockUpdate).toHaveBeenCalledWith('event-1', {
      isDeleted: true,
      status: 'cancelled',
      registrationOpen: false,
    })
  })
})
