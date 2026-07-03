import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  context?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "danger" | "warning" | "info";
  className?: string;
}

const TONE_VALUE: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

const TREND_COLOR = {
  up: "text-success",
  down: "text-danger",
  flat: "text-muted-foreground",
} as const;

export function MetricCard({
  label,
  value,
  context,
  trend,
  icon: Icon,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-lg border border-border bg-card p-5",
        "transition-colors hover:border-foreground/15",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
            strokeWidth={2}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-4xl font-semibold tabular-nums tracking-tight leading-none",
            TONE_VALUE[tone],
          )}
        >
          {value}
        </span>
        {trend && (
          <span className={cn("text-xs font-medium", TREND_COLOR[trend.direction])}>
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}{" "}
            {trend.value}
          </span>
        )}
      </div>
      {context && (
        <p className="text-xs text-muted-foreground leading-snug">{context}</p>
      )}
    </div>
  );
}
