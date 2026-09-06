import { useState } from "react";
import { CheckCircle2, CircleAlert, Flag, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AdminEventOperations } from "@/lib/data/admin-event-operations.client";

type WorkflowAction = "publish" | "unpublish" | "complete";

function human(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "published" || status === "completed") return "default";
  if (status === "cancelled") return "destructive";
  return "secondary";
}

export function EventWorkflowPanel({
  event,
  permissions,
  pending,
  onAction,
}: {
  event: AdminEventOperations["event"];
  permissions: Record<string, boolean>;
  pending: boolean;
  onAction: (action: WorkflowAction, note?: string) => void;
}) {
  const [dialog, setDialog] = useState<{ action: WorkflowAction; title: string; required: boolean } | null>(null);
  const [note, setNote] = useState("");
  const open = (action: WorkflowAction, title: string, required = false) => {
    setNote("");
    setDialog({ action, title, required });
  };
  const submitDialog = () => {
    if (!dialog || (dialog.required && !note.trim())) return;
    onAction(dialog.action, note.trim());
    setDialog(null);
  };
  const status = event.isArchived ? "archived" : event.status || "draft";
  const isTerminal = status === "completed" || status === "cancelled" || status === "archived";

  return <>
    <Card className="overflow-hidden"><CardContent className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Flag className="h-4 w-4" />Event lifecycle</div>
          <h2 className="mt-2 text-lg font-semibold">Draft → Published → Completed → Archived</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Publish when the setup is ready. Complete after the scheduled end, then resolve closeout items before archiving. Cancellation is a separate terminal path.</p>
        </div>
        <Badge variant={statusTone(status)} className="w-fit">{human(status)}</Badge>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        {status === "draft" && permissions["events.publish"] && <Button size="sm" className="gap-2" disabled={pending} onClick={() => open("publish", "Publish event")}><CheckCircle2 className="h-4 w-4" />Publish</Button>}
        {status === "published" && <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" />Published</span>}
        {status === "published" && permissions["events.complete"] && <Button size="sm" variant="outline" disabled={pending} onClick={() => open("complete", "Mark event completed")}>Complete event</Button>}
        {status === "published" && permissions["events.publish"] && <Button size="sm" variant="outline" className="gap-2" disabled={pending} onClick={() => open("unpublish", "Return published event to draft", true)}><RotateCcw className="h-4 w-4" />Return to draft</Button>}
        {status === "completed" && <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" />Completed</span>}
        {status === "cancelled" && <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"><CircleAlert className="h-4 w-4" />Cancelled</span>}
        {status === "archived" && <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">Archived</span>}
        {!isTerminal && status !== "published" && !permissions["events.publish"] && <span className="text-sm text-muted-foreground">The event remains in draft until an organizer publishes it.</span>}
      </div>
    </CardContent></Card>

    <Dialog open={Boolean(dialog)} onOpenChange={(value) => { if (!value) setDialog(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dialog?.title}</DialogTitle><DialogDescription>This action is recorded in the event audit trail. Add a note when context will help the next person operating it.</DialogDescription></DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={dialog?.required ? "Required reason" : "Optional note"} rows={4} />
        <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={pending || Boolean(dialog?.required && !note.trim())} onClick={submitDialog}>Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
