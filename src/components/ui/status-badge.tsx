import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"

type StatusKind = "event" | "registration" | "payment"

interface StatusBadgeProps extends Omit<VariantProps<typeof badgeVariants>, "variant"> {
  status: string
  kind?: StatusKind
  className?: string
}

const EVENT_VARIANTS: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  published: "default",
  draft: "outline",
  completed: "secondary",
}

const REGISTRATION_VARIANTS: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  confirmed: "secondary",
  pending: "outline",
  cancelled: "destructive",
}

const PAYMENT_VARIANTS: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  paid: "default",
  pending: "outline",
  failed: "destructive",
  refunded: "outline",
  not_required: "outline",
}

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  completed: "Completed",
  confirmed: "Confirmed",
  pending: "Pending",
  cancelled: "Cancelled",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  not_required: "Free",
}

const EXTRA_CLASSES: Record<string, string> = {
  pending: "border-amber-400 text-amber-700",
}

/**
 * Renders a consistent badge for event, registration, or payment statuses.
 *
 * Usage:
 *   <StatusBadge status="published" kind="event" />
 *   <StatusBadge status="confirmed" kind="registration" />
 *   <StatusBadge status="paid" kind="payment" />
 *
 * `kind` defaults to "event" for backwards compatibility.
 * Unknown statuses render as an outline badge with the raw status string.
 */
export function StatusBadge({ status, kind = "event", className, ...rest }: StatusBadgeProps) {
  const variants = kind === "payment"
    ? PAYMENT_VARIANTS
    : kind === "registration"
      ? REGISTRATION_VARIANTS
      : EVENT_VARIANTS

  const variant = variants[status] ?? "outline"
  const label = STATUS_LABELS[status] ?? (status || "Unknown")
  const extra = EXTRA_CLASSES[status] ?? ""

  return (
    <Badge variant={variant} className={`${extra} ${className ?? ""}`.trim()} {...rest}>
      {label}
    </Badge>
  )
}
