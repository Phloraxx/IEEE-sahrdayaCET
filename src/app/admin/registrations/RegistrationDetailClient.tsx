"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface RegData {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt: string;
  ticketId: string;
  amount: number;
  couponCode: string;
  discountAmount: number;
  paymentData: unknown;
  formResponses: unknown;
  createdAt: string;
  eventTitle: string;
  eventId: string;
}

export function RegistrationDetailClient({ id }: { id: string }) {
  const [reg, setReg] = useState<RegData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingAmount, setSavingAmount] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/registrations/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.registration) {
          setReg(data.registration);
        } else {
          setError(data.error || "Failed to load registration");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load registration");
        setLoading(false);
      });
  }, [id]);

  const updateField = async (
    field: string,
    value: string | number | boolean,
  ) => {
    const setSaving =
      field === "registrationStatus"
        ? setSavingStatus
        : field === "paymentStatus"
          ? setSavingPayment
          : setSavingAmount;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      setReg((prev) => (prev ? { ...prev, [field]: value } : prev));
      toast.success(
        field === "registrationStatus"
          ? "Status updated"
          : field === "paymentStatus"
            ? "Payment updated"
            : "Amount updated",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !reg) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        {error || "Registration not found."}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>User Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Name:</span>{" "}
            <span className="font-medium">{reg.userName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            {reg.userEmail}
          </div>
          <div>
            <span className="text-muted-foreground">Phone:</span>{" "}
            {reg.userPhone || "—"}
          </div>
        </CardContent>
      </Card>

      {/* Event */}
      <Card>
        <CardHeader>
          <CardTitle>Event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Title:</span>{" "}
            {reg.eventTitle || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span>{" "}
            {reg.createdAt
              ? new Date(reg.createdAt).toLocaleDateString("en-IN")
              : "—"}
          </div>
        </CardContent>
      </Card>

      {/* Status — Editable */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Registration:</span>
            <select
              value={reg.registrationStatus}
              onChange={(e) =>
                updateField("registrationStatus", e.target.value)
              }
              disabled={savingStatus}
              className={`text-sm font-medium rounded border px-2 py-1 outline-none ${
                reg.registrationStatus === "confirmed"
                  ? "border-green-300 text-green-700 bg-green-50"
                  : reg.registrationStatus === "cancelled"
                    ? "border-red-300 text-red-700 bg-red-50"
                    : "border-yellow-300 text-yellow-700 bg-yellow-50"
              }`}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {savingStatus && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Payment:</span>
            <select
              value={reg.paymentStatus}
              onChange={(e) => updateField("paymentStatus", e.target.value)}
              disabled={savingPayment}
              className={`text-sm font-medium rounded border px-2 py-1 outline-none ${
                reg.paymentStatus === "paid"
                  ? "border-green-300 text-green-700 bg-green-50"
                  : reg.paymentStatus === "failed"
                    ? "border-red-300 text-red-700 bg-red-50"
                    : reg.paymentStatus === "not_required"
                      ? "border-gray-300 text-gray-600 bg-gray-50"
                      : "border-yellow-300 text-yellow-700 bg-yellow-50"
              }`}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="not_required">Not Required</option>
            </select>
            {savingPayment && <Loader2 className="size-3 animate-spin" />}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Checked In:</span>
            <span>{reg.checkedIn ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount:</span>
            <div className="flex items-center gap-1">
              <span className="text-xs">₹</span>
              <input
                type="number"
                min="0"
                defaultValue={reg.amount}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val !== reg.amount) {
                    updateField("amount", val);
                  }
                }}
                className="w-20 text-right text-sm font-mono rounded border border-input px-2 py-1 outline-none focus:border-ring"
              />
              {savingAmount && <Loader2 className="size-3 animate-spin" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ticket */}
      <Card>
        <CardHeader>
          <CardTitle>Ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Ticket ID:</span>{" "}
            <span className="font-mono text-xs">{reg.ticketId || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Amount:</span>{" "}
            <span className="font-mono">₹{reg.amount || 0}</span>
          </div>
          {reg.couponCode && (
            <div>
              <span className="text-muted-foreground">Coupon:</span>{" "}
              <span className="font-mono text-xs">{reg.couponCode}</span>
            </div>
          )}
          {reg.discountAmount > 0 && (
            <div>
              <span className="text-muted-foreground">Discount:</span>{" "}
              <span className="font-mono text-emerald-600">
                −₹{reg.discountAmount}
              </span>
            </div>
          )}
          {!!reg.paymentData && (
            <div>
              <span className="text-muted-foreground">Payment Ref:</span>{" "}
              <span className="font-mono text-xs">
                {(reg.paymentData as any)?.paymentRef ||
                  (reg.paymentData as any)?.transactionId ||
                  JSON.stringify(reg.paymentData).slice(0, 40)}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Checked In At:</span>{" "}
            {reg.checkedInAt
              ? new Date(reg.checkedInAt).toLocaleString("en-IN")
              : "—"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
