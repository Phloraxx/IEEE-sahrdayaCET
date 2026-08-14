import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle, Loader2, ScanLine, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkInByTicket } from "@/lib/data/admin-registrations.client";
import { formatDateTime } from "@/lib/dates";

interface VerifyResult {
  success: boolean; message: string;
  registration?: { id: string; userName: string; userEmail: string; eventTitle: string; ticketId: string; checkedIn: boolean; checkedInAt: string | null };
}
interface BarcodeValue { rawValue: string }
interface Detector { detect(source: HTMLVideoElement): Promise<BarcodeValue[]> }
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

declare global { interface Window { BarcodeDetector?: DetectorConstructor } }

function ticketIdFromScan(value: string): string {
  const raw = value.trim();
  if (/^TKT-[A-Z0-9_-]{6,100}$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/ticket\/([^/]+)$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch { return ""; }
}

export default function AdminCheckIn() {
  const [ticketId, setTicketId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopScanner = () => {
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };
  useEffect(() => () => stopScanner(), []);

  const handleVerify = async (value = ticketId) => {
    const id = value.trim();
    if (!id || loading) return;
    setLoading(true); setError(""); setResult(null);
    try { const data = await checkInByTicket(id); setTicketId(id); setResult(data); }
    catch (err) { setError(err instanceof Error ? err.message : "Verification failed"); }
    finally { setLoading(false); }
  };

  const startScanner = async () => {
    setCameraError(""); setResult(null); setError("");
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera QR scanning is not supported by this browser. Use ticket search below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; setScanning(true);
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview unavailable");
      video.srcObject = stream; await video.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const id = codes.map((code) => ticketIdFromScan(code.rawValue)).find(Boolean);
          if (id) { stopScanner(); setTicketId(id); await handleVerify(id); return; }
        } catch { /* frame decode failure is normal */ }
        scanTimerRef.current = window.setTimeout(scan, 250);
      };
      scanTimerRef.current = window.setTimeout(scan, 250);
    } catch (err) {
      stopScanner();
      setCameraError(err instanceof Error ? err.message : "Camera permission was denied or unavailable.");
    }
  };

  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-medium text-muted-foreground">Operate</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Check-in</h1><p className="mt-1 text-sm text-muted-foreground">Scan the attendee QR or enter a ticket ID. Every successful check-in uses the audited registration command.</p></div><Button type="button" variant="outline" onClick={scanning ? stopScanner : startScanner} className="gap-1.5">{scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{scanning ? "Stop camera" : "Open camera"}</Button></div>

    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <video ref={videoRef} className={scanning ? "aspect-video w-full object-cover" : "hidden"} muted playsInline />
      {!scanning && <div className="flex aspect-video items-center justify-center text-center text-sm text-white/55"><div><ScanLine className="mx-auto mb-2 h-8 w-8" />Camera preview</div></div>}
    </div>
    {cameraError && <div className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">{cameraError}</div>}

    <div className="flex gap-2"><div className="relative flex-1"><ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="TKT-…" value={ticketId} onChange={(e) => setTicketId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleVerify(); }} className="pl-9 font-mono" disabled={loading} /></div><Button onClick={() => handleVerify()} disabled={!ticketId.trim() || loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}</Button></div>

    {error && <Card className="border-danger/30 bg-danger/5"><CardContent className="flex items-center gap-3 p-4"><XCircle className="h-5 w-5 shrink-0 text-danger" /><div><p className="text-sm font-medium text-danger">Check-in failed</p><p className="text-xs text-muted-foreground">{error}</p></div></CardContent></Card>}
    {result?.success && result.registration && <Card className="border-success/30 bg-success/5"><CardContent className="flex items-start gap-3 p-5"><CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" /><div className="min-w-0"><p className="text-base font-semibold text-success">{result.registration.userName}</p><p className="mt-1 text-sm">{result.registration.eventTitle}</p><p className="mt-2 font-mono text-xs text-muted-foreground">{result.registration.ticketId}</p>{result.registration.checkedInAt && <p className="mt-1 text-xs text-muted-foreground">Checked in {formatDateTime(result.registration.checkedInAt)}</p>}</div></CardContent></Card>}
  </div>;
}
