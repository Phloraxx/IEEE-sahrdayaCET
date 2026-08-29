import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  revokeCertificate,
  supersedeCertificate,
  type CertificateDeliveryRow,
} from "@/lib/data/certificate-delivery.client";
import type { CertificateTemplate } from "@/lib/data/certificate-templates.client";

type Mode = "revoke" | "replace";

export function CertificateLifecycleDialog({
  eventId,
  row,
  mode,
  open,
  templates,
  onOpenChange,
  onComplete,
}: {
  eventId: string;
  row: CertificateDeliveryRow | null;
  mode: Mode;
  open: boolean;
  templates: CertificateTemplate[];
  onOpenChange: (open: boolean) => void;
  onComplete: (replacementBatchId?: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [templateChoice, setTemplateChoice] = useState("original");

  useEffect(() => {
    if (!open || !row) return;
    setReason("");
    setRecipientName(row.recipientName);
    setRecipientEmail(row.recipientEmail);
    setTemplateChoice("original");
  }, [open, row, mode]);

  const alternatives = useMemo(
    () => templates.filter((template) =>
      template.status === "published"
      && template.certificateType === row?.certificateType
      && template.id !== row?.templateId),
    [row?.certificateType, row?.templateId, templates],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("Credential is unavailable");
      if (mode === "revoke") return revokeCertificate(eventId, row.certificateId, reason.trim());
      return supersedeCertificate(eventId, row.certificateId, {
        reason: reason.trim(),
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        ...(templateChoice !== "original" ? { templateId: templateChoice } : {}),
      });
    },
    onSuccess: async (result) => {
      const replacementBatchId = "replacementBatchId" in result ? result.replacementBatchId : undefined;
      await onComplete(replacementBatchId);
      toast.success(mode === "revoke" ? "Credential revoked" : "Replacement credential issued");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not update credential status"),
  });

  if (!row) return null;
  const replacing = mode === "replace";
  const valid = reason.trim().length >= 5 && (!replacing || recipientName.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{replacing ? "Replace credential" : "Revoke credential"}</DialogTitle>
          <DialogDescription>
            {replacing
              ? "The current verification URL will remain valid but show SUPERSEDED. A new immutable credential is issued separately and is not emailed automatically."
              : "The verification URL will remain available and show REVOKED. This does not delete the credential or its audit history."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="font-medium">{row.recipientName}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{row.credentialId}</p>
          </div>

          {replacing && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="replacement-recipient-name">Recipient name</Label>
                <Input id="replacement-recipient-name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="replacement-recipient-email">Recipient email</Label>
                <Input id="replacement-recipient-email" type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} disabled={mutation.isPending} placeholder="Optional" />
                <p className="text-[11px] text-muted-foreground">This becomes the replacement credential’s frozen delivery snapshot.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Artwork version</Label>
                <Select value={templateChoice} onValueChange={setTemplateChoice} disabled={mutation.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Keep original credential artwork</SelectItem>
                    {alternatives.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name} · v{template.version}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Choose a newer published version only when the artwork itself needs correction.</p>
              </div>
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="certificate-lifecycle-reason">{replacing ? "Replacement reason" : "Revocation reason"}</Label>
            <Textarea id="certificate-lifecycle-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={mutation.isPending} rows={4} placeholder={replacing ? "Example: Correct recipient spelling" : "Example: Credential issued in error"} />
            <p className="text-[11px] text-muted-foreground">Required for the private audit trail. It is not exposed on the public verification page.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={replacing ? "default" : "destructive"} disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : replacing ? <RefreshCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {replacing ? "Issue replacement" : "Revoke credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
