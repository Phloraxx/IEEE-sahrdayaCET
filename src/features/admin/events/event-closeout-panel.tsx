import { AlertTriangle, Archive, CheckCircle2, ClipboardList, UserCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Card, CardContent } from "@/components/ui/card";
import { PanelHeader } from "@/components/admin/panel-header";
import type { EventCloseoutSummary } from "@/lib/data/admin-event-operations.client";

type CloseoutArea = "overview" | "attendees" | "attendance" | "payments" | "certificates";

function areaLabel(area: string) {
  if (area === "attendees") return "Open attendees";
  if (area === "attendance") return "Open attendance";
  if (area === "payments") return "Open payments";
  return "Review workspace";
}

function areaIcon(area: string) {
  if (area === "attendees") return ClipboardList;
  if (area === "attendance") return UserCheck;
  if (area === "payments") return WalletCards;
  return AlertTriangle;
}

export function EventCloseoutPanel({
  closeout,
  canArchive,
  archivePending,
  onOpenArea,
  onArchive,
}: {
  closeout: EventCloseoutSummary;
  canArchive: boolean;
  archivePending: boolean;
  onOpenArea: (area: CloseoutArea) => void;
  onArchive: () => void;
}) {
  const ready = closeout.readyToArchive;
  return (
    <div className="space-y-6">
      <Card className={ready ? "border-emerald-500/30" : "border-amber-500/30"}>
        <CardContent className="p-6">
          <PanelHeader
            eyebrow="Closeout readiness"
            title={ready ? "Operations are settled" : "Finish reconciliation before archive"}
            description={ready
              ? "No blocking registration, refund, or payment states remain. Attendance evidence is preserved for audit and certificates."
              : "Resolve every blocking item below. Warnings are evidence to review, not archive blockers in this phase."}
          />
          <div className={`mt-5 rounded-xl border p-4 ${ready ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
            <div className="flex items-start gap-3">
              {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />}
              <div>
                <p className="font-semibold">{ready ? "Ready to archive" : `${closeout.blockers.length} closeout blocker${closeout.blockers.length === 1 ? "" : "s"}`}</p>
                <p className="mt-1 text-sm text-muted-foreground">Archive hides settled history from active operations without deleting attendee, attendance, payment, audit, or certificate records.</p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending registrations</p><p className="mt-2 font-mono text-2xl font-semibold">{closeout.metrics.pendingRegistrations}</p></div>
            <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attendance sessions</p><p className="mt-2 font-mono text-2xl font-semibold">{closeout.metrics.attendanceSessions}</p></div>
            <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manual corrections</p><p className="mt-2 font-mono text-2xl font-semibold">{closeout.metrics.attendanceCorrections}</p></div>
          </div>
          {ready && canArchive && (
            <ConfirmButton
              label={archivePending ? "Archiving…" : "Archive settled event"}
              confirmMessage="Archive this settled event? It will leave active operational lists but history, payments, attendance, audit and certificates are preserved."
              icon={<Archive className="h-4 w-4" />}
              className="mt-5"
              disabled={archivePending}
              onConfirm={() => { onArchive(); return true; }}
            />
          )}
        </CardContent>
      </Card>

      {closeout.blockers.length > 0 && <Card><CardContent className="p-6"><PanelHeader eyebrow="Blocking" title="Resolve before archive" description="These are server-enforced closeout blockers." /><div className="mt-5 space-y-3">
        {closeout.blockers.map((item) => {
          const Icon = areaIcon(item.area);
          return <div key={item.code} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 text-amber-600" /><div><p className="text-sm font-semibold">{item.label}</p>{item.count > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.count} record{item.count === 1 ? "" : "s"}</p>}{item.restricted && <p className="mt-1 text-xs text-muted-foreground">A finance-authorized organizer must resolve this item.</p>}</div></div>{!item.restricted && <Button size="sm" variant="outline" onClick={() => onOpenArea(item.area as CloseoutArea)}>{areaLabel(item.area)}</Button>}</div>;
        })}
      </div></CardContent></Card>}
      {closeout.warnings.length > 0 && <Card><CardContent className="p-6"><PanelHeader eyebrow="Review" title="Closeout evidence" description="These items do not block archive yet, but should be reviewed before certificate-authoritative closeout is enabled." /><div className="mt-5 space-y-3">
        {closeout.warnings.map((item) => <div key={item.code} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{item.label}</p>{item.count > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.count} record{item.count === 1 ? "" : "s"}</p>}</div><Button size="sm" variant="outline" onClick={() => onOpenArea(item.area as CloseoutArea)}>{areaLabel(item.area)}</Button></div>)}
      </div></CardContent></Card>}

      <Card><CardContent className="p-6"><PanelHeader eyebrow="Next phases" title="Certificates stay independent" description="Attendance-qualified certificate rules and optional attendee feedback are intentionally not activated by this readiness slice." /><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => onOpenArea("attendance")}>Review attendance</Button><Button variant="outline" onClick={() => onOpenArea("certificates")}>Open certificates</Button></div></CardContent></Card>
    </div>
  );
}
