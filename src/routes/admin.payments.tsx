import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminPaymentDesk } from "@/lib/data/admin-event-operations.client";
import { listAdminPayments, type AdminPaymentLedgerRow } from "@/lib/data/admin-payments.client";
import { formatDateTime } from "@/lib/dates";

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2,
}).format(Math.max(0, value || 0));

function providerLabel(provider: string) {
  if (provider === "razorpay") return "Historical provider";
  if (provider === "paygate") return "PayGate";
  if (provider === "manual") return "Manual";
  if (provider === "legacy_paygate") return "Legacy PayGate";
  return provider || "Unknown";
}

function PaymentRow({ row, attention = false }: { row: AdminPaymentLedgerRow; attention?: boolean }) {
  return <div className="grid gap-3 border-b border-border px-4 py-3.5 last:border-b-0 lg:grid-cols-[1.2fr_1fr_190px_150px_120px] lg:items-center">
    <div className="min-w-0">
      <Link to={`/admin/registrations/${row.registrationId}`} className="truncate text-sm font-medium hover:underline">{row.attendeeName || "Unnamed attendee"}</Link>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.attendeeEmail || row.registrationId}</p>
    </div>
    <div className="min-w-0">
      <Link to={`/admin/events/${row.eventId}`} className="truncate text-xs font-medium text-muted-foreground hover:text-foreground">{row.eventTitle || "Unknown event"}</Link>
      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{providerLabel(row.provider)}{row.paymentMethod ? ` · ${row.paymentMethod}` : ""}</p>
      {(row.capturedPaymentId || row.providerOrderId) && <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{row.capturedPaymentId || row.providerOrderId}</p>}
    </div>
    <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
      <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Fee</p><p>{money(row.feeAmount)}</p></div>
      <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Collected</p><p className="font-semibold">{money(row.collectedAmount)}</p></div>
      <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Refunded</p><p>{money(row.refundedAmount)}</p></div>
    </div>
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={row.manualReview ? "destructive" : "outline"}>{row.status.replaceAll("_", " ")}</Badge>
      {row.registrationStatus && <StatusBadge status={row.registrationStatus} kind="registration" />}
    </div>
    <div className="text-right"><p className="text-[10px] text-muted-foreground">{formatDateTime(row.capturedAt || row.createdAt)}</p>{attention && <Link to={`/admin/registrations/${row.registrationId}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">Resolve</Link>}</div>
    {(row.reviewReason || attention) && <p className="text-xs text-warning lg:col-span-5">{row.reviewReason || "This financial state requires administrator review."}</p>}
  </div>;
}

export default function AdminPayments() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const desk = useQuery({ queryKey: ["admin-payment-desk"], queryFn: getAdminPaymentDesk, refetchInterval: 20_000 });
  const ledger = useQuery({ queryKey: ["admin-payment-ledger", search, page], queryFn: () => listAdminPayments({ page, perPage: 40, search }) });
  const attention = useQuery({ queryKey: ["admin-payment-attention"], queryFn: () => listAdminPayments({ page: 1, perPage: 25, attentionOnly: true }), refetchInterval: 20_000 });
  if (desk.isLoading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  if (!desk.data) return <div className="rounded-lg border border-border p-8">Could not load payment operations.</div>;
  const { summary } = desk.data;
  const metrics = [
    ["Gross collected", money(summary.grossCollectedAmount), `${summary.paymentCount} ledger records`],
    ["Net after refunds", money(summary.netCollectedAmount), "Recorded collection minus completed refunds"],
    ["Refunded", money(summary.refundedAmount), "Completed refunds recorded in the ledger"],
    ["Needs attention", String(summary.attentionCount), `${money(summary.historicalCollectedAmount)} in preserved history`],
  ];
  return <div className="space-y-7">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium text-muted-foreground">Operate</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Payment Desk</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Canonical financial ledger for PayGate, manual confirmations and preserved historical provider records.</p></div>
      <Banknote className="hidden h-5 w-5 text-muted-foreground sm:block" />
    </div>
    <div className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value, detail], index) => <div key={label} className={`p-4 ${index < metrics.length - 1 ? "border-b border-border sm:border-r xl:border-b-0" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-border bg-card p-3 text-xs"><span className="text-muted-foreground">PayGate</span><p className="mt-1 font-mono font-semibold">{money(summary.paygateCollectedAmount)} · {summary.paygateCount}</p></div>
      <div className="rounded-lg border border-border bg-card p-3 text-xs"><span className="text-muted-foreground">Manual</span><p className="mt-1 font-mono font-semibold">{money(summary.manualCollectedAmount)} · {summary.manualCount}</p></div>
      <div className="rounded-lg border border-border bg-card p-3 text-xs"><span className="text-muted-foreground">Historical providers</span><p className="mt-1 font-mono font-semibold">{money(summary.historicalCollectedAmount)} · {summary.historicalCount}</p></div>
    </div>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="text-sm font-semibold">Needs attention</h2><p className="text-xs text-muted-foreground">Partial refunds, exhausted refund retries, disputes and explicit review flags</p></div><span className="font-mono text-xs">{summary.attentionCount}</span></div>
      {attention.isLoading ? <div className="p-4"><Skeleton className="h-16" /></div> : attention.data?.payments.length ? attention.data.payments.map((row) => <PaymentRow key={row.id} row={row} attention />) : <div className="px-4 py-10 text-center text-sm text-muted-foreground">No payment exceptions right now.</div>}
    </section>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Ledger</h2><p className="text-xs text-muted-foreground">Fee, actually collected amount and refunded amount are stored separately in integer paise.</p></div>
      <div className="border-b border-border p-4"><div className="relative max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search attendee, event, ticket, Order ID or Payment ID" className="pl-9" /></div></div>
      {ledger.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div> : ledger.data?.payments.length ? ledger.data.payments.map((row) => <PaymentRow key={row.id} row={row} />) : <div className="px-4 py-12 text-center text-sm text-muted-foreground">No payment records match this search.</div>}
      {ledger.data && ledger.data.total > ledger.data.perPage && <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-xs text-muted-foreground">Page {ledger.data.page} · {ledger.data.total} records</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-3.5 w-3.5" />Previous</Button><Button size="sm" variant="outline" disabled={!ledger.data.hasMore} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-3.5 w-3.5" /></Button></div></div>}
    </section>
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{desk.data.financeDisclaimer}</p></div>
  </div>;
}
