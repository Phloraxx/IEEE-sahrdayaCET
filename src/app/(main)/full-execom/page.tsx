import type { Metadata } from 'next'
import { APP_URL } from '@/lib/constants'
import { buildFileUrl } from '@/lib/pb'
import { logError } from '@/lib/logger'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { pbFetch } from '@/lib/pb'
import ExecomClient, { ExecomMemberDoc } from './ExecomClient'

export const revalidate = 300

const PB_URL = process.env.POCKETBASE_URL
const EXECOM_URL = `${APP_URL}/full-execom`

export const metadata: Metadata = {
  title: 'Execom Directory',
  description:
    'Meet the IEEE Sahrdaya Student Branch executive committee — browse all 60+ members across CS, RAS, WIE, PES, IAS and other societies. EXECOM 2026-2027.',
  openGraph: {
    title: 'Execom Directory | IEEE Sahrdaya',
    description:
      'Browse the full IEEE Sahrdaya EXECOM 2026-2027 directory — 60+ student leaders across all technical societies.',
    url: EXECOM_URL,
    images: [
      {
        url: '/web.png',
        width: 1200,
        height: 630,
        alt: 'IEEE Sahrdaya Execom',
      },
    ],
  },
  alternates: {
    canonical: EXECOM_URL,
  },
};

export default async function FullExecomPage() {
  let docs: ExecomMemberDoc[] = []

  try {
    if (!PB_URL) throw new Error('Missing POCKETBASE_URL')

    const data = await pbFetch<{ items: Record<string, unknown>[] }>(`${PB_URL}/api/collections/execom/records?perPage=100&sort=order&skipTotal=1&fields=id,order,name,department,batch,position,category,section,sectionId,photo,linkedin,instagram,email,phone`)
    docs = (data?.items || []).map((raw: Record<string, unknown>, i: number) => {
      const doc = raw as { id: string; order?: number; name?: string; department?: string; batch?: string; position?: string; category?: string; section?: string; sectionId?: string; photo?: string; linkedin?: string; instagram?: string; email?: string; phone?: string }
      return {
        id: doc.id,
        order: doc.order || 0,
        slNo: doc.order || (i + 1),
        name: doc.name || '',
        department: doc.department || '',
        semester: doc.batch || '',
        position: doc.position || '',
        category: doc.category || '',
        section: doc.section || '',
        sectionId: doc.sectionId || '',
        photoUrl: doc.photo ? buildFileUrl('execom', doc.id, doc.photo) : '',
        linkedin: doc.linkedin,
        instagram: doc.instagram,
        email: doc.email,
        phone: doc.phone,
      }
    })
  } catch (e) {
    logError('full-execom', e)
  }

  return (
    <ErrorBoundary>
      <ExecomClient initialDocs={docs} />
    </ErrorBoundary>
  );
}
