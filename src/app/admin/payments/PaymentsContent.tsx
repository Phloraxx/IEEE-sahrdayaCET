import { createPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PB_AUTH_COOKIE } from '@/lib/constants'

export async function PaymentsContent() {
  const cookieStore = await cookies()
  const pb = createPB(`${PB_AUTH_COOKIE}=${cookieStore.get(PB_AUTH_COOKIE)?.value}`)

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
        {/* ── Stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">₹{totalRevenue}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Payments table ── */}
        <Card>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No payments yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Transaction ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.userName}</div>
                        <div className="text-xs text-muted-foreground">{p.userEmail}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">₹{p.amount}</TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={p.paymentStatus} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                        {p.transactionId ? p.transactionId.slice(0, 16) + '…' : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    )
  } catch {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Failed to load payments.
        </CardContent>
      </Card>
    )
  }
}

/* ── Small helper to pick the right badge variant ── */
function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return <Badge variant="success">Paid</Badge>
    case 'pending':
      return <Badge variant="warning">Pending</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
