import { getPayload } from 'payload'
import config from '@payload-config'
import { auth } from '@/auth'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const payload = await getPayload({ config })

  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('q') || ''
    const eventId = url.searchParams.get('eventId')

    if (!query.trim()) {
      return Response.json({ registrations: [] })
    }

    const searchFields = [
      { userName: { contains: query } },
      { userEmail: { contains: query } },
      { paymentTicketId: { contains: query } },
    ]

    const where: Record<string, unknown> = {
      or: searchFields,
      and: [{ registrationStatus: { equals: 'confirmed' } }],
    }

    if (eventId) {
      where.and = [...(where.and as Array<Record<string, unknown>>), { event: { equals: eventId } }]
    }

    const registrations = await payload.find({
      collection: 'registrations',
      where: where as any,
      depth: 1,
      limit: 50,
    })

    return Response.json({ registrations: registrations.docs })
  } catch (error) {
    payload.logger.error(`Search error: ${error}`)
    return Response.json({ error: 'Search failed' }, { status: 500 })
  }
}
