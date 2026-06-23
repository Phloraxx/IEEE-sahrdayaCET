"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatDateShort } from "@/lib/dates";
import { getField } from "@/lib/safe-get";
 

import type { Registration } from "@/types";


export function RegistrationDetailClient({ reg: initialReg }: { reg: Registration }) {
  const [reg, setReg] = useState<Registration | null>(initialReg);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingAmount, setSavingAmount] = useState(false);

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
    if (!reg) return;
    try {
      const res = await fetch(`/api/admin/registrations/${reg.id}`, {
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

  if (!reg) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Registration data not available
      </div>
    );
  }
  const paymentData = getField<Record<string, unknown>>(reg, 'paymentData', {});
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
              ? formatDateShort(reg.createdAt)
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
          {(reg.discountAmount ?? 0) > 0 && (
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
                {getField(paymentData, 'paymentRef', '') ||
                  getField(paymentData, 'transactionId', '') ||
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
