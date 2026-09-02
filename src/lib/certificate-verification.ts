import { BadgeCheck, TriangleAlert, XCircle } from "lucide-react";
import type { CertificateVerification } from "@/server/public/certificate.server";

export function labelCertificateType(value = "") {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCertificateIssueDate(value = "") {
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function certificateStatusPresentation(status: CertificateVerification["status"]) {
  if (status === "ACTIVE") return {
    title: "Verified credential", body: "This credential is active in the IEEE Sahrdaya certificate registry.", icon: BadgeCheck,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-900", badge: "bg-emerald-100 text-emerald-800",
  };
  if (status === "REVOKED") return {
    title: "Revoked credential", body: "This credential remains in the registry, but it is no longer valid.", icon: XCircle,
    classes: "border-rose-200 bg-rose-50 text-rose-950", badge: "bg-rose-100 text-rose-800",
  };
  if (status === "SUPERSEDED") return {
    title: "Superseded credential", body: "This credential remains verifiable, but it has been replaced by a newer credential.", icon: TriangleAlert,
    classes: "border-amber-200 bg-amber-50 text-amber-950", badge: "bg-amber-100 text-amber-900",
  };
  return {
    title: "Invalid credential", body: "No certificate matches this verification reference.", icon: XCircle,
    classes: "border-slate-200 bg-slate-50 text-slate-900", badge: "bg-slate-200 text-slate-700",
  };
}
