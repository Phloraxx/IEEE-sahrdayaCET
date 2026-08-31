import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, BadgeCheck, Download, ExternalLink, MailCheck, MailWarning, Search } from "lucide-react";
import { toast } from "sonner";

import { PanelHeader } from "@/components/admin/panel-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  certificateRegistryCsv,
  listAllCertificateRegistry,
  listCertificateRegistry,
  type CertificateRegistryRow,
} from "@/lib/data/certificate-registry.client";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { formatDateTime } from "@/lib/dates";

const PER_PAGE = 40;
function statusClasses(status: string) {
  if (status === "active") return "border-emerald-500/25 bg-emerald-500/8 text-emerald-700";
  if (status === "revoked") return "border-red-500/25 bg-red-500/8 text-red-700";
  if (status === "superseded") return "border-amber-500/25 bg-amber-500/8 text-amber-700";
  return "border-border bg-muted/30 text-muted-foreground";
}

function deliveryLabel(row: CertificateRegistryRow) {
  const state = row.deliveryStatus;
  if (state === "missing_email") return "Missing email";
  if (state === "not_active") return "Not active";
  if (state === "not_queued") return "Not queued";
  if (state === "accepted" || state === "sent") return "Accepted";
  if (state === "delivered") return "Delivered";
  if (["failed", "bounced", "suppressed", "complained"].includes(state)) return "Delivery issue";
  return state ? state.replace(/_/g, " ") : "Pending";
}

function downloadCsv(contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `ieee-certificate-registry-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}
function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Award }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground/55" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

export default function AdminCertificates() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [event, setEvent] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [delivery, setDelivery] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const workspace = useQuery({ queryKey: ["workspace-me", user?.id], queryFn: getWorkspaceMe, enabled: Boolean(user?.id), staleTime: 30_000 });
  const canView = Boolean(workspace.data?.capabilities.includes("certificates.view"));
  const query = { page, perPage: PER_PAGE, search, event: event === "all" ? "" : event, status, type, delivery };
  const registry = useQuery({
    queryKey: ["certificate-registry", query],
    queryFn: () => listCertificateRegistry(query),
    enabled: Boolean(workspace.data && canView),
  });

  const resetPage = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const exportRegistry = async () => {
    setExporting(true);
    try {
      const rows = await listAllCertificateRegistry({ search, event: event === "all" ? "" : event, status, type, delivery });
      downloadCsv(certificateRegistryCsv(rows));
      toast.success(`Exported ${rows.length} certificate${rows.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export certificates");
    } finally {
      setExporting(false);
    }
  };

  if (workspace.isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  if (!canView) return <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="font-medium">Certificate registry unavailable</p><p className="mt-1 text-sm text-muted-foreground">Your workspace role does not include certificate visibility.</p></div>;
  const data = registry.data;
  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Credential operations"
        title="Certificate Registry"
        description={`${data?.total ?? 0} credential${data?.total === 1 ? "" : "s"} match the current filters.`}
        actions={<Button variant="outline" size="sm" className="gap-2" onClick={() => void exportRegistry()} disabled={exporting || registry.isLoading}>
          <Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export CSV"}
        </Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Credentials" value={data?.summary.total ?? 0} icon={Award} />
        <Metric label="Active" value={data?.summary.active ?? 0} icon={BadgeCheck} />
        <Metric label="Accepted" value={data?.summary.accepted ?? 0} icon={MailCheck} />
        <Metric label="Missing email" value={data?.summary.missingEmail ?? 0} icon={MailWarning} />
        <Metric label="Delivery issues" value={data?.summary.failed ?? 0} icon={MailWarning} />
      </div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 lg:grid-cols-[minmax(260px,1.4fr)_minmax(200px,1fr)_170px_170px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, email, Credential ID or event" className="pl-9" />
        </div>
        <Select value={event} onValueChange={resetPage(setEvent)}>
          <SelectTrigger><SelectValue placeholder="All events" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All events</SelectItem>{data?.events.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={resetPage(setStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All states</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="revoked">Revoked</SelectItem><SelectItem value="superseded">Superseded</SelectItem></SelectContent>
        </Select>
        <Select value={type} onValueChange={resetPage(setType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="participation">Participation</SelectItem><SelectItem value="completion">Completion</SelectItem><SelectItem value="achievement">Achievement</SelectItem><SelectItem value="appreciation">Appreciation</SelectItem><SelectItem value="volunteer">Volunteer</SelectItem><SelectItem value="speaker">Speaker</SelectItem></SelectContent>
        </Select>
        <Select value={delivery} onValueChange={resetPage(setDelivery)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All delivery states</SelectItem><SelectItem value="not_queued">Not queued</SelectItem><SelectItem value="missing_email">Missing email</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent>
        </Select>
      </div>
      {registry.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : registry.isError ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-sm text-destructive">{registry.error instanceof Error ? registry.error.message : "Could not load certificate registry"}</div>
      ) : !data?.certificates.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Award className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No certificates match these filters</p>
          <p className="text-xs text-muted-foreground">Try a different event, state, type, delivery filter or search.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="border-b border-border bg-muted/20 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Credential</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3 text-right">Open</th></tr>
                </thead>
                <tbody>
                  {data.certificates.map((row) => (
                    <tr key={row.certificateId} className="border-b border-border align-top last:border-b-0">
                      <td className="px-4 py-3"><p className="font-medium">{row.recipientName}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.recipientEmail || "No email snapshot"}</p></td>
                      <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{row.credentialId}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{row.certificateType}</p></td>
                      <td className="max-w-[280px] px-4 py-3"><p className="line-clamp-2 font-medium">{row.eventTitle}</p></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusClasses(row.status)}`}>{row.status}</span></td>
                      <td className="px-4 py-3"><p className="font-medium">{deliveryLabel(row)}</p>{row.lastError && <p className="mt-1 line-clamp-2 max-w-[220px] text-[10px] text-destructive" title={row.lastError}>{row.lastError}</p>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDateTime(row.issuedAt)}</td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" asChild><a href={row.verificationUrl} target="_blank" rel="noreferrer">Verify <ExternalLink className="h-3.5 w-3.5" /></a></Button><Button variant="outline" size="sm" className="h-8 text-xs" asChild><Link to={`/admin/events/${row.eventId}?tab=certificates`}>Event</Link></Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3 md:hidden">
            {data.certificates.map((row) => (
              <article key={row.certificateId} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-medium">{row.recipientName}</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{row.credentialId}</p></div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${statusClasses(row.status)}`}>{row.status}</span>
                </div>
                <div className="mt-4 grid gap-3 border-t border-border pt-3 text-xs">
                  <div><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Event</p><p className="mt-1 leading-relaxed">{row.eventTitle}</p></div>
                  <div className="grid grid-cols-2 gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p><p className="mt-1 capitalize">{row.certificateType}</p></div><div><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</p><p className="mt-1">{deliveryLabel(row)}</p></div></div>
                  <div><p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Issued</p><p className="mt-1">{formatDateTime(row.issuedAt)}</p></div>
                </div>
                <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild><a href={row.verificationUrl} target="_blank" rel="noreferrer">Verify <ExternalLink className="h-3.5 w-3.5" /></a></Button><Button size="sm" className="flex-1" asChild><Link to={`/admin/events/${row.eventId}?tab=certificates`}>Open event</Link></Button></div>
              </article>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Page {data.page} of {data.totalPages} · {data.total.toLocaleString("en-IN")} matching credentials</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
