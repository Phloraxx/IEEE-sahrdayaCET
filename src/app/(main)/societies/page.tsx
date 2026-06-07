import SocietiesClient from './SocietiesClient'
import type { Society } from '@/types'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Societies | IEEE Sahrdaya Student Branch',
  description: 'Explore the technical societies under IEEE Sahrdaya Student Branch',
}

export default async function SocietiesPage() {
  let societies: Society[] = []

  try {
    const res = await fetch(
      `${process.env.POCKETBASE_URL}/api/collections/societies/records?sort=displayOrder&skipTotal=1&fields=id,name,slug,bio,logo`,
    )
    if (res.ok) {
      const data = await res.json()
      societies = (data.items || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        slug: s.slug as string,
        bio: s.bio as string | undefined,
        logoUrl: s.logo
          ? `${process.env.POCKETBASE_URL}/api/files/societies/${s.id}/${s.logo}`
          : undefined,
      }))
    }
  } catch (e) {
    console.error('Failed to fetch societies:', e)
  }

  return <SocietiesClient societies={societies} />
}
