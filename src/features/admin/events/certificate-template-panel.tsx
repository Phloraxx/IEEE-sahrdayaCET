import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BadgeCheck,
  CopyPlus,
  FileImage,
  Loader2,
  Move,
  Plus,
  Save,
  ScanLine,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PanelHeader } from "@/components/admin/panel-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  archiveCertificateTemplate,
  createCertificateTemplate,
  createCertificateTemplateVersion,
  deleteCertificateTemplate,
  fetchCertificateTemplateAsset,
  listCertificateTemplates,
  publishCertificateTemplate,
  updateCertificateTemplate,
  type CertificateTemplate,
  type CertificateTemplateLayout,
  type CertificateType,
} from "@/lib/data/certificate-templates.client";
const CERTIFICATE_TYPES: Array<{ value: CertificateType; label: string }> = [
  { value: "participation", label: "Participation" },
  { value: "completion", label: "Completion" },
  { value: "achievement", label: "Achievement" },
  { value: "appreciation", label: "Appreciation" },
  { value: "volunteer", label: "Volunteer" },
  { value: "speaker", label: "Speaker" },
];

type DragTarget = "name" | "credentialId" | "qr";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function percent(value: number) {
  return Math.round(value * 100);
}

function numberFromPercent(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed / 100) : fallback;
}

function statusClasses(status: CertificateTemplate["status"]) {
  if (status === "published") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "archived") return "border-border bg-muted text-muted-foreground";
  return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}
