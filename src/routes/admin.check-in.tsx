
import { useState } from "react";
import { CheckCircle, Loader2, ScanLine, XCircle } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checkInByTicket } from "@/lib/data/admin-registrations.client";


interface VerifyResult {
  success: boolean;
  message: string;
  registration?: {
    id: string;
    userName: string;
    userEmail: string;
    eventTitle: string;
    ticketId: string;
    checkedIn: boolean;
    checkedInAt: string;
  };
}

export default function AdminCheckIn() {
  const [ticketId, setTicketId] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    const id = ticketId.trim();
    if (!id) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await checkInByTicket(id);
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Check-in"
        title="Verify Ticket"
        description="Scan or enter a ticket ID to verify and check in a registrant."
      />

      {/* Input */}
      <div className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Enter ticket ID…"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            className="pl-9 font-mono"
            disabled={loading}
          />
        </div>
        <Button
          onClick={handleVerify}
          disabled={!ticketId.trim() || loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4" />
          )}
          Verify
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-medium text-danger">Verification failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {result?.success && result.registration && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle className="h-5 w-5 shrink-0 text-success mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-success">
                {result.message}
              </p>
              <div className="mt-2 grid gap-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  <span className="font-medium text-foreground">
                    {result.registration.userName}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Event: </span>
                  <span className="text-foreground">
                    {result.registration.eventTitle}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Ticket: </span>
                  <span className="font-mono text-xs text-foreground">
                    {result.registration.ticketId}
                  </span>
                </div>
                {result.registration.checkedIn && (
                  <div>
                    <span className="text-muted-foreground">Checked in at: </span>
                    <span className="text-foreground">
                      {new Date(
                        result.registration.checkedInAt,
                      ).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <ScanLine className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            Enter a ticket ID to begin
          </p>
          <p className="text-xs text-muted-foreground">
            The ticket ID is shown on the registrant's ticket or QR code.
          </p>
        </div>
      )}
    </div>
  );
}
