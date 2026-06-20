import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'

export default async function AdminGuard({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await requireRole(['admin', 'chair'])
  } catch {
    redirect('/')
  }

  return <>{children}</>
}
