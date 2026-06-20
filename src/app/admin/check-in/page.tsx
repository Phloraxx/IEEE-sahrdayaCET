'use client'

import { useState } from 'react'
import { QrCode, Scan, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function CheckInPage() {
  const [ticketId, setTicketId] = useState('')
  const [eventId, setEventId] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; userName?: string } | null>(null)

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketId.trim()) return
    setChecking(true)
    setResult(null)

    try {
      const res = await fetch('/api/check-in/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticketId.trim(), eventId: eventId.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, message: `Checked in successfully!`, userName: data.userName })
        setTicketId('')
      } else {
        setResult({ success: false, message: data.error || 'Check-in failed' })
      }
    } catch {
      setResult({ success: false, message: 'Network error' })
    }
    setChecking(false)
  }

  return (
    <div className="mx-auto" style={{ maxWidth: '480px' }}>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Check-in</h1>
        <p className="text-sm text-muted-foreground">Verify tickets and check in attendees.</p>
      </div>

      {/* Scan Ticket Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scan className="size-4" />
            Scan Ticket
          </CardTitle>
          <CardDescription>Enter or scan the ticket ID to verify</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCheckIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Ticket ID</label>
              <Input
                type="text"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="Scan QR or type ticket ID..."
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Event ID (optional)</label>
              <Input
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="Filter by event"
              />
            </div>
            <Button
              type="submit"
              disabled={checking || !ticketId.trim()}
              className="w-full"
            >
              {checking ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> Verifying...</>
              ) : (
                <><QrCode className="mr-2 size-4" /> Verify & Check In</>
              )}
            </Button>
          </form>

          {result && (
            <div
              className={`mt-4 rounded-lg border p-3 transition-all ${
                result.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{result.message}</p>
                  {result.userName && (
                    <p className="mt-1 text-xs text-muted-foreground">{result.userName}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <ol className="space-y-1.5 list-decimal list-inside">
            <li>Attendee presents their ticket (QR code or ticket ID).</li>
            <li>Scan the QR code or type the ticket ID above.</li>
            <li>The system verifies the registration and marks them as checked in.</li>
            <li>A confirmation message appears — the attendee is checked in!</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
