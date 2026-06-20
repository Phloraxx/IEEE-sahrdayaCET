import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/admin/events/$eventId/edit')({
  component: EventEditPage,
})

function EventEditPage() {
  const { eventId } = Route.useParams()
  const qc = useQueryClient()

  const { data: event, isLoading } = useQuery({
    queryKey: ['admin-event', eventId],
    queryFn: async () => pb.collection('events').getOne(eventId),
    enabled: !!eventId,
  })

  const { data: societies } = useQuery({
    queryKey: ['societies'],
    queryFn: async () => pb.collection('societies').getFullList(),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => pb.collection('events').update(eventId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-event', eventId] })
      qc.invalidateQueries({ queryKey: ['admin-events'] })
      toast.success('Event updated')
    },
    onError: (err) => toast.error(String(err)),
  })

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    venue: '',
    price: 0,
    status: 'draft',
    society: '',
    maxCapacity: 0,
    registrationOpen: false,
    checkInEnabled: false,
    collectIeeeMember: false,
  })

  // Sync form when event loads
  useState(() => {
    if (event) {
      const e = event as Record<string, unknown>
      setForm({
        title: (e.title as string) || '',
        description: (e.description as string) || '',
        date: (e.date as string)?.slice(0, 16) || '',
        venue: (e.venue as string) || '',
        price: (e.price as number) || 0,
        status: (e.status as string) || 'draft',
        society: (e.society as string) || '',
        maxCapacity: (e.maxCapacity as number) || 0,
        registrationOpen: !!e.registrationOpen,
        checkInEnabled: !!e.checkInEnabled,
        collectIeeeMember: !!e.collectIeeeMember,
      })
    }
  })

  if (isLoading) return <LoadingSpinner />
  if (!event) return <div>Event not found</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <a href={`/admin/events/${eventId}`}><ArrowLeft className="h-5 w-5" /></a>
        <h2 className="text-2xl font-bold">Edit Event</h2>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Venue</label>
              <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Price (₹)</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-sm font-medium">Max Capacity</label>
              <Input type="number" value={form.maxCapacity || ''} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Society</label>
            <select
              value={form.society}
              onChange={(e) => setForm({ ...form, society: e.target.value })}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select society</option>
              {societies?.map((s: Record<string, unknown>) => (
                <option key={s.id as string} value={s.id as string}>{s.name as string}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.registrationOpen} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} />
              <span className="text-sm">Registration Open</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.checkInEnabled} onChange={(e) => setForm({ ...form, checkInEnabled: e.target.checked })} />
              <span className="text-sm">Check-In Enabled</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.collectIeeeMember} onChange={(e) => setForm({ ...form, collectIeeeMember: e.target.checked })} />
              <span className="text-sm">Collect IEEE Member ID</span>
            </label>
          </div>
          <Button
            onClick={() => updateMutation.mutate(form)}
            disabled={updateMutation.isPending}
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
