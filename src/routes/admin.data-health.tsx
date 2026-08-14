import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, DatabaseZap, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { getAdminDataHealth } from "@/lib/data/admin-data-health.client";
import { formatDateTime } from "@/lib/dates";

export default function AdminDataHealth() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-data-health"],
    queryFn: getAdminDataHealth,
    staleTime: 15_000,
  });
  if (isLoading) return <div className="rounded-lg border border-border p-8 text-sm text-muted-foreground">Checking data integrity…</div>;
  if (isError || !data) return <div className="rounded-lg border border-destructive/30 p-6"><h1 className="font-semibold">Data Health unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{(error as Error)?.message}</p></div>;

  const critical = data.issues.filter((issue) => issue.severity === "critical").length;
  const warnings = data.issues.filter((issue) => issue.severity === "warning").length;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium text-muted-foreground">Operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Data Health</h1><p className="mt-1 text-sm text-muted-foreground">Read-only consistency checks across operational records.</p></div>
      <button type="button" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{isFetching ? "Checking…" : "Run checks again"}</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Critical</div><div className="mt-1 font-mono text-2xl font-semibold">{critical}</div></div>
      <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Warnings</div><div className="mt-1 font-mono text-2xl font-semibold">{warnings}</div></div>
      <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs text-muted-foreground">Checked</div><div className="mt-1 text-sm font-medium">{formatDateTime(data.checkedAt)}</div></div>
    </div>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {data.issues.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />No inconsistencies found.</div> : data.issues.map((issue) => <div key={issue.id} className="flex items-start gap-3 border-b border-border p-4 last:border-b-0"><div>{issue.severity === "critical" ? <DatabaseZap className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{issue.title}</div><div className="mt-1 text-xs text-muted-foreground">{issue.detail}</div></div>{issue.href && <Link to={issue.href} className="text-xs font-medium">Open <ExternalLink className="inline h-3 w-3" /></Link>}</div>)}
    </div>
  </div>;
}
