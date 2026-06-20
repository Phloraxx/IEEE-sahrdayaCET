/**
 * Integration tests for PocketBase operations.
 *
 * These tests connect to a running PocketBase instance via the superuser token
 * and exercise read/write/query operations against all 5 collections.
 *
 * Requires: POCKETBASE_URL, POCKETBASE_SUPERUSER_TOKEN env vars.
 * If they are not set, the tests are skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import PocketBase from 'pocketbase'

const PB_URL = process.env.POCKETBASE_URL
const TOKEN = process.env.POCKETBASE_SUPERUSER_TOKEN
const skip = !PB_URL || !TOKEN

function getPB(): PocketBase {
  const pb = new PocketBase(PB_URL!)
  pb.authStore.save(TOKEN!, null)
  return pb
}

// Track created records for cleanup
const created: Array<{ col: string; id: string }> = []

function track(col: string, id: string) {
  created.push({ col, id })
}

async function cleanup(pb: PocketBase) {
  for (const r of [...created].reverse()) {
    try { await pb.collection(r.col).delete(r.id) } catch { /* ok */ }
  }
  created.length = 0
}

describe.skipIf(skip)('PocketBase Operations', () => {
  let pb: PocketBase
  let societyId: string
  let eventId: string

  beforeAll(async () => {
    pb = getPB()
  })

  afterAll(async () => {
    await cleanup(pb)
  })

  // ─── Societies ──────────────────────────────────────────

  describe('societies CRUD', () => {
    it('creates a society', async () => {
      const soc = await pb.collection('societies').create({
        name: 'Integration Test Society',
        slug: `int-test-${Date.now()}`,
        bio: 'Created by integration test',
        isHidden: false,
      })
      expect(soc.id).toBeTruthy()
      expect(soc.name).toContain('Integration Test')
      track('societies', soc.id)
      societyId = soc.id
    })

    it('lists societies with filter', async () => {
      const list = await pb.collection('societies').getList(1, 10, {
        filter: `id = '${societyId}'`,
      })
      expect(list.totalItems).toBe(1)
      expect(list.items[0].id).toBe(societyId)
    })

    it('gets a single society', async () => {
      const soc = await pb.collection('societies').getOne(societyId)
      expect(soc.id).toBe(societyId)
      expect(soc.name).toBeTruthy()
    })

    it('updates a society', async () => {
      const updated = await pb.collection('societies').update(societyId, { bio: 'Updated bio' })
      expect(updated.bio).toBe('Updated bio')
    })

    it('filters society by name search (like operator)', async () => {
      const list = await pb.collection('societies').getList(1, 10, {
        filter: `name ~ 'Integration Test'`,
      })
      expect(list.totalItems).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Events ─────────────────────────────────────────────

  describe('events CRUD', () => {
    it('creates an event', async () => {
      const now = new Date()
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const evt = await pb.collection('events').create({
        title: 'Integration Test Event',
        description: 'Testing CRUD operations',
        date: future.toISOString(),
        venue: 'Test Hall',
        society: societyId,
        status: 'published',
        registrationOpen: true,
        price: 0,
        maxCapacity: 100,
        registeredCount: 0,
        checkedInCount: 0,
        formTemplate: [
          { id: 'college', label: 'College', type: 'text', required: true },
        ],
        collectIeeeMember: true,
        tags: 'workshop',
      })
      expect(evt.id).toBeTruthy()
      expect(evt.title).toBe('Integration Test Event')
      expect(Array.isArray(evt.formTemplate)).toBe(true)
      expect(evt.collectIeeeMember).toBe(true)
      track('events', evt.id)
      eventId = evt.id
    })

    it('lists events with expand', async () => {
      const list = await pb.collection('events').getList(1, 10, {
        filter: `id = '${eventId}'`,
        expand: 'society',
      })
      expect(list.totalItems).toBe(1)
      const evt = list.items[0] as Record<string, unknown>
      expect((evt.expand as any)?.society?.name).toBeTruthy()
    })

    it('gets event with all fields', async () => {
      const evt = await pb.collection('events').getOne(eventId)
      expect(evt.title).toBeTruthy()
      expect(evt.date).toBeTruthy()
      expect(evt.venue).toBeTruthy()
      expect(evt.society).toBe(societyId)
      // Check phantom fields are NOT present
      expect((evt as any).enableWaitlist).toBeUndefined()
      expect((evt as any).ieeeMemberPrice).toBeUndefined()
    })

    it('sorts events by date descending', async () => {
      const list = await pb.collection('events').getList(1, 5, { sort: '-date' })
      expect(list.items.length).toBeGreaterThan(0)
      // Verify descending order
      const dates = list.items.map((e: any) => new Date(e.date).getTime())
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1])
      }
    })

    it('filters events by status', async () => {
      const draft = await pb.collection('events').getList(1, 1, {
        filter: `status = 'draft'`,
      })
      expect(draft.totalItems).toBeGreaterThanOrEqual(0) // Might be 0
    })
  })

  // ─── Registrations ──────────────────────────────────────

  describe('registrations CRUD', () => {
    let regId: string
    let userId: string

    it('creates a registration with an existing user', async () => {
      // Get an existing user from the DB for the required user relation
      const users = await pb.collection('users').getList(1, 1, { fields: 'id' })
      if (users.items.length === 0) {
        // No users exist — skip registration write tests
        return
      }
      userId = users.items[0].id
      const reg = await pb.collection('registrations').create({
        user: userId,
        event: eventId,
        userName: 'Integration Tester',
        userEmail: 'tester@test.com',
        userPhone: '9876543210',
        paymentStatus: 'not_required',
        registrationStatus: 'confirmed',
        amount: 0,
        formResponses: { college: 'Sahrdaya CET' },
        registrationDate: new Date().toISOString(),
        ticketId: `TKT-INTEGRATION-${Date.now()}`,
      })
      expect(reg.id).toBeTruthy()
      expect(reg.ticketId).toMatch(/^TKT-/)
      track('registrations', reg.id)
      regId = reg.id
    })

    it('lists registrations with event expand', async () => {
      if (!regId) return
      const list = await pb.collection('registrations').getList(1, 10, {
        filter: `id = '${regId}'`,
        expand: 'event',
      })
      expect(list.totalItems).toBe(1)
      const reg = list.items[0] as Record<string, unknown>
      expect((reg.expand as any)?.event?.title).toBeTruthy()
    })

    it('filters registrations by event', async () => {
      if (!regId) return
      const list = await pb.collection('registrations').getList(1, 10, {
        filter: `event = '${eventId}'`,
      })
      expect(list.totalItems).toBeGreaterThanOrEqual(1)
    })

    it('updates check-in status', async () => {
      if (!regId) return
      await pb.collection('registrations').update(regId, {
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
      })
      const updated = await pb.collection('registrations').getOne(regId)
      expect(updated.checkedIn).toBe(true)
    })

    it('enforces unique (user, event) index', async () => {
      if (!regId || !userId) return
      // Trying to create a second registration for the same user+event should fail
      // due to the unique index
      await expect(
        pb.collection('registrations').create({
          user: userId,
          event: eventId,
          userName: 'Duplicate Tester',
          userEmail: 'tester@test.com',
          userPhone: '9876543210',
          paymentStatus: 'not_required',
          registrationStatus: 'confirmed',
          amount: 0,
          formResponses: {},
          registrationDate: new Date().toISOString(),
          ticketId: `TKT-DUPE-${Date.now()}`,
        })
      ).rejects.toThrow()
    })
  })

  // ─── Execom ─────────────────────────────────────────────

  describe('execom operations', () => {
    it('lists execom members', async () => {
      const list = await pb.collection('execom').getList(1, 10, { sort: 'order' })
      expect(list.items).toBeDefined()
    })

    it('filters execom by sectionId', async () => {
      const list = await pb.collection('execom').getList(1, 1, {
        filter: `sectionId = 'cs'`,
      })
      // May be 0 records, but query should succeed
      expect(list.totalItems).toBeGreaterThanOrEqual(0)
    })
  })

  // ─── Filter Patterns ─────────────────────────────────────

  describe('filter patterns', () => {
    it('handles complex boolean filters', async () => {
      const now = new Date().toISOString()
      const list = await pb.collection('events').getList(1, 5, {
        filter: `date > '${now}' && status = 'published'`,
      })
      expect(list.items).toBeDefined()
    })

    it('handles chair scoping filter (society IN list)', async () => {
      const filter = `society = '${societyId}'`
      const list = await pb.collection('events').getList(1, 5, { filter })
      expect(list.totalItems).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Edge Cases ─────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty list for non-existent filter', async () => {
      const list = await pb.collection('events').getList(1, 10, {
        filter: `id = 'nonexistent0000000'`,
      })
      expect(list.totalItems).toBe(0)
      expect(list.items).toHaveLength(0)
    })

    it('handles perPage=1', async () => {
      const list = await pb.collection('events').getList(1, 1)
      expect(list.items.length).toBeLessThanOrEqual(1)
    })

    it('handles fields projection', async () => {
      if (!eventId) return
      const evt = await pb.collection('events').getOne(eventId, {
        fields: 'id,title,venue',
      })
      expect(evt.id).toBeTruthy()
      expect(evt.title).toBeTruthy()
      expect((evt as any).description).toBeUndefined()
    })
  })
})
