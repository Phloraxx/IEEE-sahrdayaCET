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
import { CertificateIssuancePanel } from "@/features/admin/events/certificate-issuance-panel";
import { CertificateDeliveryPanel } from "@/features/admin/events/certificate-delivery-panel";
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
  sendCertificateTemplateTestEmail,
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

const CERTIFICATE_PREVIEW_NAMES = [
  "A. B. Roy",
  "Alexandra Joseph",
  "Mohammed Abdul Rahman Kizhakkedath",
  "Anne-Marie O'Connor",
  "Sourav P Bijoy",
  "José María Fernández",
  "Nivedita Krishnakumar Varghese",
] as const;

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

function imageDimensions(blob: Blob) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const release = () => URL.revokeObjectURL(url);
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      release();
      resolve(dimensions);
    };
    image.onerror = () => {
      release();
      reject(new Error("Could not read certificate artwork dimensions"));
    };
    image.src = url;
  });
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
  previewDimensions,
  artworkPending,
  editable,
  onLayoutChange,
  onPreviewLoad,
}: {
  template: CertificateTemplate;
  layout: CertificateTemplateLayout;
  previewUrl: string;
  previewDimensions: { width: number; height: number } | null;
  artworkPending: boolean;
  editable: boolean;
  onLayoutChange: (layout: CertificateTemplateLayout) => void;
  onPreviewLoad: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const [previewName, setPreviewName] = useState<string>(CERTIFICATE_PREVIEW_NAMES[1]);
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewNameScale = Math.min(1, 26 / Math.max(26, previewName.length));
  const canvasWidth = previewDimensions?.width || template.canvasWidth || 2400;
  const canvasHeight = previewDimensions?.height || template.canvasHeight || 1350;
  const renderScale = previewWidth > 0 ? previewWidth / canvasWidth : 1;

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => setPreviewWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

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
        className="relative w-full overflow-hidden rounded-xl bg-white shadow-2xl"
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
        onPointerMove={(event) => {
          if (editable && dragging) moveTarget(dragging, event.clientX, event.clientY);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Certificate render base preview" className="absolute inset-0 h-full w-full object-fill" onLoad={onPreviewLoad} />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,#f8fbfd,#eef6fb)] text-center">
            <div>
              <FileImage className="mx-auto h-8 w-8 text-primary/60" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Upload the finished certificate artwork</p>
              <p className="mt-1 text-xs text-slate-500">Keep static artwork complete. The editor only positions recipient-specific fields.</p>
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
            fontSize: `${Math.max(8, layout.name.preferredFontSize * renderScale * previewNameScale)}px`,
            whiteSpace: "nowrap",
          }}
        >
          {previewName}
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
            fontSize: `${Math.max(7, layout.credentialId.fontSize * renderScale)}px`,
          }}
        >
          IEEESB-CERT-2026-000154
        </button>

        {layout.qr.enabled !== false && <button
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
        </button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1 pt-3 text-[11px] text-slate-300">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono tabular-nums">
            {previewUrl ? `${canvasWidth}×${canvasHeight}${artworkPending ? " · unsaved artwork" : ""}` : "Canvas pending"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 uppercase tracking-[0.14em] ${statusClasses(template.status)}`}>
            {template.status}
          </span>
        </div>
        {editable ? (
          <span className="inline-flex items-center gap-1.5"><Move className="h-3.5 w-3.5" /> Drag Name and ID to position; QR is optional</span>
        ) : (
          <span>Published versions are read-only</span>
        )}
      </div>
      <div className="border-t border-white/10 px-1 pb-1 pt-3" aria-label="Certificate preview stress names">
        <div className="flex flex-wrap gap-1.5">
          {CERTIFICATE_PREVIEW_NAMES.map((name, index) => (
            <button
              key={name}
              type="button"
              onClick={() => setPreviewName(name)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${previewName === name ? "border-sky-300/60 bg-sky-300/15 text-white" : "border-white/15 text-slate-300 hover:border-white/30 hover:text-white"}`}
              title={name}
            >
              {index === 2 ? "Very long" : index === 3 ? "Hyphen / apostrophe" : index === 5 ? "Accented" : name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Stress-preview common name shapes before publishing. The production renderer performs the authoritative font auto-fit and rejects a name rather than clipping it.</p>
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
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scannable verification</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Optional. The Credential ID is the primary printed identifier; add a QR only when the design benefits from one.</p></div>
          <label className="inline-flex shrink-0 items-center gap-2 text-xs font-medium"><input type="checkbox" checked={layout.qr.enabled !== false} disabled={disabled} onChange={(event) => patch("qr", { enabled: event.target.checked })} className="h-4 w-4 rounded border-border" />QR</label>
        </div>
        {layout.qr.enabled !== false && <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <PositionField id="cert-qr-x" label="Horizontal" value={layout.qr.x} disabled={disabled} onChange={(x) => patch("qr", { x })} />
          <PositionField id="cert-qr-y" label="Vertical" value={layout.qr.y} disabled={disabled} onChange={(y) => patch("qr", { y })} />
          <PositionField id="cert-qr-size" label="Size" value={layout.qr.size} disabled={disabled} onChange={(size) => patch("qr", { size: clamp(size, 0.04, 0.35) })} />
        </div>}
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
