import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PanelHeader } from "@/components/admin/panel-header";
import { CertificateLifecycleDialog } from "@/features/admin/events/certificate-lifecycle-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCertificateDelivery,
  listCertificateBatches,
  retryFailedCertificateBatch,
  sendCertificateBatch,
  type CertificateDeliveryBatch,
  type CertificateDeliveryRow,
} from "@/lib/data/certificate-delivery.client";
import type { CertificateTemplate } from "@/lib/data/certificate-templates.client";
import { formatDateTime } from "@/lib/dates";

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function batchStatusClasses(status: string) {
  if (status === "sent") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "partial_failure") return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "sending") return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-border bg-muted/40 text-muted-foreground";
}

function deliveryStatus(row: CertificateDeliveryRow) {
  if (row.deliveryStatus === "sent") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Sent</span>;
  if (row.deliveryStatus === "pending" || row.deliveryStatus === "sending") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600"><Loader2 className={`h-3.5 w-3.5 ${row.deliveryStatus === "sending" ? "animate-spin" : ""}`} />{statusLabel(row.deliveryStatus)}</span>;
  if (row.deliveryStatus === "failed") return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertTriangle className="h-3.5 w-3.5" />Failed</span>;
  if (row.deliveryStatus === "missing_email") return <span className="text-xs font-medium text-amber-600">Missing email</span>;
  if (row.deliveryStatus === "not_active") return <span className="text-xs font-medium text-muted-foreground">Credential not active</span>;
  return <span className="text-xs font-medium text-muted-foreground">Not queued</span>;
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warning ? "border-amber-500/25 bg-amber-500/5" : "border-border bg-muted/15"}`}>
      <p className="font-mono text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

function BatchButton({ batch, active, onClick }: { batch: CertificateDeliveryBatch; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30"}`}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-mono text-[10px] text-muted-foreground">{batch.id.toUpperCase()}</p><p className="mt-1 text-sm font-semibold">{batch.issuedCount} issued</p></div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${batchStatusClasses(batch.status)}`}>{statusLabel(batch.status)}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{batch.issuedAt ? formatDateTime(batch.issuedAt) : "Issue time unavailable"}</p>
    </button>
  );
}

