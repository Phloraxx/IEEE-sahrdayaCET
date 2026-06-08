import { escapeFilterValue } from '@/lib/pb-filter'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const PB_URL = process.env.POCKETBASE_URL
  if (!PB_URL) throw new Error('Missing POCKETBASE_URL')

  const fileUrl = (col: string, id: string, name: string) => `${PB_URL}/api/files/${col}/${id}/${name}`

  try {
    const socRes = await fetch(`${PB_URL}/api/collections/societies/records?filter=${encodeURIComponent(`slug="${slug}"`)}&skipTotal=1&fields=id,name,slug,bio,logo,banner`)
    if (!socRes.ok) throw new Error(`PB ${socRes.status}`)
    const socData = await socRes.json()
    const society = (socData as any).items?.[0]
    if (!society) return Response.json({ error: 'Society not found' }, { status: 404 })

    const [eventsRes, membersRes] = await Promise.all([
      fetch(`${PB_URL}/api/collections/events/records?perPage=50&filter=${encodeURIComponent(`society="${society.id}"`)}&sort=-created&skipTotal=1&fields=id,title,description,date,venue,price,status,maxCapacity,banner`).then(r => r.ok ? r.json() : null),
      fetch(`${PB_URL}/api/collections/execom/records?perPage=50&filter=${encodeURIComponent(`sectionId="${slug}"`)}&sort=order&skipTotal=1&fields=id,order,name,department,batch,position,photo,linkedin,instagram,email,phone`).then(r => r.ok ? r.json() : null),
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
      bannerUrl: e.banner ? fileUrl('events', e.id as string, e.banner as string) : '',
    }))

    const members = (membersRes?.items || []).map((doc: Record<string, unknown>) => ({
      slNo: (doc.order as number) || 0,
      name: (doc.name as string) || '',
      department: (doc.department as string) || '',
      semester: (doc.batch as string) || '',
      position: (doc.position as string) || '',
      photoUrl: doc.photo ? fileUrl('execom', doc.id as string, doc.photo as string) : '',
      linkedin: (doc.linkedin as string) || '',
      instagram: (doc.instagram as string) || '',
      email: (doc.email as string) || '',
      phone: (doc.phone as string) || '',
    }))

    return Response.json({
      society: {
        id: society.id,
        name: society.name,
        slug: society.slug,
        bio: society.bio || '',
        logoUrl: society.logo ? fileUrl('societies', society.id, society.logo) : '',
        bannerUrl: society.banner ? fileUrl('societies', society.id, society.banner) : '',
      },
      events,
      members,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: msg.includes('no matching record') ? 'Society not found' : 'Failed to fetch society data' }, { status: msg.includes('no matching record') ? 404 : 500 })
  }
}
