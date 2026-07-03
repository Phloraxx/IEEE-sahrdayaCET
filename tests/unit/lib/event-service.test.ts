import { describe, it, expect, vi } from 'vitest'
import type PocketBase from 'pocketbase'
import { softDeleteEvent } from '@/lib/event-service'

describe('softDeleteEvent', () => {
  it("updates the event on the caller's authenticated client", async () => {
    const update = vi.fn().mockResolvedValue({})
    const pb = {
      collection: vi.fn((name: string) => {
        if (name === 'events') return { update }
        throw new Error(`Unexpected collection: ${name}`)
      }),
    } as unknown as PocketBase

    await softDeleteEvent('event-1', pb)

    expect(update).toHaveBeenCalledWith('event-1', {
      isDeleted: true,
      status: 'cancelled',
      registrationOpen: false,
    })
  })
})
