import { afterAll, describe, expect, it } from 'vitest'
import PocketBase from 'pocketbase'

const PB_URL = process.env.POCKETBASE_URL
const CHAIR_TOKEN = process.env.PB_CHAIR_TOKEN
const OWN_SOCIETY_ID = process.env.PB_CHAIR_SOCIETY_ID
const OTHER_SOCIETY_ID = process.env.PB_OTHER_SOCIETY_ID

const skip = !PB_URL || !CHAIR_TOKEN || !OWN_SOCIETY_ID || !OTHER_SOCIETY_ID
const createdEventIds: string[] = []

function chairClient(): PocketBase {
  const pb = new PocketBase(PB_URL!)
  pb.authStore.save(CHAIR_TOKEN!, null)
  return pb
}

describe.skipIf(skip)('chair event creation authorization', () => {
  const pb = chairClient()

  afterAll(async () => {
    // Chairs cannot hard-delete events by design, so cleanup is best-effort via
    // soft-delete. Test records remain hidden from public views if cleanup runs.
    for (const id of createdEventIds) {
      try {
        await pb.collection('events').update(id, { isDeleted: true })
      } catch {
        // Ignore cleanup failures; the test assertions already completed.
      }
    }
  })

  it('allows a chair to create an event for a society they chair', async () => {
    const event = await pb.collection('events').create({
      title: `Chair Scope Test ${Date.now()}`,
      description: 'Created by chair authorization integration test',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      society: OWN_SOCIETY_ID,
      status: 'draft',
      registrationOpen: false,
      price: 0,
    })

    createdEventIds.push(event.id)
    expect(event.id).toBeTruthy()
    expect(event.society).toBe(OWN_SOCIETY_ID)
  })

  it('rejects a chair creating an event for another society', async () => {
    await expect(
      pb.collection('events').create({
        title: `Out of Scope Chair Test ${Date.now()}`,
        description: 'This create must be rejected by the PocketBase createRule',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        society: OTHER_SOCIETY_ID,
        status: 'draft',
        registrationOpen: false,
        price: 0,
      }),
    ).rejects.toThrow()
  })
})
