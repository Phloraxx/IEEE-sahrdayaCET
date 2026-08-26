import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  History,
  Loader2,
  Settings2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { EventCancelDialog } from "@/components/admin/event-cancel-dialog";
import { EventTeamPanel } from "@/features/admin/events/event-team-panel";
import { EventWorkflowPanel } from "@/features/admin/events/event-workflow-panel";
import { useAuth } from "@/lib/auth-context";
import { getPbClient } from "@/lib/pb-client";
import { csvFilename, streamRegistrationsCSV } from "@/lib/csv-export";
import { formatDateTime } from "@/lib/dates";
import {
  createManualRegistration,
  getAdminEventOperations,
  recomputeEventOperations,
  runAdminRegistrationCommand,
  type AdminRegistrationOperationRow,
  type RegistrationAdminAction,
} from "@/lib/data/admin-event-operations.client";
import { listAdminRegistrations } from "@/lib/data/admin-registrations.client";
import { cancelAdminEvent } from "@/lib/data/admin-events.client";
import { runEventWorkflow } from "@/lib/data/workspace.client";

type Tab = "overview" | "attendees" | "payments" | "coupons" | "team" | "activity";
const VALID_TABS: Tab[] = ["overview", "attendees", "payments", "coupons", "team", "activity"];

const money = (value: number) => `₹${Math.max(0, value || 0).toLocaleString("en-IN")}`;
function OpsMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-2.5">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderPill({ provider }: { provider: string }) {
  const labels: Record<string, string> = {
    razorpay: "Razorpay",
    legacy_paygate: "Legacy PayGate",
    paygate: "Kotak via PayGate",
    manual: "Manual",
    not_required: "No payment",
    unknown: "Legacy",
  };
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {labels[provider] || provider}
    </span>
  );
}

function RegistrationIdentity({ row }: { row: AdminRegistrationOperationRow }) {
  return (
    <div className="min-w-0">
      <Link
        to={`/admin/registrations/${row.id}`}
        className="truncate text-sm font-semibold text-foreground hover:underline"
      >
        {row.userName || "Unnamed attendee"}
      </Link>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.userEmail || "No email"}</p>
    </div>
  );
}

interface ManualFormState {
  name: string;
  email: string;
  phone: string;
  paymentMode: "paid" | "pending" | "waived";
  paymentReference: string;
  amountOverride: string;
  note: string;
  capacityOverride: boolean;
}

