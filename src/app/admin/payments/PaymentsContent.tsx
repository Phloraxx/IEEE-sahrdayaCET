import { createPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export async function PaymentsContent() {
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)

  try {
    const regs = await pb.collection('registrations').getFullList({
      filter: "paymentStatus != 'not_required'",
      sort: '-registrationDate',
      fields: 'id,userName,userEmail,paymentStatus,amount,registrationDate,paymentTicketId',
    })

    const payments = regs.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userName: (r.userName as string) || 'Unknown',
      userEmail: (r.userEmail as string) || '',
      paymentStatus: (r.paymentStatus as string) || 'pending',
      amount: Number(r.amount) || 0,
      transactionId: (r.paymentTicketId as string) || '',
      createdAt: (r.registrationDate as string) || '',
    }))

    const totalRevenue = payments.reduce((s, p) => s + (p.paymentStatus === 'paid' ? p.amount : 0), 0)
    const paidCount = payments.filter((p) => p.paymentStatus === 'paid').length
    const pendingCount = payments.filter((p) => p.paymentStatus === 'pending').length

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="card-hover">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">₹{totalRevenue}</div></CardContent>
          </Card>
          <Card className="card-hover">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-ieee-success">{paidCount}</div></CardContent>
          </Card>
          <Card className="card-hover">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-ieee-warning">{pendingCount}</div></CardContent>
          </Card>
        </div>

        <Card className="card-hover">
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No payments yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 text-left">
                      <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                      <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                      <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group">
                        <td className="px-4 py-3 relative">
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                          <p className="text-sm font-medium">{p.userName}</p>
                          <p className="text-xs text-muted-foreground">{p.userEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">₹{p.amount}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.paymentStatus === 'paid' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                            {p.paymentStatus}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground font-mono">
                          {p.transactionId ? p.transactionId.slice(0, 16) + '...' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  } catch {
    return <div className="py-12 text-center text-sm text-muted-foreground">Failed to load payments.</div>
  }
}