function TemplatePreview({
  template,
  layout,
  previewUrl,
  editable,
  onLayoutChange,
}: {
  template: CertificateTemplate;
  layout: CertificateTemplateLayout;
  previewUrl: string;
  editable: boolean;
  onLayoutChange: (layout: CertificateTemplateLayout) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget | null>(null);

  const moveTarget = (target: DragTarget, clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((clientX - rect.left) / rect.width);
    const y = clamp((clientY - rect.top) / rect.height);
    onLayoutChange({
      ...layout,
      [target]: { ...layout[target], x, y },
    });
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-slate-950 p-3 shadow-sm">
      <div
        ref={surfaceRef}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-white shadow-2xl"
        onPointerMove={(event) => {
          if (editable && dragging) moveTarget(dragging, event.clientX, event.clientY);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Certificate render base preview" className="absolute inset-0 h-full w-full object-fill" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#f8fbfd,#eef6fb)] text-center">
            <div>
              <FileImage className="mx-auto h-8 w-8 text-primary/60" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Upload the flattened render-base PNG</p>
              <p className="mt-1 text-xs text-slate-500">Artwork and signatures stay static; only the three live fields below move.</p>
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={!editable}
          onPointerDown={(event) => {
            if (!editable) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging("name");
            moveTarget("name", event.clientX, event.clientY);
          }}
          className="absolute touch-none select-none rounded-md border border-primary/40 bg-white/85 px-2 py-1 shadow-sm backdrop-blur disabled:cursor-default"
          style={{
            left: `${layout.name.x * 100}%`,
            top: `${layout.name.y * 100}%`,
            width: `${layout.name.maxWidth * 100}%`,
            transform: "translate(-50%, -50%)",
            color: layout.name.color,
            textAlign: layout.name.align,
            fontFamily: layout.name.fontFamily === "noto-serif" ? "Georgia, serif" : "Arial, sans-serif",
            fontSize: `clamp(12px, ${Math.max(2.2, layout.name.preferredFontSize / 27)}vw, ${Math.max(20, layout.name.preferredFontSize * 0.4)}px)`,
          }}
        >
          Alexandra Joseph
        </button>
        <button
          type="button"
          disabled={!editable}
          onPointerDown={(event) => {
            if (!editable) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging("credentialId");
            moveTarget("credentialId", event.clientX, event.clientY);
          }}
          className="absolute touch-none select-none rounded border border-slate-400/50 bg-white/80 px-1.5 py-1 font-mono shadow-sm disabled:cursor-default"
          style={{
            left: `${layout.credentialId.x * 100}%`,
            top: `${layout.credentialId.y * 100}%`,
            transform: "translate(-50%, -50%)",
            color: layout.credentialId.color,
            textAlign: layout.credentialId.align,
            fontSize: `clamp(8px, ${Math.max(1, layout.credentialId.fontSize / 32)}vw, ${Math.max(11, layout.credentialId.fontSize * 0.45)}px)`,
          }}
        >
          IEEESB-CERT-2026-000154
        </button>

        <button
          type="button"
          disabled={!editable}
          onPointerDown={(event) => {
            if (!editable) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging("qr");
            moveTarget("qr", event.clientX, event.clientY);
          }}
          className="absolute grid aspect-square touch-none select-none place-items-center border border-slate-400/50 bg-white shadow-sm disabled:cursor-default"
          style={{ left: `${layout.qr.x * 100}%`, top: `${layout.qr.y * 100}%`, width: `${layout.qr.size * 100}%`, transform: "translate(-50%, -50%)" }}
          aria-label="QR placement preview"
        >
          <ScanLine className="h-1/2 w-1/2 text-slate-900" />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1 pt-3 text-[11px] text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono tabular-nums">
            {template.canvasWidth > 0 ? `${template.canvasWidth}×${template.canvasHeight}` : "Canvas pending"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 uppercase tracking-[0.14em] ${statusClasses(template.status)}`}>
            {template.status}
          </span>
        </div>
        {editable ? (
          <span className="inline-flex items-center gap-1.5"><Move className="h-3.5 w-3.5" /> Drag Name, ID or QR to position</span>
        ) : (
          <span>Published versions are read-only</span>
        )}
      </div>
    </div>
  );
}

function PositionField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={percent(value)}
          disabled={disabled}
          onChange={(event) => onChange(numberFromPercent(event.target.value, value))}
          className="pr-9 tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type="number" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next))); }}
          className={suffix ? "pr-10 tabular-nums" : "tabular-nums"} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function AssetInput({
  id,
  label,
  accept,
  currentName,
  disabled,
  multiple,
  onFiles,
}: {
  id: string;
  label: string;
  accept: string;
  currentName?: string;
  disabled: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-xl border border-border bg-muted/15 p-3">
      <Label htmlFor={id} className="flex items-center gap-2"><Upload className="h-3.5 w-3.5" />{label}</Label>
      <Input id={id} type="file" accept={accept} multiple={multiple} disabled={disabled}
        onChange={(event) => onFiles(Array.from(event.target.files ?? []))} className="cursor-pointer file:mr-3 file:border-0 file:bg-transparent file:text-xs file:font-semibold" />
      <p className="truncate text-[11px] text-muted-foreground">{currentName || "No stored file"}</p>
    </div>
  );
}

function TemplateStatus({ template }: { template: CertificateTemplate }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClasses(template.status)}`}>
      {template.status} · v{template.version}
    </span>
  );
}

function LayoutControls({
  layout,
  disabled,
  onChange,
}: {
  layout: CertificateTemplateLayout;
  disabled: boolean;
  onChange: (layout: CertificateTemplateLayout) => void;
}) {
  const patch = <K extends keyof CertificateTemplateLayout>(key: K, value: Partial<CertificateTemplateLayout[K]>) =>
    onChange({ ...layout, [key]: { ...layout[key], ...value } });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Participant name</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PositionField id="cert-name-x" label="Horizontal" value={layout.name.x} disabled={disabled} onChange={(x) => patch("name", { x })} />
          <PositionField id="cert-name-y" label="Vertical" value={layout.name.y} disabled={disabled} onChange={(y) => patch("name", { y })} />
          <PositionField id="cert-name-width" label="Max width" value={layout.name.maxWidth} disabled={disabled} onChange={(maxWidth) => patch("name", { maxWidth: clamp(maxWidth, 0.1, 0.95) })} />
          <NumberField id="cert-name-size" label="Preferred size" value={layout.name.preferredFontSize} min={20} max={360} suffix="px" disabled={disabled} onChange={(preferredFontSize) => patch("name", { preferredFontSize })} />
          <NumberField id="cert-name-min-size" label="Minimum size" value={layout.name.minFontSize} min={16} max={layout.name.preferredFontSize} suffix="px" disabled={disabled} onChange={(minFontSize) => patch("name", { minFontSize })} />
          <div className="grid gap-1.5"><Label>Name font</Label><Select disabled={disabled} value={layout.name.fontFamily} onValueChange={(fontFamily) => patch("name", { fontFamily: fontFamily as "noto-sans" | "noto-serif" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="noto-sans">Noto Sans</SelectItem><SelectItem value="noto-serif">Noto Serif</SelectItem></SelectContent></Select></div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>Name alignment</Label><Select disabled={disabled} value={layout.name.align} onValueChange={(align) => patch("name", { align: align as "left" | "center" | "right" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="cert-name-color">Name color</Label><div className="flex gap-2"><Input id="cert-name-color" type="color" value={layout.name.color} disabled={disabled} onChange={(event) => patch("name", { color: event.target.value.toUpperCase() })} className="h-10 w-14 p-1" /><Input value={layout.name.color} disabled={disabled} onChange={(event) => patch("name", { color: event.target.value })} className="font-mono uppercase" /></div></div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Credential ID</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PositionField id="cert-id-x" label="Horizontal" value={layout.credentialId.x} disabled={disabled} onChange={(x) => patch("credentialId", { x })} />
          <PositionField id="cert-id-y" label="Vertical" value={layout.credentialId.y} disabled={disabled} onChange={(y) => patch("credentialId", { y })} />
          <NumberField id="cert-id-size" label="Font size" value={layout.credentialId.fontSize} min={12} max={120} suffix="px" disabled={disabled} onChange={(fontSize) => patch("credentialId", { fontSize })} />
          <div className="grid gap-1.5"><Label>ID alignment</Label><Select disabled={disabled} value={layout.credentialId.align} onValueChange={(align) => patch("credentialId", { align: align as "left" | "center" | "right" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="cert-id-color">ID color</Label><div className="flex gap-2"><Input id="cert-id-color" type="color" value={layout.credentialId.color} disabled={disabled} onChange={(event) => patch("credentialId", { color: event.target.value.toUpperCase() })} className="h-10 w-14 p-1" /><Input value={layout.credentialId.color} disabled={disabled} onChange={(event) => patch("credentialId", { color: event.target.value })} className="font-mono uppercase" /></div></div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Verification QR</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <PositionField id="cert-qr-x" label="Horizontal" value={layout.qr.x} disabled={disabled} onChange={(x) => patch("qr", { x })} />
          <PositionField id="cert-qr-y" label="Vertical" value={layout.qr.y} disabled={disabled} onChange={(y) => patch("qr", { y })} />
          <PositionField id="cert-qr-size" label="Size" value={layout.qr.size} disabled={disabled} onChange={(size) => patch("qr", { size: clamp(size, 0.04, 0.35) })} />
        </div>
      </div>
    </div>
  );
}

function CreateTemplateDialog({ open, onOpenChange, pending, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onCreate: (name: string, certificateType: CertificateType) => void }) {
  const [name, setName] = useState("Participation Certificate");
  const [certificateType, setCertificateType] = useState<CertificateType>("participation");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create certificate template</DialogTitle><DialogDescription>Start a new event-scoped draft. Published versions stay immutable.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2"><div className="grid gap-1.5"><Label htmlFor="certificate-template-name">Template name</Label><Input id="certificate-template-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="grid gap-1.5"><Label>Certificate type</Label><Select value={certificateType} onValueChange={(value) => setCertificateType(value as CertificateType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CERTIFICATE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div></div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button disabled={pending || name.trim().length < 3} onClick={() => onCreate(name.trim(), certificateType)}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CertificateTemplatePanel({
  eventId,
  canView,
  canManage,
}: {
  eventId: string;
  canView: boolean;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [layout, setLayout] = useState<CertificateTemplateLayout | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailText, setEmailText] = useState("");
  const [sourceBackground, setSourceBackground] = useState<File | null>(null);
  const [renderBase, setRenderBase] = useState<File | null>(null);
  const [sourceSignatures, setSourceSignatures] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");

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
    setSourceBackground(null);
    setRenderBase(null);
    setSourceSignatures([]);
  }, [selected]);

  useEffect(() => {
    let revoked = false;
    let objectUrl = "";
    const load = async () => {
      try {
        if (renderBase) {
          objectUrl = URL.createObjectURL(renderBase);
          if (!revoked) setPreviewUrl(objectUrl);
          return;
        }
        if (!selected?.files.renderBase) {
          setPreviewUrl("");
          return;
        }
        const blob = await fetchCertificateTemplateAsset(selected.files.renderBase);
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setPreviewUrl(objectUrl);
      } catch (error) {
        if (!revoked) {
          setPreviewUrl("");
          toast.error(error instanceof Error ? error.message : "Could not load certificate artwork");
        }
      }
    };
    void load();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [renderBase, selected]);

  const editable = Boolean(selected && selected.status === "draft" && canManage);
  const hasLocalFiles = Boolean(sourceBackground || renderBase || sourceSignatures.length);
  const dirty = useMemo(() => {
    if (!selected || !layout) return false;
    return hasLocalFiles || JSON.stringify(layout) !== JSON.stringify(selected.layout) ||
      emailSubject !== selected.emailSubject || emailText !== selected.emailText;
  }, [selected, layout, emailSubject, emailText, hasLocalFiles]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["certificate-templates", eventId] });
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
        sourceBackground,
        renderBase,
        sourceSignatures,
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
              Start with a flattened 16:9 certificate artwork. The system adds only the participant name, credential ID, and verification QR at issue time.
            </p>
            {canManage && <Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create first template</Button>}
          </div>
          <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} pending={createMutation.isPending} onCreate={(name, certificateType) => createMutation.mutate({ name, certificateType })} />
        </CardContent>
      </Card>
    );
  }

  const busy = saveMutation.isPending || publishMutation.isPending || archiveMutation.isPending || versionMutation.isPending || deleteMutation.isPending;
  const storedSignatures = selected.files.sourceSignatures.map((asset) => asset.name).join(", ");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 md:p-8">
          <PanelHeader
            eyebrow="Certificates"
            title="Template Studio"
            description="Versioned certificate artwork with immutable publication. Finish the design here before selecting recipients."
            actions={canManage ? <Button size="sm" variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New template</Button> : undefined}
          />
          <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-2" aria-label="Certificate template versions">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
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
                  {canManage && selected.status !== "draft" && <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => versionMutation.mutate()}><CopyPlus className="h-4 w-4" />New version</Button>}
                </div>
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_360px]">
                <div className="space-y-4">
                  <TemplatePreview template={selected} layout={layout} previewUrl={previewUrl} editable={editable} onLayoutChange={setLayout} />
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Move className="h-3.5 w-3.5" />Drag the three live fields directly on the canvas.</span>
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
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The render-base PNG is the exact certificate artwork used for issuance. Background and signature files are retained as protected provenance only.</p>
                    <div className="mt-5 grid gap-3">
                      <AssetInput id="cert-render-base" label="Flattened render base" accept="image/png" currentName={renderBase?.name || selected.files.renderBase?.name} disabled={!editable} onFiles={(files) => setRenderBase(files[0] ?? null)} />
                      <AssetInput id="cert-source-background" label="Source background" accept="image/png,image/jpeg" currentName={sourceBackground?.name || selected.files.sourceBackground?.name} disabled={!editable} onFiles={(files) => setSourceBackground(files[0] ?? null)} />
                      <AssetInput id="cert-source-signatures" label="Signature sources" accept="image/png" multiple currentName={sourceSignatures.length ? sourceSignatures.map((file) => file.name).join(", ") : storedSignatures} disabled={!editable} onFiles={setSourceSignatures} />
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
    </div>
  );
}