const EMPTY_MANUAL: ManualFormState = {
  name: "",
  email: "",
  phone: "",
  paymentMode: "pending",
  paymentReference: "",
  amountOverride: "",
  note: "",
  capacityOverride: false,
};
function ManualRegistrationDialog({
  open,
  onOpenChange,
  eventPrice,
  eventFull,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventPrice: number;
  eventFull: boolean;
  pending: boolean;
  onSubmit: (value: ManualFormState) => void;
}) {
  const [form, setForm] = useState<ManualFormState>(EMPTY_MANUAL);
  const set = <K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setForm(EMPTY_MANUAL);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add attendee manually</DialogTitle>
          <DialogDescription>
            Create a walk-in/offline registration with an audited payment state. The event price is {money(eventPrice)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="manual-name">Name</Label>
            <Input id="manual-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="manual-email">Email</Label>
            <Input id="manual-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="manual-phone">Phone</Label>
            <Input id="manual-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Payment</Label>
            <Select value={form.paymentMode} onValueChange={(v) => set("paymentMode", v as ManualFormState["paymentMode"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Already paid offline</SelectItem>
                <SelectItem value="pending">Payment pending</SelectItem>
                <SelectItem value="waived">Waive fee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="manual-reference">Payment reference</Label>
            <Input id="manual-reference" value={form.paymentReference} onChange={(e) => set("paymentReference", e.target.value)} placeholder="UTR / receipt / note" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="manual-amount">Amount override</Label>
            <Input id="manual-amount" type="number" min={0} step={1} value={form.amountOverride} onChange={(e) => set("amountOverride", e.target.value)} placeholder={String(eventPrice)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="manual-note">Internal note</Label>
          <Textarea
            id="manual-note"
            rows={3}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Why this registration/payment is being entered manually"
          />
        </div>
        {eventFull && (
          <label className="mt-2 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.capacityOverride}
              onChange={(e) => set("capacityOverride", e.target.checked)}
            />
            <span>
              <strong>Override capacity.</strong> This event is currently full. A note is required and the override will be audited.
            </span>
          </label>
        )}
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={pending || !form.name.trim() || !form.email.trim()}
            className="gap-2"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create registration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ResolutionState {
  row: AdminRegistrationOperationRow;
  action: RegistrationAdminAction;
  title: string;
}

function ResolutionDialog({
  state,
  onClose,
  pending,
  onSubmit,
}: {
  state: ResolutionState | null;
  onClose: () => void;
  pending: boolean;
  onSubmit: (input: { note: string; reference: string; capacityOverride: boolean }) => void;
}) {
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [capacityOverride, setCapacityOverride] = useState(false);
  const requiresNote = state?.action === "restore" || state?.action === "mark-refunded" || state?.action === "reopen-manual-payment";
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title || "Registration action"}</DialogTitle>
          <DialogDescription>
            {state ? `${state.row.userName} · ${money(state.row.amount)} · ${state.row.provider}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="resolution-reference">Reference</Label>
            <Input id="resolution-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR, refund reference, receipt…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="resolution-note">Internal note {requiresNote ? "*" : ""}</Label>
            <Textarea id="resolution-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {state?.action === "restore" && (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={capacityOverride} onChange={(e) => setCapacityOverride(e.target.checked)} />
              <span>Allow an explicit capacity override if the event is currently full.</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            variant={state?.action === "mark-refunded" ? "destructive" : "default"}
            disabled={pending || (requiresNote && !note.trim())}
            onClick={() => onSubmit({ note, reference, capacityOverride })}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminEventOperationsRoute() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as Tab | null;
  const tab: Tab = requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : "overview";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab"); else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [manualOpen, setManualOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resolution, setResolution] = useState<ResolutionState | null>(null);
  const [search, setSearch] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [attendeePage, setAttendeePage] = useState(1);

  const operations = useQuery({
    queryKey: ["admin-event-operations", id],
    queryFn: () => getAdminEventOperations(id),
    enabled: Boolean(id),
    refetchInterval: tab === "overview" || tab === "payments" ? 20_000 : false,
  });
  const registrations = useQuery({
    queryKey: ["admin-event-registrations", id, search, registrationStatus, paymentStatus, attendeePage],
    queryFn: () => listAdminRegistrations({
      page: attendeePage,
      perPage: 40,
      eventId: id,
      search,
      status: registrationStatus,
      paymentStatus,
    }),
    enabled: Boolean(id) && tab === "attendees",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-event-operations", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-event-registrations", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-payment-desk"] });
  };
  const manualMutation = useMutation({
    mutationFn: (form: ManualFormState) => createManualRegistration(id, {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      paymentMode: form.paymentMode,
      paymentReference: form.paymentReference.trim() || undefined,
      amountOverride: form.amountOverride === "" ? undefined : Number(form.amountOverride),
      capacityOverride: form.capacityOverride,
      note: form.note.trim() || undefined,
    }),
    onSuccess: () => {
      setManualOpen(false);
      invalidate();
      toast.success("Manual registration created");
    },
    onError: (error: Error) => toast.error(error.message || "Could not create registration"),
  });

  const actionMutation = useMutation({
    mutationFn: (input: {
      row: AdminRegistrationOperationRow;
      action: RegistrationAdminAction;
      note?: string;
      reference?: string;
      capacityOverride?: boolean;
    }) => runAdminRegistrationCommand(input.row.id, {
      action: input.action,
      note: input.note,
      reference: input.reference,
      capacityOverride: input.capacityOverride,
    }),
    onSuccess: () => {
      setResolution(null);
      invalidate();
      toast.success("Registration updated");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update registration"),
  });

  const cancelEventMutation = useMutation({
    mutationFn: (reason: string) => cancelAdminEvent(id, reason),
    onSuccess: (result) => {
      setCancelOpen(false);
      invalidate();
      const parts: string[] = [];
      if (result.manualRefundRequired > 0) parts.push(`${result.manualRefundRequired} manual refund${result.manualRefundRequired === 1 ? "" : "s"} require attention`);
      toast.success(parts.length ? `Event cancelled. ${parts.join("; ")}.` : "Event cancelled and registrations reconciled");
    },
    onError: (error: Error) => toast.error(error.message || "Could not cancel event"),
  });

  const workflowMutation = useMutation({
    mutationFn: ({ action, note }: { action: "submit" | "approve" | "request_changes" | "finance_approve" | "finance_changes" | "publish" | "unpublish" | "complete"; note?: string }) =>
      runEventWorkflow(id, action, note),
    onSuccess: () => {
      invalidate();
      toast.success("Event workflow updated");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update event workflow"),
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeEventOperations(id),
    onSuccess: () => {
      invalidate();
      toast.success("Event counters reconciled");
    },
    onError: (error: Error) => toast.error(error.message || "Could not reconcile event"),
  });

  const exportRegistrations = async () => {
    const data = operations.data;
    if (!data) return;
    try {
      const stream = await streamRegistrationsCSV(getPbClient(), id, {
        adminFormat: true,
        event: { id, title: data.event.title },
      });
      const blob = await new Response(stream).blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = csvFilename(data.event.title, id);
      anchor.click();
      URL.revokeObjectURL(href);
      toast.success("Registration export prepared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export registrations");
    }
  };

  if (operations.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }
  if (operations.isError || !operations.data) {
    return <Card><CardContent className="p-8"><p className="font-semibold">Could not load event operations.</p></CardContent></Card>;
  }

  const { event, summary } = operations.data;
  const permissions = operations.data.permissions ?? {};
  const isPlatformAdmin = user?.role === "admin";
  const eventFull = event.maxCapacity > 0 && summary.active >= event.maxCapacity;
  const capacityPct = event.maxCapacity > 0 ? Math.min(100, Math.round((summary.active / event.maxCapacity) * 100)) : 0;
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    ...(permissions["registrations.view"] ? [{ id: "attendees" as Tab, label: "Attendees", count: summary.active }] : []),
    ...(permissions["finance.view"] ? [{ id: "payments" as Tab, label: "Payments", count: summary.paidCount }] : []),
    ...(permissions["events.edit"] ? [{ id: "coupons" as Tab, label: "Coupons", count: operations.data.coupons.length }] : []),
    ...(permissions["assignments.manage"] ? [{ id: "team" as Tab, label: "Event team" }] : []),
    ...(permissions["reports.view"] ? [{ id: "activity" as Tab, label: "Activity" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 vh-grid-bg opacity-30" aria-hidden="true" />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={event.status} kind="event" />
                <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {event.price > 0
                    ? `${money(event.price)} · ${event.paymentProvider === "kotak" ? "Kotak direct UPI" : "Razorpay"}`
                    : "Free event"}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${event.registrationOpen ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  Registration {event.registrationOpen ? "open" : "closed"}
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{event.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDateTime(event.date)}</span>
                <span>{event.venue || "Venue not set"}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissions["registrations.view"] && <Button variant="outline" size="sm" className="gap-2" onClick={() => void exportRegistrations()}>
                <Download className="h-4 w-4" /> Export
              </Button>}
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to={`/events/${event.slug}`} target="_blank">Public page <ArrowUpRight className="h-4 w-4" /></Link>
              </Button>
              {permissions["events.edit"] && <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to={`/admin/events/${event.id}/edit`}><Settings2 className="h-4 w-4" /> Settings</Link>
              </Button>}
              {permissions["events.cancel"] && event.status !== "cancelled" && (
                <Button variant="destructive" size="sm" className="gap-2" onClick={() => setCancelOpen(true)}>
                  <XCircle className="h-4 w-4" /> Cancel event
                </Button>
              )}
              {permissions["registrations.manual"] && (
                <Button size="sm" className="gap-2" onClick={() => setManualOpen(true)}>
                  <Plus className="h-4 w-4" /> Add attendee
                </Button>
              )}
            </div>
          </div>

          {event.maxCapacity > 0 && (
            <div className="mt-7 max-w-xl">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Active seats</span>
                <span className="font-mono tabular-nums">{summary.active}/{event.maxCapacity}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${capacityPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <EventWorkflowPanel
        event={event}
        permissions={permissions}
        pending={workflowMutation.isPending}
        onAction={(action, note) => workflowMutation.mutate({ action, note })}
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
              tab === item.id
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${tab === item.id ? "bg-background/15" : "bg-muted"}`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OpsMetric label="Active seats" value={summary.active} detail={`${summary.confirmed} confirmed · ${summary.pending} pending`} icon={Users} />
            <OpsMetric label="Recorded collected" value={money(summary.paidAmount)} detail={`${summary.paidCount} paid records`} icon={Banknote} />            <OpsMetric label="Manual confirmations" value={money(summary.manualPaidAmount)} detail={`${summary.manualPaidCount} admin-confirmed`} icon={BadgeCheck} />
            <OpsMetric label="Needs attention" value={operations.data.attention.length} detail={`${summary.cancelledPaidCount} paid + cancelled`} icon={AlertTriangle} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <Card>
              <CardContent className="p-6">
                <PanelHeader
                  eyebrow="Attention queue"
                  title="What needs an organizer"
                  description="Financial or registration states that should not disappear inside a generic list."
                />
                <div className="mt-5 space-y-2">
                  {operations.data.attention.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      No unresolved registration or payment states.
                    </div>
                  ) : operations.data.attention.slice(0, 8).map((row) => (
                    <OperationRow
                      key={row.id}
                      row={row}
                      permissions={permissions}
                      compact
                      pending={actionMutation.isPending}
                      onAction={(action, title) => setResolution({ row, action, title })}
                      onImmediate={(action) => actionMutation.mutate({ row, action })}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>            <Card>
              <CardContent className="p-6">
                <PanelHeader eyebrow="Controls" title="Event operations" description="Safe recovery actions, all server-side." />
                <div className="mt-5 grid gap-3">
                  <Button variant="outline" className="justify-start gap-3" onClick={() => setTab("attendees")}>
                    <ClipboardList className="h-4 w-4" /> Open attendee register
                  </Button>
                  <Button variant="outline" className="justify-start gap-3" onClick={() => setTab("payments")}>
                    <WalletCards className="h-4 w-4" /> Open payment desk
                  </Button>
                  <Button variant="outline" className="justify-start gap-3" onClick={() => void exportRegistrations()}>
                    <Download className="h-4 w-4" /> Export registrations CSV
                  </Button>
                  {isPlatformAdmin && (
                    <ConfirmButton
                      label="Recompute counters"
                      confirmMessage="Recompute event counters and coupon usage from the live registration records?"
                      variant="outline"
                      icon={<RefreshCw className="h-4 w-4" />}
                      className="justify-start"
                      disabled={recomputeMutation.isPending}
                      onConfirm={() => { recomputeMutation.mutate(); return true; }}
                    />
                  )}
                </div>
                <p className="mt-5 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  {operations.data.financeDisclaimer}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}      {tab === "attendees" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader
              eyebrow="Attendee register"
              title="Everyone attached to this event"
              description="Search, filter, inspect, check in, cancel, restore, or resolve payment state."
              actions={permissions["registrations.manual"] ? <Button size="sm" className="gap-2" onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" />Add attendee</Button> : undefined}
            />
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_170px_170px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setAttendeePage(1); }} placeholder="Search name, email, phone or ticket" className="pl-9" />
              </div>
              <Select value={registrationStatus} onValueChange={(value) => { setRegistrationStatus(value); setAttendeePage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All registration states</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentStatus} onValueChange={(value) => { setPaymentStatus(value); setAttendeePage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment states</SelectItem>                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="not_required">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-5 space-y-2">
              {registrations.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : registrations.data?.registrations.length ? (
                registrations.data.registrations.map((row) => (
                  <OperationRow
                    key={row.id}
                    row={row}
                    permissions={permissions}
                    pending={actionMutation.isPending}
                    onAction={(action, title) => setResolution({ row, action, title })}
                    onImmediate={(action) => actionMutation.mutate({ row, action })}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  No registrations match these filters.
                </div>
              )}
            </div>
            {registrations.data && registrations.data.total > registrations.data.perPage && (
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground">Page {registrations.data.page} · {registrations.data.total} registrations</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={attendeePage <= 1} onClick={() => setAttendeePage((value) => Math.max(1, value - 1))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={!registrations.data.hasMore} onClick={() => setAttendeePage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}      {tab === "payments" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OpsMetric label="Collected" value={money(summary.paidAmount)} detail={`${summary.paidCount} paid records`} icon={Banknote} />
            <OpsMetric label="Provider confirmed" value={money(summary.providerPaidAmount)} detail={`${summary.providerPaidCount} online/provider`} icon={CheckCircle2} />
            <OpsMetric label="Manual confirmed" value={money(summary.manualPaidAmount)} detail={`${summary.manualPaidCount} admin overrides`} icon={BadgeCheck} />
            <OpsMetric label="Pending" value={money(summary.pendingPaymentAmount)} detail={`${summary.pendingPaymentCount} awaiting payment`} icon={History} />
          </div>
          <Card>
            <CardContent className="p-6">
              <PanelHeader
                eyebrow="Payment exceptions"
                title="Resolve money that does not fit the happy path"
                description="Paid-but-cancelled, manual review and pending-payment records stay visible until resolved."
              />
              <div className="mt-5 space-y-2">
                {operations.data.attention.filter((row) => row.amount > 0).length ? (
                  operations.data.attention.filter((row) => row.amount > 0).map((row) => (
                    <OperationRow
                      key={row.id}
                      row={row}
                      permissions={permissions}
                      pending={actionMutation.isPending}
                      onAction={(action, title) => setResolution({ row, action, title })}
                      onImmediate={(action) => actionMutation.mutate({ row, action })}
                    />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">No payment exceptions.</div>
                )}
              </div>
            </CardContent>
          </Card>          <Card>
            <CardContent className="p-6">
              <PanelHeader eyebrow="Breakdown" title="By payment rail" description="Recorded registration amounts, not a live bank balance." />
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {Object.entries(summary.providers).map(([provider, values]) => (
                  <div key={provider} className="rounded-xl border border-border bg-muted/20 p-4">
                    <ProviderPill provider={provider} />
                    <p className="mt-3 font-mono text-xl font-semibold tabular-nums">{money(values.amount)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{values.paidCount} paid · {values.count} total records</p>
                  </div>
                ))}
                {Object.keys(summary.providers).length === 0 && (
                  <p className="text-sm text-muted-foreground">No payment records yet.</p>
                )}
              </div>
              <p className="mt-5 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                {operations.data.financeDisclaimer}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "coupons" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader eyebrow="Coupons" title="Discount controls" description="Coupon creation and editing stays in Event Settings; usage is derived from active registrations." actions={<Button variant="outline" size="sm" asChild><Link to={`/admin/events/${event.id}/edit`}>Manage coupons</Link></Button>} />            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              {operations.data.coupons.length ? operations.data.coupons.map((coupon) => (
                <div key={coupon.id} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_120px_140px_130px] md:items-center">
                  <div>
                    <p className="font-mono text-sm font-semibold">{coupon.code}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{coupon.discountPercent}% off</p>
                  </div>
                  <div className="text-sm"><span className="md:hidden text-muted-foreground">Uses · </span>{coupon.usedCount}{coupon.maxUses > 0 ? `/${coupon.maxUses}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "No expiry"}</div>
                  <div className="md:text-right"><StatusBadge status={coupon.isActive ? "active" : "inactive"} /></div>
                </div>
              )) : (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">No coupons configured for this event.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "team" && (
        <EventTeamPanel eventId={id} societyId={event.society} canManage={Boolean(permissions["assignments.manage"])} />
      )}

      {tab === "activity" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader eyebrow="Audit trail" title="Manual operations" description="Admin actions are stored separately from provider/payment truth." />
            <div className="mt-5 space-y-2">
              {operations.data.audit.length ? operations.data.audit.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-xl border border-border p-4">
                  <div className="mt-0.5 rounded-lg bg-muted p-2"><History className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold">{entry.action.replaceAll("_", " ")}</p>
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.created)}</span>
                    </div>
                    {entry.note && <p className="mt-1 text-sm text-muted-foreground">{entry.note}</p>}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">actor {entry.actor || "system"}{entry.registration ? ` · registration ${entry.registration}` : ""}</p>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">No manual audit entries yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}      <ManualRegistrationDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        eventPrice={event.price}
        eventFull={eventFull}
        pending={manualMutation.isPending}
        onSubmit={(form) => manualMutation.mutate(form)}
      />
      <EventCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        eventTitle={event.title}
        pending={cancelEventMutation.isPending}
        onConfirm={(reason) => cancelEventMutation.mutate(reason)}
      />
      <ResolutionDialog
        state={resolution}
        onClose={() => setResolution(null)}
        pending={actionMutation.isPending}
        onSubmit={(input) => {
          if (!resolution) return;
          actionMutation.mutate({ row: resolution.row, action: resolution.action, ...input });
        }}
      />
    </div>
  );
}

function OperationRow({
  row,
  permissions,
  compact = false,
  pending,
  onAction,
  onImmediate,
}: {
  row: AdminRegistrationOperationRow;
  permissions: Record<string, boolean>;
  compact?: boolean;
  pending: boolean;
  onAction: (action: RegistrationAdminAction, title: string) => void;
  onImmediate: (action: RegistrationAdminAction) => void;
}) {
  const isPaidCancelled = row.registrationStatus === "cancelled" && row.paymentStatus === "paid";
  const canConfirm = Boolean(permissions["finance.manage"]) && row.registrationStatus === "pending" && row.paymentStatus === "pending" && row.amount > 0 && (!row.providerStatus || row.providerStatus === "not_initialized");
  const canRestore = Boolean(permissions["registrations.manage"]) && row.registrationStatus === "cancelled";
  const canRefund = Boolean(permissions["finance.manage"]) && row.paymentStatus === "paid" && row.provider !== "razorpay";
  const refundTitle = "Record external refund";
  const canReopenManual = Boolean(permissions["finance.manage"]) && Boolean(row.manualConfirmation) && row.paymentStatus === "paid";

  return (
    <div className={`rounded-xl border p-3 transition-colors ${row.manualReview || isPaidCancelled ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background hover:bg-muted/20"}`}>
      <div className={`grid gap-3 ${compact ? "lg:grid-cols-[1.3fr_auto_auto]" : "lg:grid-cols-[1.35fr_0.9fr_0.9fr_auto]"} lg:items-center`}>
        <div className="min-w-0">
          <RegistrationIdentity row={row} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProviderPill provider={row.provider} />
            {row.registrationSource === "admin" && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Manual entry</span>}
            {row.manualReview && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">Review</span>}
          </div>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={row.registrationStatus} kind="registration" />
            <StatusBadge status={row.paymentStatus} kind="payment" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{row.amount > 0 ? money(row.amount) : "Free"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.ticketId || row.providerStatus || "No ticket yet"}</p>
        </div>        <div className="flex flex-wrap items-center justify-start gap-1 lg:justify-end">
          <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
            <Link to={`/admin/registrations/${row.id}`}>View</Link>
          </Button>
          {canConfirm && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onAction("confirm-payment", "Confirm payment manually")}>
              <BadgeCheck className="h-3.5 w-3.5" /> Confirm paid
            </Button>
          )}
          {permissions["checkin.manage"] && !row.checkedIn && row.registrationStatus === "confirmed" && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onImmediate("check-in")}>
              <UserCheck className="h-3.5 w-3.5" /> Check in
            </Button>
          )}
          {permissions["checkin.manage"] && row.checkedIn && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onImmediate("undo-check-in")}>
              <XCircle className="h-3.5 w-3.5" /> Undo check-in
            </Button>
          )}
          {canRestore && (
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={() => onAction("restore", "Restore registration")}>
              Restore
            </Button>
          )}          {canRefund && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive" disabled={pending} onClick={() => onAction("mark-refunded", refundTitle) }>
              <ReceiptText className="h-3.5 w-3.5" /> Refund
            </Button>
          )}
          {canReopenManual && (
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={() => onAction("reopen-manual-payment", "Reverse manual payment confirmation") }>
              Reopen payment
            </Button>
          )}
          {permissions["registrations.manage"] && row.registrationStatus !== "cancelled" && !row.checkedIn && (
            <ConfirmButton
              label="Cancel"
              confirmMessage="Cancel this registration? Paid registrations stay visible in the payment exception queue."
              variant="destructive"
              className="h-8 text-xs"
              disabled={pending}
              onConfirm={() => { onImmediate("cancel"); return true; }}
            />
          )}
        </div>
      </div>
      {(row.reviewReason || row.internalNotes) && (
        <div className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          {row.reviewReason && <p><strong className="text-foreground">Review:</strong> {row.reviewReason}</p>}
          {row.internalNotes && <p className="mt-1"><strong className="text-foreground">Note:</strong> {row.internalNotes}</p>}
        </div>
      )}
    </div>
  );
}
