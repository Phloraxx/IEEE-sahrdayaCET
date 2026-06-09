'use client'

import { useState } from 'react'
import { QrCode, Scan, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">Verify tickets and check in attendees.</p>
      </div>

      <Card className="card-hover">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scan className="size-4" />
            Scan Ticket
          </CardTitle>
          <CardDescription>Enter or scan the ticket ID to verify</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCheckIn} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ticket ID</label>
              <Input
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="Scan QR or type ticket ID..."
                autoFocus
                className="h-10 text-base px-3"
              />
            </div>
            <div className="space-y-2">
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
              size="lg"
            >
              {checking ? (
                <><Loader2 className="size-4 mr-2 animate-spin" /> Verifying...</>
              ) : (
                <><QrCode className="size-4 mr-2" /> Verify & Check In</>
              )}
            </Button>
          </form>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={`mt-4 rounded-lg border p-4 ${result.success ? 'bg-ieee-success/5 border-ieee-success/20' : 'bg-destructive/5 border-destructive/20'}`}
              >
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                    >
                      <CheckCircle2 className="size-5 text-ieee-success shrink-0 mt-0.5" />
                    </motion.div>
                  ) : (
                    <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${result.success ? 'text-ieee-success' : 'text-destructive'}`}>
                      {result.message}
                    </p>
                    {result.userName && (
                      <p className="text-xs text-muted-foreground mt-1">{result.userName}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Attendee presents their ticket (QR code or ticket ID).</p>
          <p>2. Scan the QR code or type the ticket ID above.</p>
          <p>3. The system verifies the registration and marks them as checked in.</p>
          <p>4. A confirmation message appears — the attendee is checked in!</p>
        </CardContent>
      </Card>
    </div>
  )
}
