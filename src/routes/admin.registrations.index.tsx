import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Download,
  Eye,
  Search,
  UserCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  confirmRegistrationPayment,
  listAdminRegistrations,
  runRegistrationAdminCommand,
} from "@/lib/data/admin-registrations.client";
import { listAdminEvents } from "@/lib/data/admin-events.client";
import { getPbClient } from "@/lib/pb-client";
import { streamAdminRegistrationsCSV } from "@/lib/csv-export";
import { formatDateTime } from "@/lib/dates";

type RegistrationRow = Awaited<ReturnType<typeof listAdminRegistrations>>["registrations"][number];
const money = (value: number) => `₹${Math.max(0, value || 0).toLocaleString("en-IN")}`;

function QueueSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source !== "admin") return null;
  return <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Manual entry</span>;
}

function ProviderBadge({ provider }: { provider: string }) {
  return <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{provider || "legacy"}</span>;
}
export default function AdminRegistrations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState(searchParams.get("event") || "all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get("payment") || "all");
  const [source, setSource] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(searchParams.get("attention") === "1");
  const [page, setPage] = useState(1);
  const perPage = 40;

  useEffect(() => {
    setStatus(searchParams.get("status") || "all");
    setEventId(searchParams.get("event") || "all");
    setPaymentStatus(searchParams.get("payment") || "all");
    setAttentionOnly(searchParams.get("attention") === "1");
  }, [searchParams]);

  const events = useQuery({
    queryKey: ["admin-events-filter"],
    queryFn: () => listAdminEvents({ page: 1, perPage: 100 }),
  });
  const registrations = useQuery({
    queryKey: ["admin-registrations", { search, eventId, status, paymentStatus, source, attentionOnly, page }],
    queryFn: () => listAdminRegistrations({
      page,
      perPage,
      eventId: eventId === "all" ? undefined : eventId,
      status,
      paymentStatus,
      source,
      attentionOnly,
      search,
    }),
  });  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
    queryClient.invalidateQueries({ queryKey: ["admin-event-operations"] });
    queryClient.invalidateQueries({ queryKey: ["admin-payment-desk"] });
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const checkInMutation = useMutation({
    mutationFn: (id: string) => runRegistrationAdminCommand(id, "check-in"),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Could not check in attendee"),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => runRegistrationAdminCommand(id, "cancel"),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Could not cancel registration"),
  });
  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmRegistrationPayment(id),
    onSuccess: () => {
      invalidate();
      toast.success("Payment confirmed and notifications queued");
    },
    onError: (error: Error) => toast.error(error.message || "Could not confirm payment"),
  });

  const exportLedger = async () => {
    const stream = await streamAdminRegistrationsCSV(getPbClient());
    const blob = await new Response(stream).blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `ieee-registration-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  };
  const data = registrations.data;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Registration operations"
        title="Registration Queue"
        description={`${data?.total ?? 0} record${data?.total === 1 ? "" : "s"} match the current filters.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/admin/payments"><WalletCards className="h-4 w-4" />Payment Desk</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportLedger()}>
              <Download className="h-4 w-4" />Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 lg:grid-cols-[minmax(260px,1fr)_220px_170px_170px_160px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Name, email, phone or ticket"
            className="pl-9"
          />
        </div>
        <Select value={eventId} onValueChange={(value) => { setEventId(value); setPage(1); }}>
          <SelectTrigger><SelectValue placeholder="All events" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {events.data?.events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}
          </SelectContent>
        </Select>        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All registration states</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentStatus} onValueChange={(value) => { setPaymentStatus(value); setPage(1); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment states</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="not_required">Not required</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(value) => { setSource(value); setPage(1); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="self_service">Self-service</SelectItem>
            <SelectItem value="admin">Manual/admin</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={attentionOnly ? "default" : "outline"}
          className="gap-2"
          onClick={() => { setAttentionOnly((value) => !value); setPage(1); }}
        >
          <AlertTriangle className="h-4 w-4" /> Attention
        </Button>
      </div>
      {registrations.isLoading ? (
        <QueueSkeleton />
      ) : !data?.registrations.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No registrations match these filters</p>
          <p className="text-xs text-muted-foreground">Try clearing one or more filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.registrations.map((row) => (
            <QueueRow
              key={row.id}
              row={row}
              isAdmin={isAdmin}
              busy={checkInMutation.isPending || cancelMutation.isPending || confirmMutation.isPending}
              onCheckIn={(id) => checkInMutation.mutate(id)}
              onCancel={(id) => cancelMutation.mutate(id)}
              onConfirm={(id) => confirmMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {data && data.total > perPage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {Math.ceil(data.total / perPage)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
function QueueRow({
  row,
  isAdmin,
  busy,
  onCheckIn,
  onCancel,
  onConfirm,
}: {
  row: RegistrationRow;
  isAdmin: boolean;
  busy: boolean;
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
}) {
  const paidCancelled = row.registrationStatus === "cancelled" && row.paymentStatus === "paid";
  const needsAttention = row.manualReview || paidCancelled || (row.registrationStatus === "pending" && row.paymentStatus === "pending");

  return (
    <div className={`rounded-xl border p-4 transition-colors ${needsAttention ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card hover:bg-muted/20"}`}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1.15fr_150px_130px_190px] lg:items-center">
        <div className="min-w-0">
          <Link to={`/admin/registrations/${row.id}`} className="truncate text-sm font-semibold hover:underline">{row.userName || "Unnamed attendee"}</Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.userEmail || "No email"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><SourceBadge source={row.registrationSource} /><ProviderBadge provider={row.provider} /></div>
        </div>
        <div className="min-w-0">
          <Link to={`/admin/events/${row.eventId}`} className="line-clamp-1 text-sm font-medium text-foreground hover:underline">{row.eventTitle || "Unknown event"}</Link>
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.createdAt || row.registrationDate)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={row.registrationStatus} kind="registration" />
          <StatusBadge status={row.paymentStatus} kind="payment" />
        </div>
        <div>
          <p className="font-mono text-sm font-semibold tabular-nums">{row.amount > 0 ? money(row.amount) : "Free"}</p>
          {row.couponCode && <p className="mt-0.5 text-[10px] text-muted-foreground">Coupon {row.couponCode}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-start gap-1 lg:justify-end">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
            <Link to={`/admin/registrations/${row.id}`}><Eye className="h-3.5 w-3.5" />View</Link>
          </Button>
          {isAdmin && row.registrationStatus === "pending" && row.paymentStatus === "pending" && row.amount > 0 && (
            <ConfirmButton
              label="Confirm payment"
              confirmMessage={`Confirm ${money(row.amount)} received and issue this attendee's ticket?`}
              variant="outline"
              className="h-8 gap-1.5 border-success/30 text-xs text-success"
              icon={<BadgeCheck className="h-3.5 w-3.5" />}
              disabled={busy}
              onConfirm={() => { onConfirm(row.id); return true; }}
            />
          )}          {!row.checkedIn && row.registrationStatus === "confirmed" && (
            <ConfirmButton
              label="Check in"
              confirmMessage="Check in this attendee?"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              icon={<UserCheck className="h-3.5 w-3.5" />}
              disabled={busy}
              onConfirm={() => { onCheckIn(row.id); return true; }}
            />
          )}
          {row.registrationStatus !== "cancelled" && !row.checkedIn && (
            <ConfirmButton
              label="Cancel"
              confirmMessage="Cancel this registration? Paid records remain visible for finance review."
              variant="destructive"
              className="h-8 text-xs"
              disabled={busy}
              onConfirm={() => { onCancel(row.id); return true; }}
            />
          )}
          {needsAttention && (
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link to={`/admin/events/${row.eventId}`}>Resolve</Link>
            </Button>
          )}
        </div>
      </div>
      {(row.reviewReason || paidCancelled) && (
        <p className="mt-3 border-t border-border/70 pt-3 text-xs text-amber-700 dark:text-amber-300">
          {row.reviewReason || "Payment is marked paid while this registration is cancelled."}
        </p>
      )}
    </div>
  );
}
