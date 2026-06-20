import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'

export const Route = createFileRoute('/admin/registrations')({
  component: RegistrationsPage,
})

function RegistrationsPage() {
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['admin-registrations'],
    queryFn: async () => {
      const result = await pb.collection('registrations').getList(1, 50, {
        sort: '-created',
        expand: 'event,user',
      })
      return result.items
    },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Registrations</h2>

      {isLoading ? (
        <LoadingSpinner />
      ) : registrations?.length ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Ticket ID</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {registrations.map((reg) => {
                  const r = reg as Record<string, unknown>
                  const expand = (r.expand as Record<string, unknown>) || {}
                  const event = (expand.event as Record<string, unknown>) || {}
                  const user = (expand.user as Record<string, unknown>) || {}
                  return (
                    <tr key={r.id as string} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{r.ticketId as string}</td>
                      <td className="px-4 py-3">{(user.name as string) || '-'}</td>
                      <td className="px-4 py-3">{(event.title as string) || '-'}</td>
                      <td className="px-4 py-3">
                        <RegistrationStatusBadge status={r.registrationStatus as string} />
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={r.paymentStatus as string} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No registrations found.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RegistrationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    not_required: 'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
      {status === 'not_required' ? 'Free' : status}
    </span>
  )
}
