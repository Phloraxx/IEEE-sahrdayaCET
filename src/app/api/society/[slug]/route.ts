import { pbFetch, buildFileUrl, escapeFilterValue } from '@/lib/pb'
import { logError } from '@/lib/logger'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const PB_URL = process.env.POCKETBASE_URL
  if (!PB_URL) throw new Error('Missing POCKETBASE_URL')

  try {
    const societyUrl = `${PB_URL}/api/collections/societies/records?filter=${encodeURIComponent(`slug=${escapeFilterValue(slug)}`)}&skipTotal=1&fields=id,name,slug,bio,logo,banner`
    const socData = await pbFetch<{ items: Record<string, unknown>[] }>(societyUrl)
    const society = socData?.items?.[0] as Record<string, unknown> | undefined
    if (!society) return Response.json({ error: 'Society not found' }, { status: 404 })

    const [eventsRes, membersRes] = await Promise.all([
      pbFetch<{ items: Record<string, unknown>[] }>(`${PB_URL}/api/collections/events/records?perPage=50&filter=${encodeURIComponent(`society=${escapeFilterValue(society.id as string)}`)}&sort=-date&skipTotal=1&fields=id,title,description,date,venue,price,status,maxCapacity,banner`),
      pbFetch<{ items: Record<string, unknown>[] }>(`${PB_URL}/api/collections/execom/records?perPage=50&filter=${encodeURIComponent(`sectionId=${escapeFilterValue(slug)}`)}&sort=order&skipTotal=1&fields=id,order,name,department,batch,position,photo,linkedin,instagram,email,phone`),
    ])

    const events = (eventsRes?.items || []).map((e: Record<string, unknown>) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      venue: e.venue,
      description: e.description,
      price: (e.price as number) || 0,
      status: e.status || 'published',
      maxCapacity: (e.maxCapacity as number) || 0,
      bannerUrl: e.banner ? buildFileUrl('events', e.id as string, e.banner as string) : '',
    }))

    const members = (membersRes?.items || []).map((doc: Record<string, unknown>) => ({
      slNo: (doc.order as number) || 0,
      name: (doc.name as string) || '',
      department: (doc.department as string) || '',
      semester: (doc.batch as string) || '',
      position: (doc.position as string) || '',
      photoUrl: doc.photo ? buildFileUrl('execom', doc.id as string, doc.photo as string) : '',
      linkedin: (doc.linkedin as string) || '',
      instagram: (doc.instagram as string) || '',
      email: (doc.email as string) || '',
      phone: (doc.phone as string) || '',
    }))

    return Response.json({
      society: {
        id: society.id as string,
        name: society.name as string,
        slug: society.slug as string,
        bio: (society.bio as string) || '',
        logoUrl: society.logo ? buildFileUrl('societies', society.id as string, society.logo as string) : '',
        bannerUrl: society.banner ? buildFileUrl('societies', society.id as string, society.banner as string) : '',
      },
      events,
      members,
    })
  } catch (e) {
    logError('society-get', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg.includes('no matching record') ? 'Society not found' : 'Failed to fetch society data' }, { status: msg.includes('no matching record') ? 404 : 500 })
  }
}
