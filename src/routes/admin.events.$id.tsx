import { useEffect, useState } from "react";
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
  Settings2,
  Plus,
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { EventCancelDialog } from "@/components/admin/event-cancel-dialog";
import { EventTeamPanel } from "@/features/admin/events/event-team-panel";
import { EventWorkflowPanel } from "@/features/admin/events/event-workflow-panel";
import { CertificateTemplatePanel } from "@/features/admin/events/certificate-template-panel";
import { AttendanceSessionPanel } from "@/features/admin/events/attendance-session-panel";
import { EventCloseoutPanel } from "@/features/admin/events/event-closeout-panel";
import {
  CancellationDecisionDialog,
  type CancellationDecisionState,
  ManualRegistrationDialog,
  type ManualFormState,
  money,
  OperationRow,
  OpsMetric,
  ProviderPill,
  ResolutionDialog,
  type ResolutionState,
} from "@/features/admin/events/event-operations-components";
import { useAuth } from "@/lib/auth-context";
import { getPbClient } from "@/lib/pb-client";
import { csvFilename, streamRegistrationsCSV } from "@/lib/csv-export";
import { formatDateTime } from "@/lib/dates";
import {
  createManualRegistration,
  decideCancellationRequest,
  getAdminEventOperations,
  recomputeEventOperations,
  runAdminRegistrationCommand,
  type AdminRegistrationOperationRow,
  type RegistrationAdminAction,
} from "@/lib/data/admin-event-operations.client";
import { listAdminRegistrations } from "@/lib/data/admin-registrations.client";
import { archiveAdminEvent, cancelAdminEvent } from "@/lib/data/admin-events.client";
import { runEventWorkflow } from "@/lib/data/workspace.client";

type Tab = "overview" | "closeout" | "attendees" | "attendance" | "payments" | "coupons" | "certificates" | "team" | "activity";
const VALID_TABS: Tab[] = ["overview", "closeout", "attendees", "attendance", "payments", "coupons", "certificates", "team", "activity"];

function allowedTabsForPermissions(permissions: Record<string, boolean>): Tab[] {
  return [
    "overview",
    ...(permissions["registrations.view"] ? ["attendees" as const] : []),
    ...(permissions["events.edit"] || permissions["checkin.manage"] ? ["attendance" as const] : []),
    ...(permissions["finance.view"] || permissions["finance.manage"] ? ["payments" as const] : []),
    ...(permissions["events.edit"] ? ["coupons" as const] : []),
    ...(permissions["certificates.view"] ? ["certificates" as const] : []),
    ...(permissions["assignments.manage"] ? ["team" as const] : []),
    ...(permissions["reports.view"] ? ["activity" as const] : []),
  ];
}

function isTab(value: string | null): value is Tab {
  return value !== null && VALID_TABS.includes(value as Tab);
}

