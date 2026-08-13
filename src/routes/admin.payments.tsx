import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ReceiptText,
  Search,
} from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAdminPaymentDesk,
  type AdminRegistrationOperationRow,
} from "@/lib/data/admin-event-operations.client";
import { listAdminRegistrations } from "@/lib/data/admin-registrations.client";
import { formatDateTime } from "@/lib/dates";
const money = (value: number) => `₹${Math.max(0, value || 0).toLocaleString("en-IN")}`;

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-2.5"><Icon className="h-4 w-4 text-primary" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentRow({ row, onResolve }: { row: AdminRegistrationOperationRow; onResolve?: (row: AdminRegistrationOperationRow) => void }) {
  const paidCancelled = row.registrationStatus === "cancelled" && row.paymentStatus === "paid";
  return (
    <div className={`grid gap-3 rounded-xl border p-4 lg:grid-cols-[1.3fr_1.1fr_120px_150px_auto] lg:items-center ${row.manualReview || paidCancelled ? "border-amber-500/30 bg-amber-500/5" : "border-border"}`}>
      <div className="min-w-0">
        <Link to={`/admin/registrations/${row.id}`} className="truncate text-sm font-semibold hover:underline">{row.userName || "Unnamed attendee"}</Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.userEmail}</p>
      </div>      <div className="min-w-0">
        <Link to={`/admin/events/${row.event}`} className="line-clamp-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">{row.eventTitle || "Unknown event"}</Link>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{row.provider} · {row.providerStatus || row.paymentStatus}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={row.registrationStatus} kind="registration" />
        <StatusBadge status={row.paymentStatus} kind="payment" />
      </div>
      <div>
        <p className="font-mono text-sm font-semibold tabular-nums">{money(row.amount)}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(row.registrationDate)}</p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {row.manualConfirmation && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Manual</span>}
        {onResolve && (
          <Button size="sm" variant={row.manualReview || paidCancelled ? "default" : "outline"} onClick={() => onResolve(row)}>
            Resolve
          </Button>
        )}
      </div>
      {(row.reviewReason || paidCancelled) && (
        <p className="text-xs text-amber-700 lg:col-span-5 dark:text-amber-300">
          {row.reviewReason || "Payment is marked paid while the registration is cancelled."}
        </p>
      )}
    </div>
  );
}
export default function AdminPayments() {
  const [search, setSearch] = useState("");
  const desk = useQuery({
    queryKey: ["admin-payment-desk"],
    queryFn: getAdminPaymentDesk,
    refetchInterval: 20_000,
  });
  const paid = useQuery({
    queryKey: ["admin-payment-records", search],
    queryFn: () => listAdminRegistrations({
      page: 1,
      perPage: 100,
      paymentStatus: "paid",
      search,
    }),
  });

  if (desk.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-72" /></div>;
  }
  if (!desk.data) {
    return <Card><CardContent className="p-8"><p className="font-semibold">Could not load payment operations.</p></CardContent></Card>;
  }

  const { summary } = desk.data;
  return (
    <div className="space-y-7">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8">
        <div className="absolute inset-0 vh-grid-bg opacity-30" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Finance operations</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Payment Desk</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">One cross-event queue for collections, manual confirmations, pending payments, refunds and records that require an organizer decision.</p>
        </div>
      </div>      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Recorded collected" value={money(summary.paidAmount)} detail={`${summary.paidCount} paid registrations`} icon={Banknote} />
        <Metric label="Provider confirmed" value={money(summary.providerPaidAmount)} detail={`${summary.providerPaidCount} processor/PayGate`} icon={CheckCircle2} />
        <Metric label="Manual confirmed" value={money(summary.manualPaidAmount)} detail={`${summary.manualPaidCount} admin overrides`} icon={BadgeCheck} />
        <Metric label="Refunded / recorded" value={money(summary.refundedAmount)} detail={`${summary.refundedCount} refund records`} icon={ReceiptText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardContent className="p-6">
            <PanelHeader
              eyebrow="Exception queue"
              title="Payments requiring attention"
              description="These states stay visible until an organizer resolves them inside the event workspace."
            />
            <div className="mt-5 space-y-2">
              {desk.data.attention.length ? desk.data.attention.map((row) => (
                <PaymentRow key={row.id} row={row} onResolve={(item) => { window.location.href = `/admin/events/${item.event}`; }} />
              )) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">Nothing needs attention right now.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <PanelHeader eyebrow="Ledger notes" title="What these numbers mean" />
            <div className="mt-5 space-y-3 text-sm text-muted-foreground">
              <p className="rounded-xl bg-muted/40 p-3 leading-relaxed">{desk.data.financeDisclaimer}</p>
              <p><strong className="text-foreground">Recorded collected</strong> means registrations currently marked paid.</p>
              <p><strong className="text-foreground">Manual confirmed</strong> means a human admin asserted receipt; it is kept distinct from provider truth.</p>
              <p><strong className="text-foreground">Paid + cancelled</strong> remains an exception until restored or recorded as refunded.</p>
            </div>
          </CardContent>
        </Card>
      </div>      <Card>
        <CardContent className="p-6">
          <PanelHeader eyebrow="Paid ledger" title="Who has paid" description="Latest paid registrations across every event." />
          <div className="mt-5 relative max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or ticket" className="pl-9" />
          </div>
          <div className="mt-5 space-y-2">
            {paid.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : paid.data?.registrations.length ? (
              paid.data.registrations.map((row) => <PaymentRow key={row.id} row={row} />)
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">No paid records match this search.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
