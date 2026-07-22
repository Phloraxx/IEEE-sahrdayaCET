import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

interface DataListRow {
  id: string;
  primary: string;
  code?: string;
  secondary?: React.ReactNode;
  indicator?: React.ReactNode;
  metric?: { label: string; value: string | number };
  href?: string;
}

interface DataListProps {
  rows: DataListRow[];
  emptyMessage?: string;
  emptyHint?: string;
  className?: string;
}

export type { DataListRow };

export function DataList({
  rows,
  emptyMessage,
  emptyHint,
  className,
}: DataListProps) {
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">
          {emptyMessage ?? "No records yet"}
        </p>
        {emptyHint && (
          <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card divide-y divide-border",
        className,
      )}
    >
      {rows.map((row) => {
        const content = (
          <div className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-medium text-foreground">
                  {row.primary}
                </span>
                {row.code && (
                  <span className="hidden sm:inline-flex font-mono text-[10px] tracking-wider uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {row.code}
                  </span>
                )}
              </div>
              {row.secondary && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.secondary}
                </div>
              )}
            </div>
            {row.metric && (
              <div className="shrink-0 text-right hidden sm:block">
                <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {row.metric.value}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {row.metric.label}
                </div>
              </div>
            )}
            {row.indicator && <div className="shrink-0">{row.indicator}</div>}
            {row.href && (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground/50"
                aria-hidden="true"
              />
            )}
          </div>
        );

        return row.href ? (
          <Link
            key={row.id}
            to={row.href}
            aria-label={row.primary}
            className="block focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-safe:transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div key={row.id}>{content}</div>
        );
      })}
    </div>
  );
}
