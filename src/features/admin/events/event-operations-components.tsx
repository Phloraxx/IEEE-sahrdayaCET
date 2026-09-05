import { useState, type ComponentType } from "react";
import { Link } from "react-router";
import { BadgeCheck, Loader2, ReceiptText, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PROGRAMMES, SEMESTERS, programmeLabel, type ProgrammeCode } from "@/lib/academic-options";
import type { AdminCancellationRequest, AdminRegistrationOperationRow, RegistrationAdminAction } from "@/lib/data/admin-event-operations.client";

export const money = (value: number) => `₹${Math.max(0, value || 0).toLocaleString("en-IN")}`;
export function OpsMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: ComponentType<{ className?: string }>;
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

export function ProviderPill({ provider }: { provider: string }) {
  const labels: Record<string, string> = {
    razorpay: "Historical provider",
    legacy_paygate: "Legacy PayGate",
    paygate: "PayGate",
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

export interface ManualFormState {
  name: string;
  email: string;
  phone: string;
  programmeCode: ProgrammeCode | "";
  branch: string;
  semester: string;
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
  programmeCode: "",
  branch: "",
  semester: "",
  paymentMode: "pending",
  paymentReference: "",
  amountOverride: "",
  note: "",
  capacityOverride: false,
};
export function ManualRegistrationDialog({
  open,
  onOpenChange,
  eventPrice,
  eventFull,
  eligibleSemesters,
  eligibleProgrammes,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventPrice: number;
  eventFull: boolean;
  eligibleSemesters: string[];
  eligibleProgrammes: string[];
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
            <Label>Programme / Branch{eligibleProgrammes.length ? " *" : ""}</Label>
            <Select value={form.programmeCode || "__none__"} onValueChange={(value) => { const code = value === "__none__" ? "" : value as ProgrammeCode; set("programmeCode", code); if (code && code !== "OTHER") set("branch", programmeLabel(code)); else if (!code) set("branch", ""); }}>
              <SelectTrigger><SelectValue placeholder="Select programme" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">{eligibleProgrammes.length ? "Select programme..." : "Not specified"}</SelectItem>{PROGRAMMES.filter((item) => !eligibleProgrammes.length || eligibleProgrammes.includes(item.code)).map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            {form.programmeCode === "OTHER" && <Input value={form.branch} onChange={(e) => set("branch", e.target.value)} placeholder="Programme / department name" />}
          </div>
          <div className="grid gap-1.5">
            <Label>Semester{eligibleSemesters.length ? " *" : ""}</Label>
            <Select value={form.semester || "__none__"} onValueChange={(value) => set("semester", value === "__none__" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Select semester" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">{eligibleSemesters.length ? "Select semester..." : "Not specified"}</SelectItem>{SEMESTERS.filter((item) => !eligibleSemesters.length || eligibleSemesters.includes(item.code)).map((item) => <SelectItem key={item.code} value={item.code}>{item.code} · Year {item.year}</SelectItem>)}</SelectContent>
            </Select>
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
            disabled={pending || !form.name.trim() || !form.email.trim() || (eligibleProgrammes.length > 0 && !form.programmeCode) || (form.programmeCode === "OTHER" && !form.branch.trim()) || (eligibleSemesters.length > 0 && !form.semester)}
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

export interface CancellationDecisionState {
  item: AdminCancellationRequest;
  action: "accept" | "decline";
}

export function CancellationDecisionDialog({
  state,
  onClose,
  pending,
  onSubmit,
}: {
  state: CancellationDecisionState | null;
  onClose: () => void;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const attendee = state?.item.registration?.userName || "Attendee";
  const accepting = state?.action === "accept";
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) { setNote(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{accepting ? "Accept refund request" : "Decline refund request"}</DialogTitle>
          <DialogDescription>
            {attendee}. This decision records finance intent only; it does not move money automatically.
          </DialogDescription>
        </DialogHeader>
        {state?.item.request.reason && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm leading-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Attendee reason</p>
            <p className="mt-1">{state.item.request.reason}</p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="refund-decision-note">Decision note *</Label>
          <Textarea id="refund-decision-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={accepting ? "Approved; process through the recorded payment rail." : "Reason the request cannot be approved."} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setNote(""); onClose(); }} disabled={pending}>Cancel</Button>
          <Button variant={accepting ? "default" : "destructive"} disabled={pending || !note.trim()} onClick={() => onSubmit(note.trim())}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {accepting ? "Accept request" : "Decline request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ResolutionState {
  row: AdminRegistrationOperationRow;
  action: RegistrationAdminAction;
  title: string;
}

export function ResolutionDialog({
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
            {state ? `${state.row.userName} · ${money(state.row.amount ?? 0)} · ${state.row.provider ?? "unknown"}` : ""}
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

export function legacyCheckInAction({
  canCheckIn,
  sessionAttendanceActive,
  eventCheckInActive,
  checkedIn,
  registrationStatus,
}: {
  canCheckIn: boolean;
  sessionAttendanceActive: boolean;
  eventCheckInActive: boolean;
  checkedIn: boolean;
  registrationStatus: string;
}): "check-in" | "undo-check-in" | null {
  if (!canCheckIn || sessionAttendanceActive) return null;
  if (checkedIn) return "undo-check-in";
  if (!eventCheckInActive) return null;
  return registrationStatus === "confirmed" ? "check-in" : null;
}

export function OperationRow({
  row,
  permissions,
  canViewFinance = Boolean(permissions["finance.view"] || permissions["finance.manage"]),
  compact = false,
  pending,
  sessionAttendanceActive = false,
  eventCheckInActive = true,
  onAction,
  onImmediate,
}: {
  row: AdminRegistrationOperationRow;
  permissions: Record<string, boolean>;
  canViewFinance?: boolean;
  compact?: boolean;
  pending: boolean;
  sessionAttendanceActive?: boolean;
  eventCheckInActive?: boolean;
  onAction: (action: RegistrationAdminAction, title: string) => void;
  onImmediate: (action: RegistrationAdminAction) => void;
}) {
  const isPaidCancelled = canViewFinance && row.registrationStatus === "cancelled" && row.paymentStatus === "paid";
  const canConfirm = canViewFinance && Boolean(permissions["finance.manage"]) && row.registrationStatus === "pending" && row.paymentStatus === "pending" && (row.amount ?? 0) > 0 && (!row.providerStatus || row.providerStatus === "not_initialized");
  const canRestore = Boolean(permissions["registrations.manage"]) && row.registrationStatus === "cancelled";
  const canRefund = canViewFinance && Boolean(permissions["finance.manage"]) && row.paymentStatus === "paid";
  const refundTitle = "Record external refund";
  const canReopenManual = canViewFinance && Boolean(permissions["finance.manage"]) && Boolean(row.manualConfirmation) && row.paymentStatus === "paid";
  const checkInAction = legacyCheckInAction({
    canCheckIn: Boolean(permissions["checkin.manage"]),
    sessionAttendanceActive,
    eventCheckInActive,
    checkedIn: row.checkedIn,
    registrationStatus: row.registrationStatus,
  });

  return (
    <div className={`rounded-xl border p-3 transition-colors ${isPaidCancelled || row.manualReview ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background hover:bg-muted/20"}`}>
      <div className={`grid gap-3 ${compact ? "lg:grid-cols-[1.3fr_auto_auto]" : "lg:grid-cols-[1.35fr_0.9fr_0.9fr_auto]"} lg:items-center`}>
        <div className="min-w-0">
          <RegistrationIdentity row={row} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canViewFinance && <ProviderPill provider={row.provider ?? "unknown"} />}
            {row.registrationSource === "admin" && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Manual entry</span>}
            {canViewFinance && row.manualReview && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">Review</span>}
          </div>
        </div>
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={row.registrationStatus} kind="registration" />
            {canViewFinance && <StatusBadge status={row.paymentStatus ?? ""} kind="payment" />}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tabular-nums">{canViewFinance ? ((row.amount ?? 0) > 0 ? money(row.amount ?? 0) : "Free") : "Registration record"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.ticketId || (canViewFinance ? row.providerStatus : "") || "No ticket yet"}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-1 lg:justify-end">
          <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
            <Link to={`/admin/registrations/${row.id}`}>View</Link>
          </Button>
          {canConfirm && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onAction("confirm-payment", "Confirm payment manually")}>
              <BadgeCheck className="h-3.5 w-3.5" /> Confirm paid
            </Button>
          )}
          {checkInAction === "check-in" && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onImmediate("check-in")}>
              <UserCheck className="h-3.5 w-3.5" /> Check in
            </Button>
          )}
          {checkInAction === "undo-check-in" && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => onImmediate("undo-check-in")}>
              <XCircle className="h-3.5 w-3.5" /> Undo check-in
            </Button>
          )}
          {canRestore && (
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={() => onAction("restore", "Restore registration")}>
              Restore
            </Button>
          )}
          {canRefund && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-destructive" disabled={pending} onClick={() => onAction("mark-refunded", refundTitle)}>
              <ReceiptText className="h-3.5 w-3.5" /> Refund
            </Button>
          )}
          {canReopenManual && (
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={() => onAction("reopen-manual-payment", "Reverse manual payment confirmation")}>
              Reopen payment
            </Button>
          )}
          {permissions["registrations.manage"] && row.registrationStatus !== "cancelled" && !row.checkedIn && (
            <ConfirmButton
              label="Cancel"
              confirmMessage={canViewFinance ? "Cancel this registration? Paid registrations stay visible in the payment exception queue." : "Cancel this registration?"}
              variant="destructive"
              className="h-8 text-xs"
              disabled={pending}
              onConfirm={() => { onImmediate("cancel"); return true; }}
            />
          )}
        </div>
      </div>
      {canViewFinance && (row.reviewReason || row.internalNotes) && (
        <div className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
          {row.reviewReason && <p><strong className="text-foreground">Review:</strong> {row.reviewReason}</p>}
          {row.internalNotes && <p className="mt-1"><strong className="text-foreground">Note:</strong> {row.internalNotes}</p>}
        </div>
      )}
    </div>
  );
}
