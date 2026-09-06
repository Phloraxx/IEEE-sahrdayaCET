import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkInByTicket } from "@/lib/data/admin-registrations.client";
import {
  attendanceRequestError,
  correctSessionAttendance,
  getAttendanceContext,
  getAttendanceSessionState,
  recordSessionAttendance,
  type AttendanceContextEvent,
  type AttendanceRecentRow,
} from "@/lib/data/attendance.client";
import { formatDateTime } from "@/lib/dates";

interface BarcodeValue { rawValue: string }
interface Detector { detect(source: HTMLVideoElement): Promise<BarcodeValue[]> }
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

declare global { interface Window { BarcodeDetector?: DetectorConstructor } }

type FeedbackKind = "success" | "duplicate" | "wrong" | "error";
interface ScanFeedback {
  kind: FeedbackKind;
  title: string;
  message: string;
  ticketId?: string;
  occurredAt?: string;
}
interface CorrectionState {
  row: AttendanceRecentRow;
  action: "manual_add" | "manual_remove";
}

function ticketIdFromScan(value: string): string {
  const raw = value.trim();
  if (/^TKT-[A-Z0-9_-]{6,100}$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/ticket\/([^/]+)$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const key = "ieee-attendance-device-id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const value = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, value);
    return value;
  } catch {
    return "web-session";
  }
}

