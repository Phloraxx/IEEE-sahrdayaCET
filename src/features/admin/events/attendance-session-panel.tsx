import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Lock, LockOpen, Pencil, Plus, ScanLine, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
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
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, fromAppDateTimeLocal, toAppDateTimeLocal } from "@/lib/dates";
import {
  attendanceRequestError,
  createAttendanceSession,
  deleteAttendanceSession,
  listEventAttendanceSessions,
  lockAttendanceQualification,
  reopenAttendanceQualification,
  updateAttendanceSession,
  type AttendanceSession,
  type AttendanceSessionInput,
} from "@/lib/data/attendance.client";

interface SessionFormState {
  title: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  attendanceWeight: string;
  attendanceEnabled: boolean;
  checkInEnabled: boolean;
  requiredForCertificate: boolean;
}

const emptyForm = (start = "", end = "", venue = ""): SessionFormState => ({
  title: "",
  startsAt: toAppDateTimeLocal(start),
  endsAt: toAppDateTimeLocal(end),
  venue,
  attendanceWeight: "1",
  attendanceEnabled: true,
  checkInEnabled: true,
  requiredForCertificate: false,
});

function formFromSession(session: AttendanceSession): SessionFormState {
  return {
    title: session.title,
    startsAt: toAppDateTimeLocal(session.startsAt),
    endsAt: toAppDateTimeLocal(session.endsAt),
    venue: session.venue,
    attendanceWeight: String(session.attendanceWeight),
    attendanceEnabled: session.attendanceEnabled,
    checkInEnabled: session.checkInEnabled,
    requiredForCertificate: session.requiredForCertificate,
  };
}

function payload(form: SessionFormState): AttendanceSessionInput {
  return {
    title: form.title.trim(),
    startsAt: fromAppDateTimeLocal(form.startsAt) || "",
    endsAt: fromAppDateTimeLocal(form.endsAt) || "",
    venue: form.venue.trim(),
    attendanceEnabled: form.attendanceEnabled,
    checkInEnabled: form.checkInEnabled,
    requiredForCertificate: form.requiredForCertificate,
    attendanceWeight: Number(form.attendanceWeight) || 0,
  };
}

