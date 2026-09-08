import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EventCancelDialog({ open, onOpenChange, eventTitle, pending, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel event</DialogTitle>
          <DialogDescription>
            Cancel {eventTitle}? Pending unpaid seats will be released. Paid registrations remain visible for refund review; no bank refund is initiated automatically.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Keep event</Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