export function CertificateDeliveryPanel({
  eventId,
  canView,
  canSend,
  canRevoke,
  templates,
}: {
  eventId: string;
  canView: boolean;
  canSend: boolean;
  canRevoke: boolean;
  templates: CertificateTemplate[];
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [lifecycle, setLifecycle] = useState<{ mode: "revoke" | "replace"; row: CertificateDeliveryRow } | null>(null);
  const batchesQuery = useQuery({
    queryKey: ["certificate-batches", eventId],
    queryFn: () => listCertificateBatches(eventId),
    enabled: Boolean(eventId && canView),
  });
  const batches = useMemo(() => batchesQuery.data?.batches ?? [], [batchesQuery.data?.batches]);
  useEffect(() => {
    if ((!selectedId || !batches.some((batch) => batch.id === selectedId)) && batches[0]) setSelectedId(batches[0].id);
  }, [batches, selectedId]);

  const deliveryQuery = useQuery({
    queryKey: ["certificate-delivery", eventId, selectedId],
    queryFn: () => getCertificateDelivery(eventId, selectedId),
    enabled: Boolean(eventId && selectedId && canView),
    refetchInterval: (query) => query.state.data?.batch.status === "sending" ? 5_000 : false,
  });
  const delivery = deliveryQuery.data;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["certificate-batches", eventId] }),
      queryClient.invalidateQueries({ queryKey: ["certificate-delivery", eventId] }),
    ]);
  };
  const lifecycleComplete = async (replacementBatchId?: string) => {
    await refresh();
    if (replacementBatchId) setSelectedId(replacementBatchId);
  };
  const sendMutation = useMutation({
    mutationFn: () => sendCertificateBatch(eventId, selectedId),
    onSuccess: async (result) => { await refresh(); toast.success(result.queuedNow ? `${result.queuedNow} certificate email${result.queuedNow === 1 ? "" : "s"} queued` : "Certificate email jobs were already queued"); },
    onError: (error: Error) => toast.error(error.message || "Could not queue certificate emails"),
  });
  const retryMutation = useMutation({
    mutationFn: () => retryFailedCertificateBatch(eventId, selectedId),
    onSuccess: async (result) => { await refresh(); toast.success(`${result.retried} failed delivery attempt${result.retried === 1 ? "" : "s"} queued again`); },
    onError: (error: Error) => toast.error(error.message || "Could not retry certificate emails"),
  });

  if (!canView) return null;
  const batch = delivery?.batch;
  const busy = sendMutation.isPending || retryMutation.isPending;
  const queueableCount = delivery?.certificates.filter((row) => row.certificateStatus === "active" && Boolean(row.recipientEmail) && row.deliveryStatus === "not_queued").length ?? 0;
  const canQueue = Boolean(batch && canSend && batch.status === "issued" && queueableCount > 0);
  const canRetry = Boolean(batch && canSend && batch.failedCount > 0 && batch.status === "partial_failure");

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <PanelHeader
          eyebrow="Certificate delivery"
          title="Send & delivery"
          description="Issuing above creates the credential. This separate step queues email and tracks delivery without changing the certificate itself."
          actions={<Button variant="outline" size="sm" className="gap-2" disabled={deliveryQuery.isFetching || !selectedId} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${deliveryQuery.isFetching ? "animate-spin" : ""}`} />Refresh</Button>}
        />

        {batchesQuery.isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading issued batches…</div>
        ) : batches.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center">
            <Mail className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 font-semibold">No issued batches yet</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Complete Recipients → Review → Issue above. Nothing is emailed automatically.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-2" aria-label="Issued certificate batches">
              {batches.map((item) => <BatchButton key={item.id} batch={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />)}
            </aside>

            <div className="min-w-0 space-y-5">
              {deliveryQuery.isLoading || !delivery ? (
                <div className="flex items-center gap-2 rounded-xl border border-border p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading delivery state…</div>
              ) : (
                <>
                  <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/10 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={batchStatusClasses(delivery.batch.status)}>{statusLabel(delivery.batch.status)}</Badge><span className="font-mono text-[10px] text-muted-foreground">BATCH {delivery.batch.id}</span></div>
                      <h3 className="mt-3 text-lg font-semibold">Email the issued credentials</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">The email uses the frozen template copy and links to each recipient’s live verification page and PDF. Revoked or superseded credentials are never newly queued.</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canQueue && <Button className="gap-2" disabled={busy} onClick={() => sendMutation.mutate()}>{sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Queue {queueableCount} email{queueableCount === 1 ? "" : "s"}</Button>}
                      {canRetry && <Button variant="outline" className="gap-2" disabled={busy} onClick={() => retryMutation.mutate()}>{retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Retry failed</Button>}
                      {delivery.batch.status === "sending" && <Button disabled className="gap-2"><Loader2 className="h-4 w-4 animate-spin" />Delivery in progress</Button>}
                      {delivery.batch.status === "sent" && <Button disabled className="gap-2"><CheckCircle2 className="h-4 w-4" />Delivery complete</Button>}
                    </div>
                  </div>

                  {!canSend && (
                    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />You can inspect certificate delivery, but only users with certificate send permission can queue or retry email.</div>
                  )}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Metric label="Queued" value={delivery.batch.queuedCount} />
                    <Metric label="Sent" value={delivery.batch.sentCount} />
                    <Metric label="Failed" value={delivery.batch.failedCount} warning={delivery.batch.failedCount > 0} />
                    <Metric label="Missing email" value={delivery.batch.missingEmailCount} warning={delivery.batch.missingEmailCount > 0} />
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-border">
                    <div className="border-b border-border bg-muted/20 px-4 py-3"><p className="text-sm font-semibold">Recipient delivery</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="border-b border-border text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Credential</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                        <tbody>
                          {delivery.certificates.map((row) => (
                            <tr key={row.certificateId} className="border-b border-border align-top last:border-b-0">
                              <td className="px-4 py-3"><p className="font-medium">{row.recipientName}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.recipientEmail || "No email snapshot"}</p></td>
                              <td className="px-4 py-3"><p className="font-mono text-xs font-semibold">{row.credentialId}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{row.certificateStatus}</p>{row.revocationReason && <p className="mt-1 max-w-[260px] text-[10px] leading-relaxed text-muted-foreground" title={row.revocationReason}>{row.revocationReason}</p>}</td>
                              <td className="max-w-[280px] px-4 py-3">{deliveryStatus(row)}{row.sentAt && <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(row.sentAt)}</p>}{row.lastError && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-red-600" title={row.lastError}>{row.lastError}</p>}</td>
                              <td className="px-4 py-3 font-mono text-xs tabular-nums">{row.attempts}</td>
                              <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 text-xs"><a href={row.verificationUrl} target="_blank" rel="noreferrer">Verify <ExternalLink className="h-3.5 w-3.5" /></a></Button>{canRevoke && row.certificateStatus === "active" && <><Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setLifecycle({ mode: "revoke", row })}>Revoke</Button><Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLifecycle({ mode: "replace", row })}>Replace</Button></>}</div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {delivery.batch.status === "partial_failure" && (
                    <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /><p className="leading-relaxed text-muted-foreground">One or more emails exhausted automatic retries or hit a permanent delivery-safety block. Review the error before using Retry failed.</p></div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <CertificateLifecycleDialog
          eventId={eventId}
          row={lifecycle?.row ?? null}
          mode={lifecycle?.mode ?? "revoke"}
          open={Boolean(lifecycle)}
          templates={templates}
          onOpenChange={(open) => { if (!open) setLifecycle(null); }}
          onComplete={lifecycleComplete}
        />
      </CardContent>
    </Card>
  );
}
