import { useState } from "react";
import { CheckCircle2, CircleDollarSign, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AdminEventOperations } from "@/lib/data/admin-event-operations.client";

type WorkflowAction = "submit" | "approve" | "request_changes" | "finance_approve" | "finance_changes" | "publish" | "unpublish" | "complete";

function tone(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "approved" || status === "not_required") return "default";
  if (status === "changes_requested") return "destructive";
  if (status === "submitted" || status === "pending") return "secondary";
  return "outline";
}

function human(value: string | undefined) {
  return (value || "draft").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function EventWorkflowPanel({
  event,
  permissions,
  pending,
  canViewFinance = Boolean(permissions["finance.view"] || permissions["finance.manage"]),
  onAction,
}: {
  event: AdminEventOperations["event"];
  permissions: Record<string, boolean>;
  pending: boolean;
  canViewFinance?: boolean;
  onAction: (action: WorkflowAction, note?: string) => void;
}) {
  const [dialog, setDialog] = useState<{ action: WorkflowAction; title: string; required: boolean } | null>(null);
  const [note, setNote] = useState("");
  const approvalStatus = event.approvalStatus || "draft";
  const paid = canViewFinance && (event.price ?? 0) > 0;
  const approvalReady = approvalStatus === "approved";
  const financeReady = !paid || event.financeApprovalStatus === "approved" || event.financeApprovalStatus === "not_required";
  const canPublish = permissions["events.publish"] && approvalReady && financeReady && event.status !== "published";
  const open = (action: WorkflowAction, title: string, required = false) => {
    setNote("");
    setDialog({ action, title, required });
  };
  const submitDialog = () => {
    if (!dialog || (dialog.required && !note.trim())) return;
    onAction(dialog.action, note.trim());
    setDialog(null);
  };
  return <>
    <Card className="overflow-hidden"><CardContent className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ShieldCheck className="h-4 w-4" />Approval workflow</div>
          <h2 className="mt-2 text-lg font-semibold">From proposal to published programme</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{canViewFinance ? "Organizational approval and finance approval are separate. Paid events require both before publishing. Sensitive edits invalidate approval." : "Organizational approval moves this event from proposal to published programme. Sensitive edits invalidate approval."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={tone(approvalStatus)}>Organisation · {human(approvalStatus)}</Badge>
          {canViewFinance && paid && <Badge variant={tone(event.financeApprovalStatus ?? "pending")}>Finance · {human(event.financeApprovalStatus || "pending")}</Badge>}
          {canViewFinance && !paid && <Badge variant="outline">Finance · Not required</Badge>}
        </div>
      </div>
      {(event.approvalNote || (canViewFinance && event.financeApprovalNote)) && <div className="mt-5 grid gap-3 md:grid-cols-2">
        {event.approvalNote && <div className="rounded-xl border border-border bg-muted/25 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Organisation note</p><p className="mt-2 text-sm leading-6">{event.approvalNote}</p></div>}
        {canViewFinance && event.financeApprovalNote && <div className="rounded-xl border border-border bg-muted/25 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finance note</p><p className="mt-2 text-sm leading-6">{event.financeApprovalNote}</p></div>}
      </div>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
        {permissions["events.submit"] && ["draft", "changes_requested"].includes(approvalStatus) && <Button size="sm" className="gap-2" disabled={pending} onClick={() => open("submit", "Submit event for review")}><Send className="h-4 w-4" />Submit for review</Button>}
        {permissions["events.approve"] && approvalStatus === "submitted" && <>
          <Button size="sm" className="gap-2" disabled={pending} onClick={() => open("approve", "Approve event")}><CheckCircle2 className="h-4 w-4" />Approve</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => open("request_changes", "Request changes", true)}>Request changes</Button>
        </>}
        {paid && permissions["finance.approve"] && event.financeApprovalStatus !== "approved" && <>
          <Button size="sm" variant="outline" className="gap-2" disabled={pending} onClick={() => open("finance_approve", "Approve event finances")}><CircleDollarSign className="h-4 w-4" />Finance approve</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => open("finance_changes", "Request finance changes", true)}>Finance changes</Button>
        </>}
        {canPublish && <Button size="sm" className="gap-2" disabled={pending} onClick={() => open("publish", "Publish event")}><ShieldCheck className="h-4 w-4" />Publish</Button>}
        {event.status === "published" && <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" />Published</span>}
        {event.status === "published" && permissions["events.complete"] && <Button size="sm" variant="outline" disabled={pending} onClick={() => open("complete", "Mark event completed")}>Complete event</Button>}
        {event.status === "published" && permissions["events.publish"] && <Button size="sm" variant="outline" disabled={pending} onClick={() => open("unpublish", "Return published event to draft", true)}>Return to draft</Button>}
      </div>
    </CardContent></Card>

    <Dialog open={Boolean(dialog)} onOpenChange={(value) => { if (!value) setDialog(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dialog?.title}</DialogTitle><DialogDescription>This action is recorded in the event audit trail. Add a note when context will help the next person reviewing it.</DialogDescription></DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={dialog?.required ? "Required review note" : "Optional note"} rows={4} />
        <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={pending || Boolean(dialog?.required && !note.trim())} onClick={submitDialog}>Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
