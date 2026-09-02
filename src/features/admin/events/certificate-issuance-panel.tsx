import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CertificateTemplate } from "@/lib/data/certificate-templates.client";
import {
  issueCertificates,
  listCertificateCandidates,
  previewCertificateAudience,
  type CertificateAudiencePreview,
  type CertificateAudienceType,
  type CertificateIssueResult,
} from "@/lib/data/certificate-issuance.client";
type Stage = "recipients" | "review" | "issued";

const AUDIENCE_OPTIONS: Array<{
  value: CertificateAudienceType;
  title: string;
  description: string;
  disabled?: boolean;
}> = [
  { value: "checked_in", title: "Checked in", description: "Issue only to registrations with recorded event check-in." },
  { value: "confirmed", title: "Confirmed", description: "Issue to all currently confirmed registrations." },
  { value: "selected", title: "Selected", description: "Choose the exact registrations yourself." },
  { value: "attendance_qualified", title: "Attendance qualified", description: "Requires attendance-session data for multi-session events.", disabled: true },
];

function errorPayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { response?: unknown; data?: unknown };
  if (value.response && typeof value.response === "object") return value.response as Record<string, unknown>;
  if (value.data && typeof value.data === "object") return value.data as Record<string, unknown>;
  return null;
}

function exclusionLabel(reason: string) {
  if (reason === "cancelled") return "Registration cancelled";
  if (reason === "missing_name") return "Missing participant name";
  if (reason === "already_issued") return "Already has an active credential";
  if (reason === "not_found") return "Registration no longer exists";
  return reason.replaceAll("_", " ");
}
function StageRail({ stage }: { stage: Stage }) {
  const current = stage === "recipients" ? 1 : stage === "review" ? 2 : 3;
  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-muted/20">
      {["Recipients", "Review", "Issued"].map((label, index) => {
        const number = index + 1;
        return (
          <div
            key={label}
            className={`flex items-center gap-2 border-r border-border px-3 py-3 text-xs last:border-r-0 ${number === current ? "bg-primary/7 text-foreground" : "text-muted-foreground"}`}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] ${number <= current ? "border-primary/30 bg-primary/10 text-primary" : "border-border"}`}>
              {number}
            </span>
            <span className="font-medium">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warning ? "border-amber-500/25 bg-amber-500/5" : "border-border bg-muted/15"}`}>
      <p className="font-mono text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}
export function CertificateIssuancePanel({
  eventId,
  templates,
  canIssue,
}: {
  eventId: string;
  templates: CertificateTemplate[];
  canIssue: boolean;
}) {
  const queryClient = useQueryClient();
  const published = useMemo(() => templates.filter((item) => item.status === "published"), [templates]);
  const [stage, setStage] = useState<Stage>("recipients");
  const [templateId, setTemplateId] = useState("");
  const [audienceType, setAudienceType] = useState<CertificateAudienceType>("checked_in");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<CertificateAudiencePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<CertificateIssueResult | null>(null);

  const activeTemplateId = templateId || published[0]?.id || "";
  const candidatesQuery = useQuery({
    queryKey: ["certificate-candidates", eventId],
    queryFn: () => listCertificateCandidates(eventId),
    enabled: canIssue && audienceType === "selected",
  });
  const candidates = useMemo(() => candidatesQuery.data?.candidates ?? [], [candidatesQuery.data?.candidates]);
  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(needle));
  }, [candidates, search]);
  const audienceConfig = audienceType === "selected"
    ? { registrationIds: [...selectedIds].sort() }
    : {};

  const renderWarningsByRegistration = useMemo(() => {
    const map = new Map<string, CertificateAudiencePreview["renderWarnings"]>();
    for (const warning of preview?.renderWarnings ?? []) {
      const current = map.get(warning.registrationId) ?? [];
      current.push(warning);
      map.set(warning.registrationId, current);
    }
    return map;
  }, [preview]);

  const previewMutation = useMutation({
    mutationFn: () => previewCertificateAudience(eventId, {
      templateId: activeTemplateId,
      audienceType,
      audienceConfig,
    }),
    onSuccess: (result) => {
      setPreview(result);
      setConfirmed(false);
      setStage("review");
    },
    onError: (error: Error) => toast.error(error.message || "Could not preview certificate recipients"),
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Review the recipients first");
      return issueCertificates(eventId, {
        templateId: preview.template.id,
        audienceType: preview.audienceType,
        audienceConfig: preview.audienceConfig,
        audienceFingerprint: preview.audienceFingerprint,
        note,
      });
    },
    onSuccess: (result) => {
      setIssued(result);
      setStage("issued");
      setConfirmed(false);
      void queryClient.invalidateQueries({ queryKey: ["certificate-batches", eventId] });
      toast.success(`${result.batch.issuedCount} certificate${result.batch.issuedCount === 1 ? "" : "s"} issued`);
    },
    onError: (error: Error) => {
      const payload = errorPayload(error);
      if (payload?.code === "AUDIENCE_CHANGED" && payload.preview && typeof payload.preview === "object") {
        setPreview(payload.preview as unknown as CertificateAudiencePreview);
        setConfirmed(false);
        setStage("review");
        toast.error("Audience changed since review. Please confirm the refreshed audience.");
        return;
      }
      toast.error(error.message || "Could not issue certificates");
    },
  });
  const reset = () => {
    setStage("recipients");
    setPreview(null);
    setIssued(null);
    setConfirmed(false);
    setNote("");
  };

  if (!canIssue) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          You can view certificate templates, but you do not have issuance permission for this event.
        </CardContent>
      </Card>
    );
  }

  if (!published.length) {
    return (
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">Recipients unlock after publication</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Publish and freeze a certificate template before reviewing or issuing credentials.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Certificate issuance</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Recipients → Review → Issue</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review the exact people first. Issuing creates credentials only; email delivery is a separate later action.</p>
          </div>
          <Badge variant="outline" className="shrink-0">No automatic email</Badge>
        </div>
        <div className="mt-5"><StageRail stage={stage} /></div>
        {stage === "recipients" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="grid gap-1.5">
                <Label>Published template</Label>
                <Select value={activeTemplateId} onValueChange={(value) => { setTemplateId(value); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a published template" /></SelectTrigger>
                  <SelectContent>
                    {published.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} · v{template.version} · {template.certificateType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
                The selected template is already frozen. Changing the artwork later requires another template version and does not alter issued credentials.
              </div>
            </div>

            <div>
              <Label>Who should receive this certificate?</Label>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => { setAudienceType(option.value); setPreview(null); }}
                    className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${audienceType === option.value ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{option.title}</span>
                      {audienceType === option.value && !option.disabled && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
            {audienceType === "selected" && (
              <div className="rounded-2xl border border-border">
                <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Select registrations</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Only certificate-relevant identity and registration state are exposed here.</p>
                  </div>
                  <div className="relative w-full md:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="pl-9" />
                  </div>
                </div>
                <div className="flex items-center justify-between border-b border-border bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
                  <span>{selectedIds.length} selected · {candidates.length} registrations</span>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => {
                      const visible = filteredCandidates.map((item) => item.id);
                      const allVisibleSelected = visible.length > 0 && visible.every((id) => selectedIds.includes(id));
                      setSelectedIds(allVisibleSelected ? selectedIds.filter((id) => !visible.includes(id)) : Array.from(new Set([...selectedIds, ...visible])));
                    }}
                  >
                    {filteredCandidates.length > 0 && filteredCandidates.every((item) => selectedIds.includes(item.id)) ? "Clear shown" : "Select shown"}
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {candidatesQuery.isLoading ? (
                    <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading registrations…</div>
                  ) : filteredCandidates.length === 0 ? (
                    <p className="p-5 text-sm text-muted-foreground">No matching registrations.</p>
                  ) : filteredCandidates.map((candidate) => {
                    const checked = selectedIds.includes(candidate.id);
                    return (
                      <label key={candidate.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/20">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedIds(checked ? selectedIds.filter((id) => id !== candidate.id) : [...selectedIds, candidate.id])}
                          className="mt-1 h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{candidate.name || "Unnamed registration"}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{candidate.email || "No email address"}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={candidate.registrationStatus === "confirmed" ? "secondary" : "outline"}>{candidate.registrationStatus || "unknown"}</Badge>
                          {candidate.checkedIn && <span className="text-[10px] font-medium text-emerald-600">Checked in</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Review is mandatory. The system snapshots the exact audience before Issue is enabled.
                </p>
              </div>
              <Button
                className="shrink-0 gap-2"
                disabled={!activeTemplateId || previewMutation.isPending || (audienceType === "selected" && selectedIds.length === 0)}
                onClick={() => previewMutation.mutate()}
              >
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Review recipients
              </Button>
            </div>
          </div>
        )}
        {stage === "review" && preview && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold">Review the exact audience</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preview.template.name} · v{preview.template.version} · {preview.audienceType.replaceAll("_", " ")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2 self-start" onClick={() => { setStage("recipients"); setConfirmed(false); }}>
                <ChevronLeft className="h-4 w-4" />Change recipients
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Recipients" value={preview.recipientCount} />
              <Metric label="Email ready" value={preview.emailEligibleCount} />
              <Metric label="Missing email" value={preview.missingEmailCount} warning={preview.missingEmailCount > 0} />
              <Metric label="Name review" value={renderWarningsByRegistration.size} warning={renderWarningsByRegistration.size > 0} />
              <Metric label="Excluded" value={preview.excluded.length} warning={preview.excluded.length > 0} />
            </div>

            {preview.missingEmailCount > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="leading-relaxed text-muted-foreground">
                  {preview.missingEmailCount} recipient{preview.missingEmailCount === 1 ? " has" : "s have"} no email address. Their credentials can still be issued, but delivery later requires a corrected email or another delivery method.
                </p>
              </div>
            )}

            {preview.renderWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">Review {renderWarningsByRegistration.size} recipient name{renderWarningsByRegistration.size === 1 ? "" : "s"} before Issue</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Preflight predicts names that need font auto-fit, may exceed the configured minimum size, or need font-coverage review. It is intentionally advisory; the authoritative renderer still refuses clipping.</p>
                    <div className="mt-3 space-y-1.5">
                      {preview.renderWarnings.slice(0, 8).map((warning, index) => (
                        <p key={`${warning.registrationId}-${warning.code}-${index}`} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{warning.name}</span> — {warning.message}</p>
                      ))}
                      {preview.renderWarnings.length > 8 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">+{preview.renderWarnings.length - 8} more warning{preview.renderWarnings.length - 8 === 1 ? "" : "s"}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="border-b border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-semibold">Included recipients</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-border text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Email snapshot</th><th className="px-4 py-3 font-semibold">Name fit</th><th className="px-4 py-3 font-semibold">Delivery</th></tr>
                  </thead>
                  <tbody>
                    {preview.recipients.map((recipient) => {
                      const nameWarnings = renderWarningsByRegistration.get(recipient.id) ?? [];
                      return (
                        <tr key={recipient.id} className="border-b border-border last:border-b-0">
                          <td className="px-4 py-3 font-medium">{recipient.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{recipient.email || "—"}</td>
                          <td className="px-4 py-3">
                            {nameWarnings.length > 0 ? <span className="text-xs font-medium text-amber-600">Review ({nameWarnings.length})</span> : <span className="text-xs font-medium text-emerald-600">Preflight clear</span>}
                          </td>
                          <td className="px-4 py-3">
                            {recipient.emailEligible ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Mail className="h-3.5 w-3.5" />Email ready</span>
                            ) : (
                              <span className="text-xs font-medium text-amber-600">Missing email</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {preview.excluded.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="border-b border-border bg-muted/20 px-4 py-3">
                  <p className="text-sm font-semibold">Excluded from this batch</p>
                </div>
                <div className="divide-y divide-border">
                  {preview.excluded.map((recipient) => (
                    <div key={`${recipient.id}-${recipient.reason}`} className="flex flex-col gap-1 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
                      <div><span className="font-medium">{recipient.name || "Unknown registration"}</span>{recipient.email && <span className="ml-2 text-muted-foreground">{recipient.email}</span>}</div>
                      <span className="text-xs font-medium text-muted-foreground">{exclusionLabel(recipient.reason)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 rounded-2xl border border-border bg-muted/10 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="certificate-batch-note">Internal batch note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea id="certificate-batch-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this audience was approved, organizer reference, etc." />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm leading-relaxed">
                    <span className="font-semibold">I confirm these are the people who should receive this certificate, and I reviewed any name-fit warnings above.</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Issue is permanent. It creates verifiable credentials but does not send them. Name-fit warnings are advisory; rendering still fails closed instead of clipping.</span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div>
                  <div className="flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-primary" /><p className="font-semibold">Ready to issue</p></div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The server will recompute this audience inside the transaction. If anything changed after this review, Issue is blocked and you must confirm again.</p>
                  <p className="mt-3 break-all font-mono text-[9px] text-muted-foreground">AUDIENCE {preview.audienceFingerprint}</p>
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={!confirmed || preview.recipientCount === 0 || issueMutation.isPending}
                  onClick={() => issueMutation.mutate()}
                >
                  {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Issue {preview.recipientCount} certificate{preview.recipientCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {stage === "issued" && issued && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="text-lg font-semibold">{issued.batch.issuedCount} certificate{issued.batch.issuedCount === 1 ? "" : "s"} issued</h3>
                  <p className="mt-1 text-sm text-muted-foreground">The credentials now have permanent IDs and verification tokens.</p>
                  <p className="mt-3 font-semibold text-foreground">No email has been sent yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use the separate Send & delivery panel below when you are ready to queue email.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Issued" value={issued.batch.issuedCount} />
              <Metric label="Email ready" value={issued.batch.emailEligibleCount} />
              <Metric label="Missing email" value={issued.batch.missingEmailCount} warning={issued.batch.missingEmailCount > 0} />
              <Metric label="Queued email" value={0} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                <div><p className="text-sm font-semibold">Issued credentials</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">BATCH {issued.batch.id}</p></div>
                {issued.idempotent && <Badge variant="secondary">Idempotent replay</Badge>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-border text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><tr><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Credential ID</th><th className="px-4 py-3">Email status</th></tr></thead>
                  <tbody>
                    {issued.certificates.map((certificate) => (
                      <tr key={certificate.id} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3"><p className="font-medium">{certificate.recipientName}</p><p className="mt-0.5 text-xs text-muted-foreground">{certificate.recipientEmail || "No email"}</p></td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{certificate.credentialId}</td>
                        <td className="px-4 py-3">
                          {certificate.recipientEmail ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Mail className="h-3.5 w-3.5" />Ready for later delivery</span> : <span className="text-xs font-medium text-amber-600">Missing email</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <UserCheck className="mt-0.5 h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Batch issuance is complete. Sending remains a separate action in the delivery panel below.</p>
              </div>
              <Button variant="outline" onClick={reset}>Start another batch</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
