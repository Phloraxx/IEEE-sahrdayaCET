import type { Access, Payload, Where } from 'payload'

// ── Simple role-based guards ──────────────────────────────────────
export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'

export const isSelfOrAdmin: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  if (user?.id) return { id: { equals: user.id } }
  return false
}

export const isChairOrAdmin: Access = ({ req: { user } }) =>
  user?.role === 'admin' || user?.role === 'chair'

// ── Chair-of-society guards (read the society from `data.society`) ─
export const isChairOfSociety: Access = async ({ req, data }) => {
  const { user } = req
  if (user?.role === 'admin') return true
  if (user?.role !== 'chair') return false

  const societyId = data?.society
  if (!societyId) return false

  const society = await req.payload.findByID({
    collection: 'societies',
    id: societyId,
    depth: 0,
  })

  const chairIds = (society?.chairs as Array<{ id: string }> | undefined)?.map(c => c.id) ?? []
  return chairIds.includes(user.id)
}

// ── Chair-of-society-for-event guard (read the event from `data.event`,
//    then walk event → society → chairs). Used as a Payload `Access` fn. ─
export const isChairOfSocietyForEventDoc: Access = async ({ req, data }) => {
  const { user } = req
  if (user?.role === 'admin') return true
  if (user?.role !== 'chair') return false

  const eventId = typeof data?.event === 'object' ? (data?.event as { id: string })?.id : data?.event
  if (!eventId) return false

  return isUserChairForEvent(user.id, req.payload, eventId)
}

// ── Read-side: chairs see all events of their societies; others see their own ─
export const isChairOrAdminForEventRead: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  if (user?.role === 'chair') {
    return {
      event: {
        society: {
          chairs: {
            contains: user.id,
          },
        },
      },
    } as Where
  }
  if (user?.id) return { user: { equals: user.id } }
  return false
}

// ── Standalone helper for API routes (no Payload Access context) ─
export async function isChairOfSocietyForEvent({
  userId,
  userRole,
  eventId,
  payload,
}: {
  userId: string
  userRole: string
  eventId: string
  payload: Payload
}): Promise<{ allowed: boolean }> {
  if (userRole === 'admin') return { allowed: true }
  if (userRole !== 'chair') return { allowed: false }
  return { allowed: await isUserChairForEvent(userId, payload, eventId) }
}

// ── Internal: shared event → society → chair chain ────────────────
async function isUserChairForEvent(
  userId: string,
  payload: Payload,
  eventId: string | number,
): Promise<boolean> {
  const event = await payload.findByID({ collection: 'events', id: eventId, depth: 0 })
  if (!event) return false

  const societyId =
    typeof event.society === 'object'
      ? (event.society as { id: string | number } | undefined)?.id
      : event.society
  if (!societyId) return false

  const society = await payload.findByID({
    collection: 'societies',
    id: societyId,
    depth: 0,
  })
  const chairIds = (society?.chairs as Array<{ id: string }> | undefined)?.map(c => c.id) ?? []
  return chairIds.includes(userId)
}
