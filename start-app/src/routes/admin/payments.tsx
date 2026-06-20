import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'
import { IndianRupee } from 'lucide-react'

export const Route = createFileRoute('/admin/payments')({
  component: PaymentsPage,
})

function PaymentsPage() {
  const { data: registrations, isLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const result = await pb.collection('registrations').getList(1, 50, {
        filter: 'paymentStatus = "paid"',
        sort: '-created',
        expand: 'event,user',
      })
      return result.items
    },
  })

  const totalRevenue = (registrations as Record<string, unknown>[] || []).reduce(
    (sum, r) => sum + ((r.amount as number) || 0),
    0,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Payments</h2>
        <Card className="px-6 py-3">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-ieee-success" />
            <span className="text-2xl font-bold">{totalRevenue.toLocaleString('en-IN')}</span>
            <span className="text-sm text-muted-foreground">total revenue</span>
          </div>
        </Card>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(registrations as Record<string, unknown>[])?.map((r) => {
                  const expand = (r.expand as Record<string, unknown>) || {}
                  const event = (expand.event as Record<string, unknown>) || {}
                  const user = (expand.user as Record<string, unknown>) || {}
                  return (
                    <tr key={r.id as string} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{new Date(r.created as string).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{(user.name as string) || '-'}</td>
                      <td className="px-4 py-3">{(event.title as string) || '-'}</td>
                      <td className="px-4 py-3 font-medium">₹{(r.amount as number) || 0}</td>
                      <td className="px-4 py-3">
                        <Badge variant="default">{r.paymentStatus as string}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
