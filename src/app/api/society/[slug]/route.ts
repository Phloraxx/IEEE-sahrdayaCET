import { createPB } from '@/lib/pb'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const pb = createPB()

  try {
    const society = await pb.collection('societies').getFirstListItem(`slug="${slug}"`, {
      fields: 'id,name,slug,bio,logo,banner',
    })

    const [eventsResult, membersResult] = await Promise.allSettled([
      pb.collection('events').getFullList({
        filter: `society="${society.id}"`,
        sort: '-date',
        fields: 'id,title,description,date,venue,price,status,maxCapacity,banner',
      }),
      pb.collection('execom').getFullList({
        filter: `sectionId="${slug}"`,
        sort: 'order',
        fields: 'id,order,name,department,batch,position,photo,linkedin,instagram,email,phone',
      }),
    ])

    const events = eventsResult.status === 'fulfilled'
      ? eventsResult.value.map((e: Record<string, unknown>) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          venue: e.venue,
          description: e.description,
          price: (e.price as number) || 0,
          status: e.status || 'published',
          maxCapacity: (e.maxCapacity as number) || 0,
          bannerUrl: e.banner
            ? `${process.env.POCKETBASE_URL}/api/files/events/${e.id}/${e.banner}`
            : '',
        }))
      : []

    const members = membersResult.status === 'fulfilled'
      ? membersResult.value.map((doc: Record<string, unknown>) => ({
          slNo: (doc.order as number) || 0,
          name: (doc.name as string) || '',
          department: (doc.department as string) || '',
          semester: (doc.batch as string) || '',
          position: (doc.position as string) || '',
          photoUrl: doc.photo
            ? `${process.env.POCKETBASE_URL}/api/files/execom/${doc.id}/${doc.photo}`
            : '',
          linkedin: (doc.linkedin as string) || '',
          instagram: (doc.instagram as string) || '',
          email: (doc.email as string) || '',
          phone: (doc.phone as string) || '',
        }))
      : []

    return Response.json({
      society: {
        id: society.id,
        name: society.name,
        slug: society.slug,
        bio: society.bio || '',
        logoUrl: society.logo
          ? `${process.env.POCKETBASE_URL}/api/files/societies/${society.id}/${society.logo}`
          : '',
        bannerUrl: society.banner
          ? `${process.env.POCKETBASE_URL}/api/files/societies/${society.id}/${society.banner}`
          : '',
      },
      events,
      members,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('no matching record')) {
      return Response.json({ error: 'Society not found' }, { status: 404 })
    }
    return Response.json({ error: 'Failed to fetch society data' }, { status: 500 })
  }
}