function idempotencyKey(deviceId: string, sessionId: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${deviceId}:${sessionId}:${nonce}`.slice(0, 180);
}

function operatorFeedback(kind: FeedbackKind) {
  if (typeof window === "undefined") return;
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "success" ? 70 : [60, 45, 60]);
  } catch { /* optional hardware feedback */ }
  try {
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "success" ? 880 : kind === "duplicate" ? 520 : 240;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
  } catch { /* audio feedback is best-effort */ }
}

function defaultEvent(events: AttendanceContextEvent[]): AttendanceContextEvent | undefined {
  const enabledPublished = events.filter((event) => event.status === "published" && event.checkInEnabled);
  if (enabledPublished.length) {
    const now = Date.now();
    return enabledPublished.slice().sort((a, b) => {
      const aTime = Date.parse(a.date || "");
      const bTime = Date.parse(b.date || "");
      return Math.abs((Number.isFinite(aTime) ? aTime : now) - now) - Math.abs((Number.isFinite(bTime) ? bTime : now) - now);
    })[0];
  }
  return events[0];
}

function feedbackFromError(error: unknown): ScanFeedback {
  const parsed = attendanceRequestError(error);
  if (parsed.code === "ALREADY_PRESENT" || parsed.code === "ALREADY_CHECKED_IN") {
    return { kind: "duplicate", title: "Already recorded", message: parsed.message };
  }
  if (parsed.code === "WRONG_EVENT" || parsed.code === "WRONG_SESSION") {
    return { kind: "wrong", title: "Wrong event or session", message: parsed.message };
  }
  return { kind: "error", title: "Check-in failed", message: parsed.message };
}

export default function AdminCheckIn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [ticketId, setTicketId] = useState("");
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [correctionNote, setCorrectionNote] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ ticketId: string; at: number }>({ ticketId: "", at: 0 });

  const context = useQuery({
    queryKey: ["attendance-context"],
    queryFn: getAttendanceContext,
    refetchInterval: 15_000,
  });
  const events = useMemo(() => context.data?.events ?? [], [context.data?.events]);
  const requestedEventId = searchParams.get("event") || "";
  const requestedSessionId = searchParams.get("session") || "";
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === requestedEventId) ?? defaultEvent(events),
    [events, requestedEventId],
  );
  const selectedSession = useMemo(() => {
    if (!selectedEvent || selectedEvent.mode !== "sessions") return undefined;
    return selectedEvent.sessions.find((session) => session.id === requestedSessionId)
      ?? selectedEvent.sessions.find((session) => session.attendanceEnabled && session.checkInEnabled)
      ?? selectedEvent.sessions[0];
  }, [requestedSessionId, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    const eventId = selectedEvent.id;
    const sessionId = selectedEvent.mode === "sessions" ? selectedSession?.id || "" : "";
    if (eventId === requestedEventId && sessionId === requestedSessionId) return;
    const next = new URLSearchParams(searchParams);
    next.set("event", eventId);
    if (sessionId) next.set("session", sessionId); else next.delete("session");
    setSearchParams(next, { replace: true });
  }, [requestedEventId, requestedSessionId, searchParams, selectedEvent, selectedSession, setSearchParams]);

  const sessionState = useQuery({
    queryKey: ["attendance-session-state", selectedSession?.id],
    queryFn: () => getAttendanceSessionState(selectedSession!.id),
    enabled: Boolean(selectedSession?.id),
    refetchInterval: scanning ? 2_500 : 5_000,
  });

  const stopScanner = useCallback(() => {
    if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);
  useEffect(() => { stopScanner(); }, [requestedEventId, requestedSessionId, stopScanner]);

  const refreshAttendance = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["attendance-context"] });
    if (selectedSession?.id) {
      void queryClient.invalidateQueries({ queryKey: ["attendance-session-state", selectedSession.id] });
    }
  }, [queryClient, selectedSession?.id]);

  const submitTicket = useCallback(async (value: string) => {
    const id = value.trim();
    if (!id || busyRef.current) return;
    if (!selectedEvent) {
      setFeedback({ kind: "error", title: "Select an event", message: "No check-in assignment is selected." });
      return;
    }
    if (selectedEvent.mode === "sessions" && !selectedSession) {
      setFeedback({ kind: "error", title: "Select a session", message: "Session attendance requires an explicit session." });
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setTicketId(id);
    setFeedback(null);
    try {
      if (selectedEvent.mode === "sessions" && selectedSession) {
        const result = await recordSessionAttendance({
          ticketId: id,
          eventId: selectedEvent.id,
          sessionId: selectedSession.id,
          idempotencyKey: idempotencyKey(getDeviceId(), selectedSession.id),
          deviceId: getDeviceId(),
        });
        const next: ScanFeedback = {
          kind: result.replayed ? "duplicate" : "success",
          title: result.replayed ? "Already recorded" : "Attendance recorded",
          message: `${result.registration.sessionTitle} · ${result.presentCount} present`,
          ticketId: result.registration.ticketId,
          occurredAt: result.registration.occurredAt,
        };
        setFeedback(next);
        operatorFeedback(next.kind);
      } else {
        const result = await checkInByTicket(id, selectedEvent.id);
        const registration = result.registration;
        const next: ScanFeedback = {
          kind: "success",
          title: "Checked in",
          message: "Legacy single check-in recorded",
          ticketId: registration?.ticketId,
          occurredAt: registration?.checkedInAt || undefined,
        };
        setFeedback(next);
        operatorFeedback("success");
      }
      refreshAttendance();
    } catch (error) {
      const next = feedbackFromError(error);
      setFeedback(next);
      operatorFeedback(next.kind);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [refreshAttendance, selectedEvent, selectedSession]);

  const startScanner = async () => {
    setCameraError("");
    setFeedback(null);
    if (!selectedEvent) {
      setCameraError("Select an assigned event before opening the camera.");
      return;
    }
    if (selectedEvent.mode === "sessions" && !selectedSession) {
      setCameraError("Select an attendance session before opening the camera.");
      return;
    }
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera QR scanning is not supported by this browser. Use ticket entry below.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview unavailable");
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          if (!busyRef.current) {
            const codes = await detector.detect(videoRef.current);
            const id = codes.map((code) => ticketIdFromScan(code.rawValue)).find(Boolean);
            if (id) {
              const now = Date.now();
              const last = lastScanRef.current;
              if (last.ticketId !== id || now - last.at > 2500) {
                lastScanRef.current = { ticketId: id, at: now };
                await submitTicket(id);
                if (!streamRef.current) return;
                scanTimerRef.current = window.setTimeout(scan, 850);
                return;
              }
            }
          }
        } catch { /* frame decode failure is normal */ }
        scanTimerRef.current = window.setTimeout(scan, 220);
      };
      scanTimerRef.current = window.setTimeout(scan, 220);
    } catch (error) {
      stopScanner();
      setCameraError(error instanceof Error ? error.message : "Camera permission was denied or unavailable.");
    }
  };

  const correctionMutation = useMutation({
    mutationFn: ({ state, note }: { state: CorrectionState; note: string }) => correctSessionAttendance({
      registrationId: state.row.registrationId,
      sessionId: selectedSession?.id || "",
      action: state.action,
      note,
      deviceId: getDeviceId(),
    }),
    onSuccess: (result) => {
      setCorrection(null);
      setCorrectionNote("");
      refreshAttendance();
      setFeedback({
        kind: "success",
        title: result.present ? "Attendance restored" : "Attendance corrected",
        message: "The correction was appended to the attendance history.",
      });
      operatorFeedback("success");
    },
    onError: (error) => {
      const parsed = attendanceRequestError(error);
      setFeedback({ kind: "error", title: "Correction failed", message: parsed.message });
    },
  });

  const chooseEvent = (eventId: string) => {
    stopScanner();
    const event = events.find((row) => row.id === eventId);
    const next = new URLSearchParams(searchParams);
    next.set("event", eventId);
    const session = event?.mode === "sessions"
      ? event.sessions.find((row) => row.attendanceEnabled && row.checkInEnabled) ?? event.sessions[0]
      : undefined;
    if (session) next.set("session", session.id); else next.delete("session");
    setSearchParams(next, { replace: true });
    setFeedback(null);
  };
  const chooseSession = (sessionId: string) => {
    stopScanner();
    const next = new URLSearchParams(searchParams);
    next.set("session", sessionId);
    setSearchParams(next, { replace: true });
    setFeedback(null);
  };

  const presentCount = selectedEvent?.mode === "sessions"
    ? sessionState.data?.session.presentCount ?? selectedSession?.presentCount ?? 0
    : selectedEvent?.checkedInCount ?? 0;
  const scanDisabled = !selectedEvent
    || !selectedEvent.checkInEnabled
    || selectedEvent.status !== "published"
    || (selectedEvent.mode === "sessions" && (!selectedSession || !selectedSession.attendanceEnabled || !selectedSession.checkInEnabled));
  const feedbackIcon = feedback?.kind === "success"
    ? <CheckCircle2 className="h-5 w-5 text-success" />
    : feedback?.kind === "duplicate"
      ? <RefreshCw className="h-5 w-5 text-warning" />
      : feedback?.kind === "wrong"
        ? <CircleAlert className="h-5 w-5 text-warning" />
        : <XCircle className="h-5 w-5 text-danger" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Operate</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Attendance console</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose the assigned event and session once, then keep the camera running. Check-in staff see only scanner context and recent scans—not the attendee register.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={scanning ? stopScanner : startScanner} disabled={!scanning && scanDisabled} className="gap-2">
          {scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {scanning ? "Stop camera" : "Start continuous scan"}
        </Button>
      </div>

      {context.isLoading ? (
        <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your check-in assignments…</CardContent></Card>
      ) : context.isError ? (
        <Card className="border-danger/30"><CardContent className="p-6 text-sm text-danger">Could not load check-in assignments.</CardContent></Card>
      ) : events.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><ScanLine className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No check-in assignments</p><p className="mt-1 text-sm text-muted-foreground">An event lead or branch organizer must assign check-in access first.</p></CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_auto] xl:items-end">
              <div className="grid gap-1.5">
                <Label>Assigned event</Label>
                <Select value={selectedEvent?.id || ""} onValueChange={chooseEvent}>
                  <SelectTrigger><SelectValue placeholder="Choose event" /></SelectTrigger>
                  <SelectContent>
                    {events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Attendance session</Label>
                {selectedEvent?.mode === "sessions" ? (
                  <Select value={selectedSession?.id || ""} onValueChange={chooseSession}>
                    <SelectTrigger><SelectValue placeholder="Choose session" /></SelectTrigger>
                    <SelectContent>
                      {selectedEvent.sessions.map((session) => (
                        <SelectItem key={session.id} value={session.id} disabled={!session.attendanceEnabled}>
                          {session.title}{session.checkInEnabled ? "" : " · scanner paused"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">Legacy single check-in</div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Present</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{presentCount}</p>
              </div>
            </CardContent>
          </Card>

          {selectedEvent && (selectedEvent.status !== "published" || !selectedEvent.checkInEnabled) && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
              Scanning is paused because this event is {selectedEvent.status !== "published" ? selectedEvent.status : "not check-in enabled"}. Attendance corrections remain available where permitted.
            </div>
          )}
          {selectedSession && (!selectedSession.attendanceEnabled || !selectedSession.checkInEnabled) && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
              Scanner check-in is paused for <strong className="text-foreground">{selectedSession.title}</strong>.
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
                <video ref={videoRef} className={scanning ? "aspect-video w-full object-cover" : "hidden"} muted playsInline />
                {!scanning && (
                  <div className="flex aspect-video items-center justify-center text-center text-sm text-white/55">
                    <div><ScanLine className="mx-auto mb-3 h-9 w-9" />Camera preview<br /><span className="text-xs text-white/35">Continuous mode stays open after each scan</span></div>
                  </div>
                )}
                {scanning && <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/45" aria-hidden="true" />}
              </div>
              {cameraError && <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">{cameraError}</div>}

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-medium">Manual ticket entry</p><p className="text-xs text-muted-foreground">Fallback for damaged QR codes. This does not open attendee search.</p></div>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <div className="relative flex-1">
                      <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="TKT-…"
                        value={ticketId}
                        onChange={(event) => setTicketId(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void submitTicket(ticketId); }}
                        className="pl-9 font-mono"
                        disabled={submitting || scanDisabled}
                      />
                    </div>
                    <Button onClick={() => void submitTicket(ticketId)} disabled={!ticketId.trim() || submitting || scanDisabled}>Record</Button>
                  </div>
                </CardContent>
              </Card>

              {feedback && (
                <Card
                  role={feedback.kind === "error" ? "alert" : "status"}
                  aria-live={feedback.kind === "error" ? "assertive" : "polite"}
                  className={feedback.kind === "success" ? "border-success/30 bg-success/5" : feedback.kind === "error" ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"}
                >
                  <CardContent className="flex items-start gap-3 p-5">
                    {feedbackIcon}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{feedback.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{feedback.message}</p>
                      {feedback.ticketId && <p className="mt-2 font-mono text-xs text-muted-foreground">{feedback.ticketId}</p>}
                      {feedback.occurredAt && <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(feedback.occurredAt)}</p>}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current checkpoint</p>
                      <h2 className="mt-1 font-semibold">{selectedSession?.title || selectedEvent?.title}</h2>
                    </div>
                    <div className="rounded-lg bg-muted p-2"><Users className="h-4 w-4 text-primary" /></div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {selectedSession?.startsAt && <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />{formatDateTime(selectedSession.startsAt)}</p>}
                    <p>{selectedSession?.venue || selectedEvent?.venue || "Venue not specified"}</p>
                    <p>{selectedEvent?.mode === "sessions" ? "Append-only session ledger" : "Legacy event-level projection"}</p>
                  </div>
                </CardContent>
              </Card>

              {selectedEvent?.mode === "sessions" && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="font-medium">Recent scans</p><p className="text-xs text-muted-foreground">Latest 20 records for this session.</p></div>
                      {sessionState.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="mt-4 space-y-2">
                      {sessionState.isError ? (
                        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-muted-foreground">Could not refresh recent attendance. Existing scans are not changed; retry the page before making a correction.</div>
                      ) : sessionState.data?.recent.length ? sessionState.data.recent.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">Ticket check-in</p>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{row.ticketId}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.occurredAt)} · {row.type.replaceAll("_", " ")}</p>
                            </div>
                            {row.isLatestForRegistration && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 shrink-0 gap-1.5 text-xs"
                                onClick={() => {
                                  setCorrection({ row, action: row.present ? "manual_remove" : "manual_add" });
                                  setCorrectionNote("");
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />{row.present ? "Correct" : "Restore"}
                              </Button>
                            )}
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No attendance recorded for this session yet.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      <Dialog open={Boolean(correction)} onOpenChange={(open) => { if (!open) { setCorrection(null); setCorrectionNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{correction?.action === "manual_remove" ? "Correct attendance" : "Restore attendance"}</DialogTitle>
            <DialogDescription>
              Attendance history is never rewritten. This creates a new correction record and keeps the original scan for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="attendance-correction-note">Reason *</Label>
            <Textarea
              id="attendance-correction-note"
              value={correctionNote}
              onChange={(event) => setCorrectionNote(event.target.value)}
              rows={4}
              placeholder="Example: scanned the wrong attendee at the desk"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCorrection(null); setCorrectionNote(""); }} disabled={correctionMutation.isPending}>Cancel</Button>
            <Button
              variant={correction?.action === "manual_remove" ? "destructive" : "default"}
              disabled={!correction || !correctionNote.trim() || correctionMutation.isPending}
              onClick={() => correction && correctionMutation.mutate({ state: correction, note: correctionNote.trim() })}
            >
              {correctionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Append correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
