import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EventCancelDialog({
  open,
  onOpenChange,
  eventTitle,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setReason(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel event</DialogTitle>
          <DialogDescription>
            Cancel {eventTitle}. Pending unpaid seats will be released. Paid registrations will remain visible for refund/review; no bank refund is initiated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="event-cancel-reason">Reason *</Label>
          <Textarea
            id="event-cancel-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this event being cancelled?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Keep event</Button>
          <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
