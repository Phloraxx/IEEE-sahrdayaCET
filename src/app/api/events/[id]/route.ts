import { NextRequest } from 'next/server'
import { createPB, buildFileUrl } from '@/lib/pb'
import { logError } from '@/lib/logger'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const pb = createPB()

    const event = await pb.collection('events').getOne(id, { expand: 'society' })

    const expand = (event as Record<string, unknown>).expand as Record<string, unknown> | undefined
    const society = expand?.society as Record<string, unknown> | undefined

    const bannerFile = (event as Record<string, unknown>).banner
    const bannerUrl = bannerFile ? buildFileUrl('events', id, bannerFile as string) : ''

    const result = {
      id: event.id,
      title: (event as Record<string, unknown>).title || '',
      description: (event as Record<string, unknown>).description || '',
      date: (event as Record<string, unknown>).date || '',
      endDate: (event as Record<string, unknown>).endDate || '',
      venue: (event as Record<string, unknown>).venue || '',
      price: Number((event as Record<string, unknown>).price) || 0,
      isPaid: Number((event as Record<string, unknown>).price) > 0,
      registrationOpen: !!(event as Record<string, unknown>).registrationOpen,
      registrationStart: (event as Record<string, unknown>).registrationStart || '',
      registrationDeadline: (event as Record<string, unknown>).registrationDeadline || '',
      maxCapacity: Number((event as Record<string, unknown>).maxCapacity) || 0,
      registeredCount: Number((event as Record<string, unknown>).registeredCount) || 0,
      formTemplate: (event as Record<string, unknown>).formTemplate || [],
      collectIeeeMember: !!(event as Record<string, unknown>).collectIeeeMember,
      externalFormUrl: (event as Record<string, unknown>).externalFormUrl || '',
      externalLink: (event as Record<string, unknown>).externalLink || '',
      bannerUrl,
      societyName: society?.name || '',
      status: (event as Record<string, unknown>).status || '',
    }

    return Response.json({ event: result })
  } catch (error) {
    logError('public-event-get', error)
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }
}