export default function AdminEventOperationsRoute() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = isTab(requestedTab) ? requestedTab : "overview";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab"); else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [manualOpen, setManualOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resolution, setResolution] = useState<ResolutionState | null>(null);
  const [cancellationDecision, setCancellationDecision] = useState<CancellationDecisionState | null>(null);
  const [search, setSearch] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [attendeePage, setAttendeePage] = useState(1);

  const operations = useQuery({
    queryKey: ["admin-event-operations", id],
    queryFn: () => getAdminEventOperations(id),
    enabled: Boolean(id),
    refetchInterval: tab === "overview" || tab === "payments" || tab === "closeout" ? 20_000 : false,
  });
  const permissions = operations.data?.permissions ?? {};
  const canViewFinance = Boolean(permissions["finance.view"] || permissions["finance.manage"]);
  const closeoutVisible = Boolean(operations.data?.closeout?.applicable);
  const allowedTabs = [
    ...allowedTabsForPermissions(permissions),
    ...(closeoutVisible ? ["closeout" as const] : []),
  ];
  const activeTab: Tab = isTab(requestedTab) && allowedTabs.includes(requestedTab) ? requestedTab : "overview";
  useEffect(() => {
    if (!operations.data || requestedTab === activeTab) return;
    const params = new URLSearchParams(searchParams);
    if (activeTab === "overview") params.delete("tab");
    else params.set("tab", activeTab);
    setSearchParams(params, { replace: true });
  }, [activeTab, operations.data, requestedTab, searchParams, setSearchParams]);
  const registrations = useQuery({
    queryKey: ["admin-event-registrations", id, search, registrationStatus, paymentStatus, attendeePage, canViewFinance],
    queryFn: () => listAdminRegistrations({
      page: attendeePage,
      perPage: 40,
      eventId: id,
      search,
      status: registrationStatus,
      paymentStatus,
      financeAuthorized: canViewFinance,
    }),
    enabled: Boolean(id) && activeTab === "attendees",
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
      formResponses: { programmeCode: form.programmeCode, branch: form.branch.trim(), semester: form.semester },
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

  const cancellationDecisionMutation = useMutation({
    mutationFn: (input: { requestId: string; action: "accept" | "decline"; note: string }) =>
      decideCancellationRequest(input.requestId, { action: input.action, note: input.note }),
    onSuccess: (_, input) => {
      setCancellationDecision(null);
      invalidate();
      toast.success(input.action === "accept" ? "Refund request accepted" : "Refund request declined");
    },
    onError: (error: Error) => toast.error(error.message || "Could not decide refund request"),
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
    mutationFn: ({ action, note }: { action: "publish" | "unpublish" | "complete"; note?: string }) =>
      runEventWorkflow(id, action, note),
    onSuccess: () => {
      invalidate();
      toast.success("Event lifecycle updated");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update event lifecycle"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminEvent(id),
    onSuccess: () => {
      invalidate();
      toast.success("Event archived");
      setTab("overview");
    },
    onError: (error: Error) => toast.error(error.message || "Could not archive event"),
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
        financeAuthorized: canViewFinance,
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
  const isPlatformAdmin = user?.role === "admin";
  const canViewWorkflow = Boolean(
    permissions["events.edit"] ||
    permissions["events.publish"] ||
    permissions["events.cancel"] ||
    permissions["events.archive"] ||
    permissions["events.complete"],
  );
  const eventFull = event.maxCapacity > 0 && summary.active >= event.maxCapacity;
  const waitlist = operations.data.waitlist ?? { waiting: 0, offered: 0, reserved: 0 };
  const attendance = operations.data.attendance;
  const attention = canViewFinance ? operations.data.attention ?? [] : [];
  const cancellationRequests = canViewFinance ? operations.data.cancellationRequests ?? [] : [];
  const coupons = operations.data.coupons ?? [];
  const audit = operations.data.audit ?? [];
  const sessionAttendanceActive = attendance?.mode === "sessions";
  const eventCheckInActive = event.status === "published" && event.checkInEnabled;
  const eventRegistrationActive = event.status !== "cancelled" && !event.isArchived;
  const capacityPct = event.maxCapacity > 0 ? Math.min(100, Math.round((summary.active / event.maxCapacity) * 100)) : 0;
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    ...(operations.data.closeout?.applicable ? [{ id: "closeout" as Tab, label: "Closeout", count: operations.data.closeout.blockers.length || undefined }] : []),
    ...(permissions["registrations.view"] ? [{ id: "attendees" as Tab, label: "Attendees", count: summary.active }] : []),
    ...(permissions["events.edit"] || permissions["checkin.manage"] ? [{ id: "attendance" as Tab, label: "Attendance", count: attendance?.sessionCount || undefined }] : []),
    ...(canViewFinance ? [{ id: "payments" as Tab, label: "Payments", count: summary.paidCount ?? 0 }] : []),
    ...(permissions["events.edit"] ? [{ id: "coupons" as Tab, label: "Coupons", count: coupons.length }] : []),
    ...(permissions["certificates.view"] ? [{ id: "certificates" as Tab, label: "Certificates" }] : []),
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
                {canViewFinance && <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {event.price && event.price > 0
                    ? `${money(event.price)} · PayGate UPI`
                    : "Free event"}
                </span>}
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
              {permissions["registrations.manual"] && eventRegistrationActive && (
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
      {canViewWorkflow && <EventWorkflowPanel
        event={event}
        permissions={permissions}
        pending={workflowMutation.isPending}
        onAction={(action, note) => workflowMutation.mutate({ action, note })}
      />}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
              activeTab === item.id
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${activeTab === item.id ? "bg-background/15" : "bg-muted"}`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className={`grid gap-4 sm:grid-cols-2 ${canViewFinance ? "xl:grid-cols-4" : "xl:grid-cols-1"}`}>
            <OpsMetric label="Active seats" value={summary.active} detail={`${summary.confirmed} confirmed · ${summary.pending} pending${waitlist.reserved ? ` · ${waitlist.reserved} waitlist reserved` : ""}`} icon={Users} />
            {canViewFinance && <>
              <OpsMetric label="Recorded collected" value={money(summary.paidAmount ?? 0)} detail={`${summary.paidCount ?? 0} paid records`} icon={Banknote} />
              <OpsMetric label="Manual confirmations" value={money(summary.manualPaidAmount ?? 0)} detail={`${summary.manualPaidCount ?? 0} admin-confirmed`} icon={BadgeCheck} />
              <OpsMetric label="Needs attention" value={attention.length} detail={`${summary.cancelledPaidCount ?? 0} paid + cancelled`} icon={AlertTriangle} />
            </>}
          </div>

          <div className={`grid gap-6 ${canViewFinance ? "xl:grid-cols-[1.4fr_0.8fr]" : ""}`}>
            {canViewFinance && <Card>
              <CardContent className="p-6">
                <PanelHeader
                  eyebrow="Attention queue"
                  title="What needs an organizer"
                  description="Financial or registration states that should not disappear inside a generic list."
                />
                <div className="mt-5 space-y-2">
                  {attention.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      No unresolved registration or payment states.
                    </div>
                  ) : attention.slice(0, 8).map((row) => (
                    <OperationRow
                      key={row.id}
                      row={row}
                      permissions={permissions}
                      canViewFinance={canViewFinance}
                      compact
                      pending={actionMutation.isPending}
                      sessionAttendanceActive={sessionAttendanceActive}
                      eventCheckInActive={eventCheckInActive}
                      eventRegistrationActive={eventRegistrationActive}
                      onAction={(action, title) => setResolution({ row, action, title })}
                      onImmediate={(action) => actionMutation.mutate({ row, action })}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>}

            <Card>
              <CardContent className="p-6">
                <PanelHeader eyebrow="Controls" title="Event operations" description="Safe recovery actions, all server-side." />
                <div className="mt-5 grid gap-3">
                  {permissions["registrations.view"] && <Button variant="outline" className="justify-start gap-3" onClick={() => setTab("attendees")}>
                    <ClipboardList className="h-4 w-4" /> Open attendee register
                  </Button>}
                  {(permissions["events.edit"] || permissions["checkin.manage"]) && (
                    <Button variant="outline" className="justify-start gap-3" onClick={() => setTab("attendance")}>
                      <UserCheck className="h-4 w-4" /> Open attendance console
                    </Button>
                  )}
                  {canViewFinance && <Button variant="outline" className="justify-start gap-3" onClick={() => setTab("payments")}>
                    <WalletCards className="h-4 w-4" /> Open payment desk
                  </Button>}
                  {permissions["registrations.view"] && <Button variant="outline" className="justify-start gap-3" onClick={() => void exportRegistrations()}>
                    <Download className="h-4 w-4" /> Export registrations CSV
                  </Button>}
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
                {canViewFinance && <p className="mt-5 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  {operations.data.financeDisclaimer}
                </p>}
              </CardContent>
            </Card>
              </div>
            </div>
      )}      {activeTab === "closeout" && operations.data.closeout && (
        <EventCloseoutPanel
          closeout={operations.data.closeout}
          canArchive={Boolean(permissions["events.archive"])}
          archivePending={archiveMutation.isPending}
          onOpenArea={(area) => setTab(area as Tab)}
          onArchive={() => archiveMutation.mutate()}
        />
      )}

      {activeTab === "attendees" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader
              eyebrow="Attendee register"
              title="Everyone attached to this event"
              description={canViewFinance
                ? (sessionAttendanceActive
                  ? "Search, filter, inspect, cancel, restore, or resolve payment state. Session check-in is managed from the Attendance tab."
                  : "Search, filter, inspect, check in, cancel, restore, or resolve payment state.")
                : (sessionAttendanceActive
                  ? "Search, inspect, and manage registrations. Session check-in is managed from the Attendance tab."
                  : "Search, inspect, and manage registrations.")}
            />
            <div className={`mt-5 grid gap-3 ${canViewFinance ? "md:grid-cols-[1fr_170px_170px]" : "md:grid-cols-[1fr_170px]"}`}>
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
              {canViewFinance && <Select value={paymentStatus} onValueChange={(value) => { setPaymentStatus(value); setAttendeePage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment states</SelectItem>                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="not_required">Not required</SelectItem>
                </SelectContent>
              </Select>}
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
                    canViewFinance={canViewFinance}
                    pending={actionMutation.isPending}
                    sessionAttendanceActive={sessionAttendanceActive}
                    eventCheckInActive={eventCheckInActive}
                    eventRegistrationActive={eventRegistrationActive}
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
      )}

      {activeTab === "attendance" && (
        <AttendanceSessionPanel
          eventId={id}
          eventStart={event.date}
          eventEnd={event.endDate}
          eventVenue={event.venue}
          canManage={Boolean(permissions["events.edit"])}
          canCheckIn={Boolean(permissions["checkin.manage"])}
        />
      )}

      {activeTab === "payments" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OpsMetric label="Collected" value={money(summary.paidAmount ?? 0)} detail={`${summary.paidCount ?? 0} paid records`} icon={Banknote} />
            <OpsMetric label="Provider confirmed" value={money(summary.providerPaidAmount ?? 0)} detail={`${summary.providerPaidCount ?? 0} online/provider`} icon={CheckCircle2} />
            <OpsMetric label="Manual confirmed" value={money(summary.manualPaidAmount ?? 0)} detail={`${summary.manualPaidCount ?? 0} admin overrides`} icon={BadgeCheck} />
            <OpsMetric label="Pending" value={money(summary.pendingPaymentAmount ?? 0)} detail={`${summary.pendingPaymentCount ?? 0} awaiting payment`} icon={History} />
          </div>
          <Card>
            <CardContent className="p-6">
              <PanelHeader
                eyebrow="Attendee refund requests"
                title="Decide requests before moving money"
                description="Accepting records finance intent only. The registration remains financially valid until the existing payment rail confirms or records the refund."
              />
              <div className="mt-5 space-y-3">
                {cancellationRequests.length ? cancellationRequests.map((item) => {
                  const row = item.registration;
                  const accepted = item.request.status === "accepted";
                  return (
                    <div key={item.request.id} className={`rounded-xl border p-4 ${accepted ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${accepted ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{accepted ? "Accepted · refund pending" : "Needs decision"}</span>
                            {row && <ProviderPill provider={row.provider ?? "unknown"} />}
                            <span className="text-xs text-muted-foreground">Requested {formatDateTime(item.request.requestedAt)}</span>
                          </div>
                          <p className="mt-3 text-sm font-semibold">{row?.userName || "Attendee"}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{row?.userEmail || "Registration record unavailable"}{row && row.amount !== undefined ? ` · ${money(row.amount)}` : ""}</p>
                          {item.request.reason && <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/75"><strong>Reason:</strong> {item.request.reason}</p>}
                          {accepted && row && <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">Record the completed external refund below only after the money has actually been returned.</p>}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {row && <Button variant="outline" size="sm" asChild><Link to={`/admin/registrations/${row.id}`}>Open registration</Link></Button>}
                          {!accepted && permissions["finance.manage"] && (
                            <>
                              <Button size="sm" disabled={cancellationDecisionMutation.isPending} onClick={() => setCancellationDecision({ item, action: "accept" })}>Accept</Button>
                              <Button variant="outline" size="sm" disabled={cancellationDecisionMutation.isPending} onClick={() => setCancellationDecision({ item, action: "decline" })}>Decline</Button>
                            </>
                          )}
                          {accepted && row && row.paymentStatus === "paid" && permissions["finance.manage"] && (
                            <Button variant="destructive" size="sm" onClick={() => setResolution({ row, action: "mark-refunded", title: "Record attendee refund" })}>Record refund</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">No active attendee refund requests.</div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <PanelHeader
                eyebrow="Payment exceptions"
                title="Resolve money that does not fit the happy path"
                description="Paid-but-cancelled, manual review and pending-payment records stay visible until resolved."
              />
              <div className="mt-5 space-y-2">
                {attention.filter((row) => (row.amount ?? 0) > 0).length ? (
                  attention.filter((row) => (row.amount ?? 0) > 0).map((row) => (
                    <OperationRow
                      key={row.id}
                      row={row}
                      permissions={permissions}
                      canViewFinance={canViewFinance}
                      pending={actionMutation.isPending}
                      sessionAttendanceActive={sessionAttendanceActive}
                      eventCheckInActive={eventCheckInActive}
                      eventRegistrationActive={eventRegistrationActive}
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
                {Object.entries(summary.providers ?? {}).map(([provider, values]) => (
                  <div key={provider} className="rounded-xl border border-border bg-muted/20 p-4">
                    <ProviderPill provider={provider} />
                    <p className="mt-3 font-mono text-xl font-semibold tabular-nums">{money(values.amount)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{values.paidCount} paid · {values.count} total records</p>
                  </div>
                ))}
                {Object.keys(summary.providers ?? {}).length === 0 && (
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

      {activeTab === "coupons" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader eyebrow="Coupons" title="Discount controls" description="Coupon creation and editing stays in Event Settings; usage is derived from active registrations." actions={<Button variant="outline" size="sm" asChild><Link to={`/admin/events/${event.id}/edit`}>Manage coupons</Link></Button>} />            <div className="mt-5 overflow-hidden rounded-xl border border-border">
              {coupons.length ? coupons.map((coupon) => (
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

      {activeTab === "certificates" && (
        <CertificateTemplatePanel
          eventId={id}
          canView={Boolean(permissions["certificates.view"])}
          canManage={Boolean(permissions["certificates.manage_templates"])}
          canIssue={Boolean(permissions["certificates.issue"])}
          canSend={Boolean(permissions["certificates.send"])}
          canRevoke={Boolean(permissions["certificates.revoke"])}
        />
      )}

      {activeTab === "team" && (
        <EventTeamPanel eventId={id} societyId={event.society} canManage={Boolean(permissions["assignments.manage"])} />
      )}

      {activeTab === "activity" && (
        <Card>
          <CardContent className="p-6">
            <PanelHeader eyebrow="Audit trail" title="Manual operations" description="Admin actions are stored separately from provider/payment truth." />
            <div className="mt-5 space-y-2">
              {audit.length ? audit.map((entry) => (
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
        eventPrice={event.price ?? 0}
        eventFull={eventFull}
        eligibleSemesters={event.eligibleSemesters ?? []}
        eligibleProgrammes={event.eligibleProgrammes ?? []}
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
      <CancellationDecisionDialog
        state={cancellationDecision}
        onClose={() => setCancellationDecision(null)}
        pending={cancellationDecisionMutation.isPending}
        onSubmit={(note) => {
          if (!cancellationDecision) return;
          cancellationDecisionMutation.mutate({ requestId: cancellationDecision.item.request.id, action: cancellationDecision.action, note });
        }}
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
