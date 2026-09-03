import { useEffect, useRef, useState } from "react";
import { FileImage, Loader2, Move, ScanLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CertificateTemplate, CertificateTemplateLayout, CertificateType } from "@/lib/data/certificate-templates.client";

export const CERTIFICATE_TYPES: Array<{ value: CertificateType; label: string }> = [
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

function previewGlyphWidthEm(character: string) {
  if (/\s/.test(character)) return 0.3;
  if (/[ilI1.,'`|]/.test(character)) return 0.3;
  if (/[MW@%&]/.test(character)) return 0.9;
  if (/[A-Z]/.test(character)) return 0.64;
  return 0.56;
}

const PREVIEW_FONT_WIDTH_SAFETY = 1.1;

function previewNameFontSize(name: string, layout: CertificateTemplateLayout["name"], canvasWidth: number) {
  const estimatedEm = Array.from(name.trim()).reduce((total, character) => total + previewGlyphWidthEm(character), 0) * PREVIEW_FONT_WIDTH_SAFETY;
  if (!estimatedEm || canvasWidth <= 0) return layout.preferredFontSize;
  const available = canvasWidth * layout.maxWidth;
  for (let size = layout.preferredFontSize; size >= layout.minFontSize; size -= 2) {
    if (estimatedEm * size <= available) return size;
  }
  return layout.minFontSize;
}

function percent(value: number) {
  return Math.round(value * 100);
}

function numberFromPercent(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed / 100) : fallback;
}

export function imageDimensions(blob: Blob) {
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
export function TemplatePreview({
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
  const canvasWidth = previewDimensions?.width || template.canvasWidth || 2400;
  const canvasHeight = previewDimensions?.height || template.canvasHeight || 1350;
  const renderScale = previewWidth > 0 ? previewWidth / canvasWidth : 1;
  const fittedPreviewFontSize = previewNameFontSize(previewName, layout.name, canvasWidth);

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
            fontSize: `${Math.max(8, fittedPreviewFontSize * renderScale)}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
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
            transform: layout.credentialId.align === "left" ? "translate(0, -50%)" : layout.credentialId.align === "right" ? "translate(-100%, -50%)" : "translate(-50%, -50%)",
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
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Stress-preview common name shapes before publishing. This preview mirrors the same deterministic fit heuristic at approximately {Math.round(fittedPreviewFontSize)} px; the production renderer still measures the real font and refuses clipping.</p>
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

export function AssetInput({
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

export function TemplateStatus({ template }: { template: CertificateTemplate }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClasses(template.status)}`}>
      {template.status} · v{template.version}
    </span>
  );
}

export function LayoutControls({
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

export function CreateTemplateDialog({ open, onOpenChange, pending, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onCreate: (name: string, certificateType: CertificateType) => void }) {
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
