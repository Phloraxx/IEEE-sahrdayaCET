import { Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Mail, Phone, Ticket, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";

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

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf="))
      ?.split("=")[1] ?? ""
  );
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
    queryFn: async () => {
      const res = await fetch(`/api/admin/registrations/${registrationId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      return res.json();
    },
  });

  const reg = data?.registration;

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/registrations/${registrationId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({ checkedIn: true }),
      });
      if (!res.ok) throw new Error("Failed to check in");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-registration", registrationId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/registrations/${registrationId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({ registrationStatus: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-registration", registrationId],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      navigate({ to: "/admin/registrations" });
    },
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

  return (
    <div className="grid gap-6">
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

      {/* Money block */}
      {(reg.amount > 0 || reg.couponCode) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Amount paid
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
