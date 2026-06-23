"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";

export interface PaymentRow {
  id: string;
  userName: string;
  userEmail: string;
  paymentStatus: string;
  amount: number;
  transactionId: string;
  createdAt: string;
}

export interface PaymentsData {
  payments: PaymentRow[];
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
}

export default function PaymentsContent({ data }: { data: PaymentsData }) {
  const { payments, totalRevenue, paidCount, pendingCount } = data;

  return (
    <div className="space-y-6">
      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="py-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{totalRevenue}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
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
                  <TableHead className="hidden sm:table-cell">
                    Transaction ID
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.userName}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.userEmail}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      ₹{p.amount}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.paymentStatus} kind="payment" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {p.transactionId
                        ? `${p.transactionId.slice(0, 16)  }…`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