function SessionDialog({
  open,
  onOpenChange,
  initial,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SessionFormState;
  pending: boolean;
  onSave: (form: SessionFormState) => void;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof SessionFormState>(key: K, value: SessionFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" key={JSON.stringify(initial)}>
        <DialogHeader>
          <DialogTitle>{initial.title ? "Edit attendance session" : "Add attendance session"}</DialogTitle>
          <DialogDescription>
            Sessions turn on Attendance V2 for this event. Existing event-level check-in remains only as a first-arrival projection.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="attendance-session-title">Session name *</Label>
            <Input id="attendance-session-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Day 1 · Workshop" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-session-start">Starts *</Label>
            <Input id="attendance-session-start" type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-session-end">Ends</Label>
            <Input id="attendance-session-end" type="datetime-local" min={form.startsAt || undefined} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="attendance-session-venue">Session venue</Label>
            <Input id="attendance-session-venue" value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="AI Lab / Auditorium / Online" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-session-weight">Attendance weight</Label>
            <Input id="attendance-session-weight" type="number" min="0" max="100" step="0.25" value={form.attendanceWeight} onChange={(e) => set("attendanceWeight", e.target.value)} />
            <p className="text-xs text-muted-foreground">Frozen when completed-event attendance qualification is locked. Weight is explanatory only; it does not create a percentage threshold.</p>
          </div>
          <div className="space-y-2">
            <Label>Controls</Label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>Track attendance</span>
              <input type="checkbox" checked={form.attendanceEnabled} onChange={(e) => set("attendanceEnabled", e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>Allow scanner check-in</span>
              <input type="checkbox" checked={form.checkInEnabled} onChange={(e) => set("checkInEnabled", e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>Required for certificate</span>
              <input type="checkbox" checked={form.requiredForCertificate} onChange={(e) => set("requiredForCertificate", e.target.checked)} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={pending || !form.title.trim() || !form.startsAt}>Save session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceSessionPanel({
  eventId,
  eventStart,
  eventEnd,
  eventVenue,
  eventStatus,
  canManage,
  canCheckIn,
}: {
  eventId: string;
  eventStart: string;
  eventEnd: string;
  eventVenue: string;
  eventStatus: string;
  canManage: boolean;
  canCheckIn: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceSession | null>(null);
  const sessions = useQuery({
    queryKey: ["event-attendance-sessions", eventId],
    queryFn: () => listEventAttendanceSessions(eventId),
    enabled: Boolean(eventId),
  });
  const saveMutation = useMutation({
    mutationFn: ({ form, sessionId }: { form: SessionFormState; sessionId?: string }) =>
      sessionId
        ? updateAttendanceSession(sessionId, payload(form))
        : createAttendanceSession(eventId, payload(form)),
    onSuccess: () => {
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["event-attendance-sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["admin-event-operations", eventId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-context"] });
      toast.success("Attendance session saved");
    },
    onError: (error) => toast.error(attendanceRequestError(error).message),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAttendanceSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-attendance-sessions", eventId] });
      queryClient.invalidateQueries({ queryKey: ["admin-event-operations", eventId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-context"] });
      toast.success("Attendance session removed");
    },
    onError: (error) => toast.error(attendanceRequestError(error).message),
  });
  const lockMutation = useMutation({
    mutationFn: () => lockAttendanceQualification(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-attendance-sessions", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-event-operations", eventId] });
      toast.success("Attendance qualification locked");
    },
    onError: (error) => toast.error(attendanceRequestError(error).message),
  });
  const reopenMutation = useMutation({
    mutationFn: () => reopenAttendanceQualification(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["event-attendance-sessions", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-event-operations", eventId] });
      toast.success("Attendance qualification reopened");
    },
    onError: (error) => toast.error(attendanceRequestError(error).message),
  });

  if (sessions.isLoading) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (sessions.isError || !sessions.data) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Could not load attendance sessions.</CardContent></Card>;

  const rows = sessions.data.sessions;
  const qualification = sessions.data.qualification;
  const requiredTrackedSessions = rows.filter((session) => session.requiredForCertificate && session.attendanceEnabled).length;
  const qualificationPending = lockMutation.isPending || reopenMutation.isPending;
  const initial = editing ? formFromSession(editing) : emptyForm(eventStart, eventEnd, eventVenue);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-6">
          <PanelHeader
            eyebrow="Attendance V2"
            title={rows.length ? "Session attendance" : "Legacy single check-in is active"}
            description={rows.length
              ? "Each scan is attached to an explicit session. Attendance history is append-only; corrections add a new audited record."
              : "This event currently uses the original one-time check-in. Add the first session only when you need multi-session or multi-day attendance."}
            actions={canManage && !qualification.locked ? (
              <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="h-4 w-4" /> Add session
              </Button>
            ) : undefined}
          />
          {!rows.length && (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">
              Existing QR tickets and the Check-in page continue to work exactly as before. Creating a session switches this event to session-aware attendance; the old checked-in flag is then kept only as a first-arrival compatibility projection.
            </div>
          )}
          {rows.length > 0 && eventStatus === "completed" && (
            <div className={`mt-5 rounded-xl border p-4 ${qualification.locked ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{qualification.locked ? `Certificate attendance locked · v${qualification.version}` : "Certificate attendance is unlocked"}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{qualification.locked ? `Required-session rules are frozen${qualification.lockedAt ? ` since ${formatDateTime(qualification.lockedAt)}` : ""}. Reopen before correcting attendance or session rules.` : requiredTrackedSessions ? "Lock after attendance corrections are complete. Qualification requires every session marked Required for certificate." : "Mark at least one tracked session Required for certificate before locking."}</p>
                </div>
                {canManage && (qualification.locked ? (
                  <ConfirmButton label="Reopen" confirmMessage="Reopen certificate attendance? Attendance-qualified certificate audiences will be unavailable until you lock it again." variant="outline" icon={<LockOpen className="h-4 w-4" />} disabled={qualificationPending} onConfirm={() => { reopenMutation.mutate(); return true; }} />
                ) : (
                  <ConfirmButton label="Lock qualification" confirmMessage="Freeze the current required-session rules for certificate qualification? Corrections and session changes will require reopening." icon={<Lock className="h-4 w-4" />} disabled={qualificationPending || requiredTrackedSessions === 0} onConfirm={() => { lockMutation.mutate(); return true; }} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 space-y-3">
            {rows.map((session) => (
              <div key={session.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{session.title}</h3>
                      {!session.checkInEnabled && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scanner paused</span>}
                      {session.requiredForCertificate && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Certificate-required</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{formatDateTime(session.startsAt)}{session.endsAt ? ` – ${formatDateTime(session.endsAt)}` : ""}</span>
                      {session.venue && <span>{session.venue}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <span className="inline-flex items-center gap-1.5 font-medium"><Users className="h-4 w-4 text-primary" />{session.presentCount} present</span>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Weight {session.attendanceWeight}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canCheckIn && eventStatus === "published" && session.checkInEnabled && (
                      <Button variant="outline" size="sm" asChild className="gap-2">
                        <Link to={`/admin/check-in?event=${encodeURIComponent(eventId)}&session=${encodeURIComponent(session.id)}`}>
                          <ScanLine className="h-4 w-4" /> Open scanner
                        </Link>
                      </Button>
                    )}
                    {canManage && !qualification.locked && (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setEditing(session); setOpen(true); }}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    )}
                    {canManage && !qualification.locked && session.presentCount === 0 && (
                      <ConfirmButton
                        label="Delete"
                        confirmMessage="Delete this unused attendance session?"
                        variant="destructive"
                        icon={<Trash2 className="h-4 w-4" />}
                        disabled={deleteMutation.isPending}
                        onConfirm={() => { deleteMutation.mutate(session.id); return true; }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
        Certificate qualification is server-owned: a confirmed attendee qualifies only when present at every session marked <strong className="text-foreground">Required for certificate</strong>. Weights are frozen for explanation and future reporting; they do not create an implicit percentage threshold.
      </div>
      {open && (
        <SessionDialog
          key={editing?.id || "new"}
          open={open}
          onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }}
          initial={initial}
          pending={saveMutation.isPending}
          onSave={(form) => saveMutation.mutate({ form, sessionId: editing?.id })}
        />
      )}
    </div>
  );
}
