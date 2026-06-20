import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/admin/events/new')({
  component: NewEventPage,
})

function NewEventPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: societies } = useQuery({
    queryKey: ['societies'],
    queryFn: async () => pb.collection('societies').getFullList(),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => pb.collection('events').create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-events'] })
      toast.success('Event created')
      window.location.href = '/admin/events'
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

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <a href="/admin/events"><ArrowLeft className="h-5 w-5" /></a>
        <h2 className="text-2xl font-bold">Create Event</h2>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium">Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event name" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What's this event about?"
              className="mt-1 flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Date & Time *</label>
              <Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Venue *</label>
              <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Location" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Price (₹)</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} placeholder="0 = Free" />
            </div>
            <div>
              <label className="text-sm font-medium">Max Capacity</label>
              <Input type="number" value={form.maxCapacity || ''} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Society *</label>
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
          <div className="flex gap-6 flex-wrap">
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
            onClick={() => createMutation.mutate(form)}
            disabled={!form.title || !form.date || !form.venue || !form.society || createMutation.isPending}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            {createMutation.isPending ? 'Creating...' : 'Create Event'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
