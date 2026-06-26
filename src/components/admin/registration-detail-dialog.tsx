import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Phone, Ticket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

interface RegistrationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId?: string;
}

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

export function RegistrationDetailDialog({
  open,
  onOpenChange,
  registrationId,
}: RegistrationDetailDialogProps) {
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
    enabled: open && Boolean(registrationId),
  });

  const reg = data?.registration;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vh-admin max-w-xl">
        <DialogHeader>
          <DialogTitle>Registration detail</DialogTitle>
          <DialogDescription>
            {reg ? reg.eventTitle || "Event registration" : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {(error as Error)?.message ?? "Failed to load registration"}
          </p>
        )}

        {reg && (
          <div className="grid gap-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Identity block */}
            <div className="rounded-md border border-border bg-card/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Attendee
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {reg.userName || "—"}
              </p>
              <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> {reg.userEmail || "—"}
                </span>
                {reg.userPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {reg.userPhone}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="h-3 w-3" /> {reg.ticketId || "—"}
                </span>
              </div>
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border bg-card/30 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <div className="mt-1.5">
                  <StatusBadge
                    status={reg.registrationStatus}
                    kind="registration"
                  />
                </div>
              </div>
              <div className="rounded-md border border-border bg-card/30 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Payment
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={reg.paymentStatus} kind="payment" />
                </div>
              </div>
              <div className="rounded-md border border-border bg-card/30 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Checked in
                </p>
                <p className="mt-1.5 text-sm font-semibold">
                  {reg.checkedIn ? (
                    <span className="text-success">✓ Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </p>
              </div>
            </div>

            {/* Money block */}
            {(reg.amount > 0 || reg.couponCode) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-card/30 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Amount paid
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                    {reg.amount > 0 ? `₹${reg.amount}` : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-card/30 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Coupon
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {reg.couponCode
                      ? `${reg.couponCode}${reg.discountAmount > 0 ? ` (₹${reg.discountAmount} off)` : ""}`
                      : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="rounded-md border border-border bg-card/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Timeline
              </p>
              <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Registered</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {formatDate(reg.createdAt)}
                </dd>
                <dt className="text-muted-foreground">Checked in</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {formatDate(reg.checkedInAt)}
                </dd>
              </dl>
            </div>

            {/* Form responses */}
            {reg.formResponses &&
              typeof reg.formResponses === "object" &&
              Object.keys(reg.formResponses).length > 0 && (
                <div className="rounded-md border border-border bg-card/30 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Form responses
                  </p>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                    {Object.entries(
                      reg.formResponses as Record<string, unknown>,
                    ).map(([k, v]) => (
                      <Fragment key={k}>
                        <dt className="text-muted-foreground capitalize">
                          {k}
                        </dt>
                        <dd className="text-foreground break-words">
                          {typeof v === "string" || typeof v === "number"
                            ? String(v)
                            : JSON.stringify(v)}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

