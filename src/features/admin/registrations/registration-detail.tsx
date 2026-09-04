import { Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  getAdminRegistration,
  getRegistrationNotificationState,
  confirmRegistrationPayment,
  resendRegistrationNotification,
  runRegistrationAdminCommand,
} from "@/lib/data/admin-registrations.client";
import { BadgeCheck, CreditCard, Loader2, Mail, Phone, ReceiptText, Send, Ticket, TriangleAlert, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { hasScopedWorkspaceCapability } from "@/lib/workspace-permissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { formatDateTime } from "@/lib/dates";

interface RegistrationDetail {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  ticketId: string;
  amount: number;
  programmeCode: string;
  programme: string;
  semester: string;
  studyYear: number | null;
  ieeeMember: boolean;
  ieeeMemberId: string;
  discountSource: "none" | "ieee_member" | "coupon";
  couponCode: string;
  discountAmount: number;
  paymentData: Record<string, unknown> | null;
  formResponses: Record<string, unknown> | null;
  createdAt: string;
  eventTitle: string;
  eventId: string;
  eventSocietyId: string;
  provider: string;
  providerStatus: string;
  manualReview: boolean;
  reviewReason: string;
  manualConfirmation: Record<string, unknown> | null;
  registrationSource: string;
  internalNotes: string;
}

interface LegacyPayGateData {
  provider: string;
  providerStatus: string;
  paymentId: string;
  requestedAmountPaise: number;
  payableAmountPaise: number;
  payableAmount: string;
  expiresAt: string;
  paidAt: string;
  manualReview: boolean;
  reviewReason: string;
}

function formatDate(d: string | null): string {
  return d ? formatDateTime(d) || d : "—";
}

function paymentDataValue(data: Record<string, unknown> | null, key: string): unknown {
  return data && typeof data === "object" ? data[key] : undefined;
}

function getLegacyPayGateData(data: Record<string, unknown> | null): LegacyPayGateData | null {
  const provider = String(paymentDataValue(data, "provider") || "");
  if (provider !== "paygate" && provider !== "legacy_paygate") return null;
  return {
    provider: "legacy_paygate",
    providerStatus: String(paymentDataValue(data, "providerStatus") || "not_initialized"),
    paymentId: String(paymentDataValue(data, "paymentId") || ""),
    requestedAmountPaise: Number(paymentDataValue(data, "requestedAmountPaise")) || 0,
    payableAmountPaise: Number(paymentDataValue(data, "payableAmountPaise")) || 0,
    payableAmount: String(paymentDataValue(data, "payableAmount") || ""),
    expiresAt: String(paymentDataValue(data, "expiresAt") || ""),
    paidAt: String(paymentDataValue(data, "paidAt") || ""),
    manualReview: paymentDataValue(data, "manualReview") === true,
    reviewReason: String(paymentDataValue(data, "reviewReason") || ""),
  };
}

function formatPaise(value: number): string {
  return Number.isFinite(value) && value > 0 ? `₹${(value / 100).toFixed(2)}` : "—";
}

interface RegistrationDetailProps {
  registrationId: string;
}

export function RegistrationDetail({ registrationId }: RegistrationDetailProps) {
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace-me"], queryFn: getWorkspaceMe, staleTime: 30_000 });

  const { data, isLoading, isError, error } = useQuery<{
    registration: RegistrationDetail;
  }>({
    queryKey: ["admin-registration", registrationId],
    queryFn: () => getAdminRegistration(registrationId),
  });

  const reg = data?.registration;
  const context = reg ? { eventId: reg.eventId, societyId: reg.eventSocietyId } : {};
  const canFinance = Boolean(reg && hasScopedWorkspaceCapability(workspace.data, "finance.manage", context));
  const canCheckIn = Boolean(reg && hasScopedWorkspaceCapability(workspace.data, "checkin.manage", context));
  const canManage = Boolean(reg && hasScopedWorkspaceCapability(workspace.data, "registrations.manage", context));

  const notificationQuery = useQuery({
    queryKey: ["admin-registration-notifications", registrationId],
    queryFn: () => getRegistrationNotificationState(registrationId),
    enabled: Boolean(reg && canManage),
    retry: false,
  });

  const resendMutation = useMutation({
    mutationFn: (kind: "ticket" | "receipt") => resendRegistrationNotification(registrationId, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration-notifications", registrationId] });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: () => runRegistrationAdminCommand(registrationId, "check-in"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-registration", registrationId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const undoCheckInMutation = useMutation({
    mutationFn: () => runRegistrationAdminCommand(registrationId, "undo-check-in"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", registrationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-event-operations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => runRegistrationAdminCommand(registrationId, "cancel"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-registration", registrationId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-payment-desk"] });
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: () => confirmRegistrationPayment(registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", registrationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-registration-notifications", registrationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Payment confirmed and notifications queued");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message || "Could not confirm payment"),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !reg) {
    return (
      <Card variant="elevated" className="border-destructive/40">
        <CardContent className="p-6">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-destructive">
            Not available
          </p>
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            Could not load this registration
          </h2>
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ??
              "The registration may have been deleted or you may not have access."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const legacyPayGate = getLegacyPayGateData(reg.paymentData);
  const needsResolution = reg.manualReview ||
    (reg.registrationStatus === "cancelled" && reg.paymentStatus === "paid");

  return (
    <div className="grid gap-6">
      {needsResolution && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-5">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">This registration needs an organizer decision</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {reg.reviewReason || legacyPayGate?.reviewReason || "The registration is cancelled but the payment is recorded as paid."}
              </p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to={`/admin/events/${reg.eventId}`}>Resolve in event workspace</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity + actions */}
      <Card>
        <CardContent className="grid gap-4 p-6 md:flex md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              Attendee
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {reg.userName || "—"}
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {reg.userEmail || "—"}
              </span>
              {reg.userPhone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {reg.userPhone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Ticket className="h-3.5 w-3.5" /> {reg.ticketId || "—"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canFinance && reg.registrationStatus === "pending" &&
              reg.paymentStatus === "pending" &&
              reg.amount > 0 && (
                <ConfirmButton
                  label="Confirm payment"
                  confirmMessage={`Confirm ₹${reg.amount} received? This will issue the ticket and queue the confirmation and receipt emails.`}
                  icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  className="border-success/30 text-success hover:bg-success/8"
                  onConfirm={() => { confirmPaymentMutation.mutate(); return true; }}
                  disabled={confirmPaymentMutation.isPending}
                />
              )}
            {canCheckIn && !reg.checkedIn && reg.registrationStatus === "confirmed" && (
              <ConfirmButton
                label="Check in"
                confirmMessage="Check in this attendee?"
                icon={<UserCheck className="h-3.5 w-3.5" />}
                onConfirm={() => { checkInMutation.mutate(); return true; }}
                disabled={checkInMutation.isPending}
              />
            )}
            {canCheckIn && reg.checkedIn && (
              <ConfirmButton
                label="Undo check-in"
                confirmMessage="Undo this attendee's check-in?"
                variant="outline"
                onConfirm={() => { undoCheckInMutation.mutate(); return true; }}
                disabled={undoCheckInMutation.isPending}
              />
            )}
            {canManage && reg.registrationStatus !== "cancelled" && !reg.checkedIn && (
              <ConfirmButton
                label="Cancel registration"
                confirmMessage="Cancel this registration? Paid records remain visible for finance review."
                variant="destructive"
                onConfirm={() => { cancelMutation.mutate(); return true; }}
                disabled={cancelMutation.isPending}
              />
            )}
            <Button variant="outline" asChild>
              <Link to={`/admin/events/${reg.eventId}`}>Event workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <div className="mt-2">
              <StatusBadge
                status={reg.registrationStatus}
                kind="registration"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Payment
            </p>
            <div className="mt-2">
              <StatusBadge status={reg.paymentStatus} kind="payment" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Checked in
            </p>
            <p className="mt-2 text-sm font-semibold">
              {reg.checkedIn ? (
                <span className="text-success">✓ Yes</span>
              ) : (
                <span className="text-muted-foreground">No</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Source</p>
            <p className="mt-2 text-sm font-semibold">
              {reg.registrationSource === "admin" ? "Manual / admin" : "Self-service"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{reg.provider || "legacy"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Academic & membership</p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
            <dt className="text-muted-foreground">Programme</dt>
            <dd className="font-medium">{reg.programme || "—"}{reg.programmeCode && <span className="ml-2 font-mono text-xs text-muted-foreground">{reg.programmeCode}</span>}</dd>
            <dt className="text-muted-foreground">Semester</dt>
            <dd className="font-medium">{reg.semester || "—"}{reg.studyYear ? <span className="ml-2 text-xs text-muted-foreground">Year {reg.studyYear}</span> : null}</dd>
            <dt className="text-muted-foreground">IEEE member</dt>
            <dd>{reg.ieeeMember ? "Yes" : "No"}</dd>
            <dt className="text-muted-foreground">Membership ID</dt>
            <dd className="font-mono text-xs">{reg.ieeeMemberId || "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      {notificationQuery.data && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Email delivery</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {([
                ["ticket", "Ticket email", notificationQuery.data.notifications.ticket, notificationQuery.data.ticketAvailable, Send],
                ["receipt", "Receipt email", notificationQuery.data.notifications.receipt, notificationQuery.data.receiptAvailable, ReceiptText],
              ] as const).map(([kind, label, state, available, Icon]) => (
                <div key={kind} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{label}</p></div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {state?.status === "sent" ? `Sent${state.sentAt ? ` · ${formatDate(state.sentAt)}` : ""}` : state?.status === "failed" ? `Failed after ${state.attempts} attempt${state.attempts === 1 ? "" : "s"}` : state?.status ? state.status.charAt(0).toUpperCase() + state.status.slice(1) : available ? "Not queued yet" : "Not available"}
                      </p>
                    </div>
                    {available && (
                      <button
                        type="button"
                        onClick={() => resendMutation.mutate(kind)}
                        disabled={resendMutation.isPending}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        Resend
                      </button>
                    )}
                  </div>
                  {state?.lastError && <p className="mt-3 break-words rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive">{state.lastError}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Payment provenance</p>
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
            <dt className="text-muted-foreground">Rail</dt>
            <dd className="font-medium">{reg.provider || "legacy"}</dd>
            <dt className="text-muted-foreground">Provider status</dt>
            <dd className="font-medium">{reg.providerStatus || "—"}</dd>
            <dt className="text-muted-foreground">Confirmation</dt>
            <dd>{reg.manualConfirmation ? "Admin confirmed" : "Provider / automatic"}</dd>
            <dt className="text-muted-foreground">Internal note</dt>
            <dd className="break-words">{reg.internalNotes || "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      {legacyPayGate && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Legacy PayGate record
              </p>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
              <dt className="text-muted-foreground">Provider status</dt>
              <dd className="font-medium text-foreground">{legacyPayGate.providerStatus}</dd>
              <dt className="text-muted-foreground">Payment ID</dt>
              <dd className="break-all font-mono text-xs text-foreground">{legacyPayGate.paymentId || "—"}</dd>
              <dt className="text-muted-foreground">Registration amount</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatPaise(legacyPayGate.requestedAmountPaise)}</dd>
              <dt className="text-muted-foreground">Exact payable</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {legacyPayGate.payableAmount ? `₹${legacyPayGate.payableAmount}` : formatPaise(legacyPayGate.payableAmountPaise)}
              </dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="font-mono text-xs text-foreground">{formatDate(legacyPayGate.expiresAt || null)}</dd>
              <dt className="text-muted-foreground">Paid at</dt>
              <dd className="font-mono text-xs text-foreground">{formatDate(legacyPayGate.paidAt || null)}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Money block */}
      {(reg.amount > 0 || reg.discountAmount > 0 || reg.discountSource !== "none") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Registration fee
              </p>
              <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {reg.amount > 0 ? `₹${reg.amount}` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Discount</p>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                {reg.discountSource === "ieee_member" ? "IEEE member" : reg.discountSource === "coupon" ? `Coupon${reg.couponCode ? ` ${reg.couponCode}` : ""}` : "None"}
              </p>
              {reg.discountAmount > 0 && <p className="mt-1 text-xs text-muted-foreground">₹{reg.discountAmount} off</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event + timeline */}
      <Card>
        <CardContent className="p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Event
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            <Link to={`/admin/events/${reg.eventId}`} className="hover:underline">{reg.eventTitle || "—"}</Link>
          </h3>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm border-t border-border pt-4">
            <dt className="text-muted-foreground">Registered</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {formatDate(reg.createdAt)}
            </dd>
            <dt className="text-muted-foreground">Checked in</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {formatDate(reg.checkedInAt)}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* Form responses */}
      {reg.formResponses &&
        typeof reg.formResponses === "object" &&
        Object.keys(reg.formResponses).length > 0 && (
          <Card>
            <CardContent className="p-6">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Form responses
              </p>
              <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                {Object.entries(
                  reg.formResponses as Record<string, unknown>,
                ).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-muted-foreground capitalize">{k}</dt>
                    <dd className="text-foreground break-words">
                      {typeof v === "string" || typeof v === "number"
                        ? String(v)
                        : JSON.stringify(v)}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
