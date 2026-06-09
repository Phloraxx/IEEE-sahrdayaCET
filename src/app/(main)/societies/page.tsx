import { buildFileUrl } from '@/lib/pb'
import { logError } from '@/lib/logger'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import SocietiesClient from './SocietiesClient'
import type { Society } from '@/types'

export const revalidate = 300

export const metadata = {
  title: 'Societies | IEEE Sahrdaya Student Branch',
  description: 'Explore the technical societies under IEEE Sahrdaya Student Branch',
}

export default async function SocietiesPage() {
  let societies: Society[] = []

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `${process.env.POCKETBASE_URL}/api/collections/societies/records?skipTotal=1&fields=id,name,slug,bio,logo&filter=${encodeURIComponent('isHidden=false')}`,
      { signal: controller.signal },
    )
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      societies = (data.items || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        slug: s.slug as string,
        bio: s.bio as string | undefined,
        logoUrl: s.logo
          ? buildFileUrl('societies', s.id as string, s.logo as string)
          : undefined,
      }))
    }
  } catch (e) {
    logError('societies-page', e)
  }

  return (
    <ErrorBoundary>
      <SocietiesClient societies={societies} />
    </ErrorBoundary>
  )
}
