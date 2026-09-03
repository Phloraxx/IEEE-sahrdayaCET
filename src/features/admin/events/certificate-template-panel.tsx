import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BadgeCheck,
  CopyPlus,
  FileImage,
  Loader2,
  MailCheck,
  Move,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PanelHeader } from "@/components/admin/panel-header";
import { CertificateIssuancePanel } from "@/features/admin/events/certificate-issuance-panel";
import { CertificateDeliveryPanel } from "@/features/admin/events/certificate-delivery-panel";
import {
  archiveCertificateTemplate,
  createCertificateTemplate,
  createCertificateTemplateVersion,
  deleteCertificateTemplate,
  fetchCertificateTemplateAsset,
  listCertificateTemplates,
  publishCertificateTemplate,
  sendCertificateTemplateTestEmail,
  updateCertificateTemplate,
  type CertificateTemplateLayout,
  type CertificateType,
} from "@/lib/data/certificate-templates.client";
import {
  AssetInput,
  CERTIFICATE_TYPES,
  CreateTemplateDialog,
  LayoutControls,
  TemplatePreview,
  TemplateStatus,
  imageDimensions,
} from "./certificate-template-editor";
export function CertificateTemplatePanel({
  eventId,
  canView,
  canManage,
  canIssue,
  canSend,
  canRevoke,
}: {
  eventId: string;
  canView: boolean;
  canManage: boolean;
  canIssue: boolean;
  canSend: boolean;
  canRevoke: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [layout, setLayout] = useState<CertificateTemplateLayout | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [renderBase, setRenderBase] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const activePreviewUrlRef = useRef("");
  const stalePreviewUrlsRef = useRef<string[]>([]);

  const releaseStalePreviewUrls = () => {
    for (const url of stalePreviewUrlsRef.current) URL.revokeObjectURL(url);
    stalePreviewUrlsRef.current = [];
  };

  const templatesQuery = useQuery({
    queryKey: ["certificate-templates", eventId],
    queryFn: () => listCertificateTemplates(eventId),
    enabled: Boolean(eventId && canView),
  });
  const templates = useMemo(() => templatesQuery.data?.templates ?? [], [templatesQuery.data?.templates]);
  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? templates[0] ?? null,
    [templates, selectedId],
  );

  useEffect(() => {
    if (!selectedId && templates[0]) setSelectedId(templates[0].id);
  }, [selectedId, templates]);

  useEffect(() => {
    if (!selected) return;
    setLayout(selected.layout);
    setEmailSubject(selected.emailSubject);
    setEmailText(selected.emailText);
    setRenderBase(null);
    setPreviewDimensions(null);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    let pendingObjectUrl = "";
    const load = async () => {
      try {
        const blob = renderBase ?? (selected?.files.renderBase ? await fetchCertificateTemplateAsset(selected.files.renderBase) : null);
        if (!blob || cancelled) {
          if (!cancelled) {
            setPreviewUrl("");
            setPreviewDimensions(null);
          }
          return;
        }

        const dimensions = renderBase ? await imageDimensions(renderBase) : null;
        if (cancelled) return;

        pendingObjectUrl = URL.createObjectURL(blob);
        const previousUrl = activePreviewUrlRef.current;
        activePreviewUrlRef.current = pendingObjectUrl;
        pendingObjectUrl = "";
        if (previousUrl && previousUrl !== activePreviewUrlRef.current) stalePreviewUrlsRef.current.push(previousUrl);
        setPreviewDimensions(dimensions);
        setPreviewUrl(activePreviewUrlRef.current);
      } catch (error) {
        if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        if (!cancelled) {
          setPreviewUrl("");
          setPreviewDimensions(null);
          toast.error(error instanceof Error ? error.message : "Could not load certificate artwork");
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
    };
  }, [renderBase, selected]);

  useEffect(() => () => {
    releaseStalePreviewUrls();
    if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
    activePreviewUrlRef.current = "";
  }, []);

  const editable = Boolean(selected && selected.status === "draft" && canManage);
  const hasLocalFiles = Boolean(renderBase);
  const dirty = useMemo(() => {
    if (!selected || !layout) return false;
    return hasLocalFiles || JSON.stringify(layout) !== JSON.stringify(selected.layout) ||
      emailSubject !== selected.emailSubject || emailText !== selected.emailText;
  }, [selected, layout, emailSubject, emailText, hasLocalFiles]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["certificate-templates", eventId] });
  };
  const chooseTemplate = (templateId: string) => {
    if (templateId === selected?.id) return;
    if (dirty && !window.confirm("Discard the unsaved certificate changes and switch versions?")) return;
    setSelectedId(templateId);
  };


  const createMutation = useMutation({
    mutationFn: (input: { name: string; certificateType: CertificateType }) => createCertificateTemplate(eventId, input),
    onSuccess: async ({ template }) => {
      setCreateOpen(false);
      setSelectedId(template.id);
      await invalidate();
      toast.success("Certificate draft created");
    },
    onError: (error: Error) => toast.error(error.message || "Could not create certificate template"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !layout) throw new Error("Select a certificate template first");
      return updateCertificateTemplate(selected.id, {
        layout,
        emailSubject,
        emailText,
        renderBase,
      });
    },
    onSuccess: async ({ template }) => {
      setSelectedId(template.id);
      await invalidate();
      toast.success("Certificate draft saved");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save certificate draft"),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a certificate template first");
      if (dirty) throw new Error("Save the draft before publishing it");
      return publishCertificateTemplate(selected.id);
    },
    onSuccess: async () => { await invalidate(); toast.success("Certificate template published and frozen"); },
    onError: (error: Error) => toast.error(error.message || "Could not publish certificate template"),
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a certificate template first");
      if (dirty) throw new Error("Save the draft before sending a test email");
      return sendCertificateTemplateTestEmail(selected.id);
    },
    onSuccess: ({ recipient }) => {
      toast.success(`TEST / NOT VALID email sent to ${recipient}`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not send certificate test email"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => selected ? archiveCertificateTemplate(selected.id) : Promise.reject(new Error("Select a template")),
    onSuccess: async () => { await invalidate(); toast.success("Certificate template archived"); },
    onError: (error: Error) => toast.error(error.message || "Could not archive certificate template"),
  });

  const versionMutation = useMutation({
    mutationFn: () => selected ? createCertificateTemplateVersion(selected.id) : Promise.reject(new Error("Select a template")),
    onSuccess: async ({ template }) => {
      setSelectedId(template.id);
      await invalidate();
      toast.success(`Version ${template.version} draft created`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not create a new template version"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => selected ? deleteCertificateTemplate(selected.id) : Promise.reject(new Error("Select a template")),
    onSuccess: async () => {
      setSelectedId("");
      await invalidate();
      toast.success("Draft deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete certificate draft"),
  });

  if (!canView) {
    return <Card><CardContent className="p-8 text-sm text-muted-foreground">You do not have certificate access for this event.</CardContent></Card>;
  }

  if (templatesQuery.isLoading) {
    return <Card><CardContent className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (!selected || !layout) {
    return (
      <Card>
        <CardContent className="p-6 md:p-8">
          <PanelHeader
            eyebrow="Certificates"
            title="Template Studio"
            description="Create a versioned certificate design before selecting recipients. Issuing and sending remain separate later steps."
            actions={canManage ? <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New template</Button> : undefined}
          />
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/15 px-6 py-14 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-primary/60" />
            <h3 className="mt-4 text-lg font-semibold">No certificate templates yet</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Upload one finished certificate artwork. Keep every static element—logos, signatures, titles, borders and fixed wording—in that image. The system adds only recipient-specific fields.
            </p>
            {canManage && <Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create first template</Button>}
          </div>
          <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} pending={createMutation.isPending} onCreate={(name, certificateType) => createMutation.mutate({ name, certificateType })} />
        </CardContent>
      </Card>
    );
  }

  const busy = saveMutation.isPending || publishMutation.isPending || testEmailMutation.isPending || archiveMutation.isPending || versionMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 md:p-8">
          <PanelHeader
            eyebrow="Certificates"
            title="Template Studio"
            description="One finished artwork, two required dynamic fields, and an optional QR. What you preview here is what the renderer uses when credentials are issued."
            actions={canManage ? <Button size="sm" variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New template</Button> : undefined}
          />
          <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-2" aria-label="Certificate template versions">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => chooseTemplate(template.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selected.id === template.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-semibold">{template.name}</p><span className="font-mono text-[10px] text-muted-foreground">v{template.version}</span></div>
                  <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{template.certificateType}</span><span className={`h-2 w-2 rounded-full ${template.status === "published" ? "bg-emerald-500" : template.status === "archived" ? "bg-slate-400" : "bg-amber-500"}`} aria-label={template.status} /></div>
                </button>
              ))}
            </aside>

            <div className="min-w-0 space-y-6">
              <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><TemplateStatus template={selected} />{dirty && <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Unsaved changes</span>}</div><h3 className="mt-3 text-2xl font-semibold tracking-tight">{selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">{CERTIFICATE_TYPES.find((item) => item.value === selected.certificateType)?.label} certificate · {selected.canvasWidth && selected.canvasHeight ? `${selected.canvasWidth}×${selected.canvasHeight}` : "canvas pending"}</p></div>
                <div className="flex flex-wrap gap-2">
                  {editable && <Button size="sm" className="gap-2" disabled={busy || !dirty} onClick={() => saveMutation.mutate()}><Save className="h-4 w-4" />Save draft</Button>}
                  {editable && <Button size="sm" variant="outline" className="gap-2" disabled={busy || dirty} onClick={() => publishMutation.mutate()}><BadgeCheck className="h-4 w-4" />Publish</Button>}
                  {canManage && selected.status === "published" && <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => archiveMutation.mutate()}><Archive className="h-4 w-4" />Archive</Button>}
                  {canManage && selected.status !== "draft" && <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => versionMutation.mutate()}><CopyPlus className="h-4 w-4" />Edit as new version</Button>}
                </div>
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_360px]">
                <div className="space-y-4">
                  <TemplatePreview template={selected} layout={layout} previewUrl={previewUrl} previewDimensions={previewDimensions} artworkPending={Boolean(renderBase)} editable={editable} onLayoutChange={setLayout} onPreviewLoad={releaseStalePreviewUrls} />
                  {(selected.preflightWarnings ?? []).length > 0 && (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-sm font-semibold">Name-fit review recommended</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">These are deterministic preflight warnings against the built-in stress names. They do not replace the authoritative renderer.</p>
                          <div className="mt-3 space-y-1.5">
                            {(selected.preflightWarnings ?? []).slice(0, 5).map((warning, index) => (
                              <p key={`${warning.code}-${warning.name}-${index}`} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{warning.name}</span> — {warning.message}</p>
                            ))}
                            {(selected.preflightWarnings ?? []).length > 5 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">+{(selected.preflightWarnings ?? []).length - 5} more preflight warning{(selected.preflightWarnings ?? []).length - 5 === 1 ? "" : "s"}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Move className="h-3.5 w-3.5" />Drag the live fields directly on the canvas.</span>
                    <span>Use exact controls for final alignment.</span>
                    {selected.status !== "draft" && <span className="font-medium text-foreground">Published artwork is read-only.</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
                  <LayoutControls layout={layout} disabled={!editable} onChange={setLayout} />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Artwork files</p><h4 className="mt-1 text-lg font-semibold">Immutable visual base</h4></div><FileImage className="h-5 w-5 text-primary" /></div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Upload the finished certificate artwork once. Anything identical for every recipient—including logos, signatures, certificate wording and decorative elements—belongs in this image.</p>
                    <div className="mt-5 grid gap-3">
                      <AssetInput id="cert-render-base" label="Certificate artwork (PNG)" accept="image/png" currentName={renderBase?.name || selected.files.renderBase?.name} disabled={!editable} onFiles={(files) => setRenderBase(files[0] ?? null)} />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">Recommended: export the final design at 2400×1350 or another landscape size above 1000×700. Do not leave blank signature/logo areas for the website to assemble later.</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery copy</p><h4 className="mt-1 text-lg font-semibold">Certificate email</h4></div><ShieldCheck className="h-5 w-5 text-primary" /></div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Email remains plain-text authored in v1; safe HTML is generated server-side when delivery is implemented.</p>
                    <div className="mt-5 grid gap-4">
                      <div className="grid gap-1.5"><Label htmlFor="cert-email-subject">Subject</Label><Input id="cert-email-subject" value={emailSubject} disabled={!editable} onChange={(event) => setEmailSubject(event.target.value)} /></div>
                      <div className="grid gap-1.5"><Label htmlFor="cert-email-body">Body</Label><Textarea id="cert-email-body" rows={8} value={emailText} disabled={!editable} onChange={(event) => setEmailText(event.target.value)} className="font-mono text-xs leading-relaxed" /></div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">Supported variables: <code>{"{{name}}"}</code>, <code>{"{{firstName}}"}</code>, <code>{"{{eventTitle}}"}</code>, <code>{"{{credentialId}}"}</code>, <code>{"{{verificationUrl}}"}</code>, <code>{"{{certificateType}}"}</code>, <code>{"{{issueDate}}"}</code>.</p>
                      {canManage && selected.status !== "archived" && (
                        <div className="rounded-xl border border-border bg-muted/15 p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] leading-relaxed text-muted-foreground">Sends SAMPLE data only to your signed-in account. The message is visibly marked <span className="font-semibold text-foreground">TEST / NOT VALID</span>, creates no credential or outbox job, and still obeys the central staging mail guard.</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="shrink-0 gap-2"
                              disabled={busy || dirty}
                              onClick={() => testEmailMutation.mutate()}
                            >
                              {testEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
                              Send test email
                            </Button>
                          </div>
                          {dirty && <p className="mt-2 text-[10px] font-medium text-amber-600">Save the current draft first so the test matches persisted email copy.</p>}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-2xl border border-border bg-muted/15 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Version integrity</p><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Publishing freezes this exact artwork, layout and email copy. Future corrections must use a new version so already-issued credentials always retain their original design.</p>{selected.contentHash && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {selected.contentHash}</p>}</div>
                  {editable && <Button variant="destructive" size="sm" className="shrink-0 gap-2" disabled={busy} onClick={() => { if (window.confirm("Delete this unpublished certificate draft?")) deleteMutation.mutate(); }}><Trash2 className="h-4 w-4" />Delete draft</Button>}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} pending={createMutation.isPending} onCreate={(name, certificateType) => createMutation.mutate({ name, certificateType })} />
      <CertificateIssuancePanel eventId={eventId} templates={templates} canIssue={canIssue} />
      <CertificateDeliveryPanel eventId={eventId} canView={canView} canSend={canSend} canRevoke={canRevoke} templates={templates} />
    </div>
  );
}
