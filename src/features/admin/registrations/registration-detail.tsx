import { Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
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
  couponCode: string;
  discountAmount: number;
  paymentData: Record<string, unknown> | null;
  formResponses: Record<string, unknown> | null;
  createdAt: string;
  eventTitle: string;
  eventId: string;
}

interface PayGateAdminData {
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

function getPayGateAdminData(data: Record<string, unknown> | null): PayGateAdminData | null {
  if (String(paymentDataValue(data, "provider") || "") !== "paygate") return null;
  return {
    provider: "paygate",
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
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery<{
    registration: RegistrationDetail;
  }>({
    queryKey: ["admin-registration", registrationId],
    queryFn: () => getAdminRegistration(registrationId),
  });

  const reg = data?.registration;

  const notificationQuery = useQuery({
    queryKey: ["admin-registration-notifications", registrationId],
    queryFn: () => getRegistrationNotificationState(registrationId),
    enabled: Boolean(reg),
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

  const cancelMutation = useMutation({
    mutationFn: () => runRegistrationAdminCommand(registrationId, "cancel"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-registration", registrationId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate("/admin/registrations");
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: () => confirmRegistrationPayment(registrationId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", registrationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-registration-notifications", registrationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success(result.alreadyConfirmed ? "Payment was already confirmed" : "Payment confirmed and emails queued");
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

  const payGate = getPayGateAdminData(reg.paymentData);

  return (
    <div className="grid gap-6">
      {payGate?.manualReview && (
        <Card className="border-amber-300 bg-amber-50/70">
          <CardContent className="flex gap-3 p-5 text-amber-950">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">PayGate payment needs manual review</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                {payGate.reviewReason || "PayGate detected payment evidence that was not safe to auto-confirm."}
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-700">
                This registration remains cancelled so a released seat is never silently reassigned. Review the PayGate operator evidence before deciding on any refund or offline resolution.
              </p>
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
            {reg.registrationStatus === "pending" &&
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
            {!reg.checkedIn && reg.registrationStatus === "confirmed" && (
              <ConfirmButton
                label="Check in"
                confirmMessage="Check in this attendee?"
                icon={<UserCheck className="h-3.5 w-3.5" />}
                onConfirm={() => { checkInMutation.mutate(); return true; }}
                disabled={checkInMutation.isPending}
              />
            )}
            {reg.registrationStatus !== "cancelled" && (
              <ConfirmButton
                label="Cancel registration"
                confirmMessage="Cancel this registration?"
                variant="destructive"
                onConfirm={() => {
                  cancelMutation.mutate();
                  return true;
                }}
                disabled={cancelMutation.isPending}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status grid */}
      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

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

      {payGate && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                PayGate
              </p>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
              <dt className="text-muted-foreground">Provider status</dt>
              <dd className="font-medium text-foreground">{payGate.providerStatus}</dd>
              <dt className="text-muted-foreground">Payment ID</dt>
              <dd className="break-all font-mono text-xs text-foreground">{payGate.paymentId || "—"}</dd>
              <dt className="text-muted-foreground">Registration amount</dt>
              <dd className="font-mono tabular-nums text-foreground">{formatPaise(payGate.requestedAmountPaise)}</dd>
              <dt className="text-muted-foreground">Exact payable</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {payGate.payableAmount ? `₹${payGate.payableAmount}` : formatPaise(payGate.payableAmountPaise)}
              </dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="font-mono text-xs text-foreground">{formatDate(payGate.expiresAt || null)}</dd>
              <dt className="text-muted-foreground">Paid at</dt>
              <dd className="font-mono text-xs text-foreground">{formatDate(payGate.paidAt || null)}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Money block */}
      {(reg.amount > 0 || reg.couponCode) && (
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
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Coupon
              </p>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                {reg.couponCode
                  ? `${reg.couponCode}${reg.discountAmount > 0 ? ` (₹${reg.discountAmount} off)` : ""}`
                  : "—"}
              </p>
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
            {reg.eventTitle || "—"}
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
