import { NextRequest } from 'next/server'
import { createPB, buildFileUrl } from '@/lib/pb'
import { handleError } from '@/lib/api-error'
import { ClientResponseError } from 'pocketbase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const pb = createPB()

    const event = await pb.collection('events').getOne(id, {
      expand: 'society',
      fields: 'id,title,description,date,endDate,venue,price,registrationOpen,registrationStart,registrationDeadline,maxCapacity,registeredCount,formTemplate,collectIeeeMember,externalFormUrl,externalLink,banner,status,isDeleted,society',
    })

    const r = event as unknown as Record<string, unknown>

    if (r.isDeleted || (r.status && r.status !== 'published')) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }

    const expand = r.expand as Record<string, unknown> | undefined
    const society = expand?.society as Record<string, unknown> | undefined

    const bannerFile = r.banner
    const bannerUrl = bannerFile ? buildFileUrl('events', id, bannerFile as string) : ''

    const result = {
      id: event.id,
      title: r.title || '',
      description: r.description || '',
      date: r.date || '',
      endDate: r.endDate || '',
      venue: r.venue || '',
      price: Number(r.price) || 0,
      isPaid: Number(r.price) > 0,
      registrationOpen: !!r.registrationOpen,
      registrationStart: r.registrationStart || '',
      registrationDeadline: r.registrationDeadline || '',
      maxCapacity: Number(r.maxCapacity) || 0,
      registeredCount: Number(r.registeredCount) || 0,
      formTemplate: r.formTemplate || [],
      collectIeeeMember: !!r.collectIeeeMember,
      externalFormUrl: r.externalFormUrl || '',
      externalLink: r.externalLink || '',
      bannerUrl,
      societyName: society?.name || '',
      status: r.status || '',
    }

    return Response.json({ event: result })
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) {
      return Response.json({ error: 'Event not found' }, { status: 404 })
    }
    return handleError(error, 'public-event-get')
  }
}
