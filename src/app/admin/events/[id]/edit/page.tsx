'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, X, GripVertical, ImageUp } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox'
  required: boolean
  options: string[]
}

interface PageProps {
  params: Promise<{ id: string }>
}

function generateId() { return Math.random().toString(36).substring(2, 9) }

function toDatetimeLocal(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function fromDatetimeLocal(localStr: string): string {
  if (!localStr) return localStr
  return new Date(localStr + ':00').toISOString()
}

export default function EditEventPage({ params }: PageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string>('')
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [useExternalForm, setUseExternalForm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customFields, setCustomFields] = useState<FormField[]>([])

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    endDate: '',
    venue: '',
    society: '',
    price: '0',
    maxCapacity: '',
    registrationOpen: true,
    status: 'draft',
    registrationDeadline: '',
    contactEmail: '',
    contactPhone: '',
    whatsappLink: '',
    externalFormUrl: '',
  })

  useEffect(() => {
    params.then(({ id }) => {
      setEventId(id)
      fetch(`/api/admin/events/${id}`)
        .then((r) => r.json())
        .then((data) => {
          const e = data.event
          setForm({
            title: e.title || '',
            description: e.description || '',
            date: e.date ? toDatetimeLocal(e.date) : '',
            endDate: e.endDate ? toDatetimeLocal(e.endDate) : '',
            venue: e.venue || '',
            society: e.society || '',
            price: String(e.price || 0),
            maxCapacity: e.maxCapacity ? String(e.maxCapacity) : '',
            registrationOpen: !!e.registrationOpen,
            status: e.status || 'draft',
            registrationDeadline: e.registrationDeadline ? toDatetimeLocal(e.registrationDeadline) : '',
            contactEmail: e.contactEmail || '',
            contactPhone: e.contactPhone || '',
            whatsappLink: e.whatsappLink || '',
            externalFormUrl: e.externalFormUrl || '',
          })
          if (e.externalFormUrl) setUseExternalForm(true)
          if (e.bannerUrl) setBannerPreview(e.bannerUrl)
          if (e.formTemplate && Array.isArray(e.formTemplate)) setCustomFields(e.formTemplate)
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load event')
          setLoading(false)
        })
    })
  }, [params])

  const addField = () => setCustomFields((prev) => [...prev, { id: generateId(), label: '', type: 'text', required: false, options: [''] }])
  const removeField = (id: string) => setCustomFields((prev) => prev.filter((f) => f.id !== id))
  const updateField = (id: string, updates: Partial<FormField>) => setCustomFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= customFields.length) return
    setCustomFields((prev) => {
      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
      return next
    })
  }

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setBannerPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        date: fromDatetimeLocal(form.date),
        endDate: fromDatetimeLocal(form.endDate),
        venue: form.venue,
        society: form.society || undefined,
        price: Number(form.price),
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
        isPaid: Number(form.price) > 0,
        registrationOpen: form.registrationOpen,
        status: form.status,
        registrationDeadline: fromDatetimeLocal(form.registrationDeadline),
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        whatsappLink: form.whatsappLink || '',
        externalFormUrl: useExternalForm ? form.externalFormUrl : '',
        formTemplate: customFields.length > 0 ? JSON.stringify(customFields) : null,
      }

      if (bannerFile) {
        const arrayBuffer = await bannerFile.arrayBuffer()
        const blob = new Blob([arrayBuffer], { type: bannerFile.type })
        const fd = new FormData()
        fd.append('banner', blob, bannerFile.name)
        Object.entries(body).forEach(([key, val]) => {
          if (val !== undefined && val !== null) fd.append(key, String(val))
        })
        const res = await fetch(`/api/admin/events/${eventId}`, { method: 'PUT', body: fd })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || data.details?.message || 'Failed to update event')
        }
      } else {
        const res = await fetch(`/api/admin/events/${eventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || data.details?.message || 'Failed to update event')
        }
      }

      toast.success('Event updated')
      router.push(`/admin/events/${eventId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSaving(false)
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="animate-shimmer rounded-lg h-8 w-8" />
          <div className="space-y-1">
            <div className="animate-shimmer rounded-md h-6 w-48" />
            <div className="animate-shimmer rounded-md h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <div className="animate-shimmer rounded-md h-5 w-36" />
                <div className="animate-shimmer rounded-md h-4 w-56" />
                <div className="animate-shimmer rounded-md h-10 w-full" />
                <div className="animate-shimmer rounded-md h-32 w-full" />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <div className="animate-shimmer rounded-md h-5 w-32" />
                <div className="animate-shimmer rounded-md h-10 w-full" />
                <div className="animate-shimmer rounded-md h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/events/${eventId}`}
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Event</h1>
          <p className="text-sm text-muted-foreground mt-1">{form.title}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main — 2 cols */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title *</label>
                  <input required value={form.title} onChange={update('title')}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Banner Image</label>
                  <div className="relative">
                    {bannerPreview ? (
                      <div className="relative rounded-lg overflow-hidden border border-border">
                        <img src={bannerPreview} alt="Banner" className="w-full h-48 object-cover" />
                        <button type="button" onClick={() => { setBannerPreview(null); setBannerFile(null) }}
                          className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background">
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50">
                        <ImageUp className="size-6 text-muted-foreground/60 mb-1" />
                        <span className="text-xs text-muted-foreground">Click to upload banner</span>
                        <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea value={form.description} onChange={update('description')} rows={5}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 resize-y min-h-[120px]" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Date *</label>
                    <input type="datetime-local" required value={form.date} onChange={update('date')}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Date</label>
                    <input type="datetime-local" value={form.endDate} onChange={update('endDate')}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Venue</label>
                  <input value={form.venue} onChange={update('venue')}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
                </div>
              </CardContent>
            </Card>

            {/* Custom Fields */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Custom Registration Fields</CardTitle>
                </div>
                <button type="button" onClick={addField}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-2.5 py-1.5 text-xs font-medium">
                  <Plus className="size-3.5" /> Add Field
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                {customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No custom fields yet.</p>
                ) : (
                  customFields.map((field, idx) => (
                    <div key={field.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => moveField(idx, -1)} disabled={idx === 0}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <GripVertical className="size-4" />
                        </button>
                        <input value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })}
                          placeholder="Field label" className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none" />
                        <select value={field.type} onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none">
                          <option value="text">Text</option>
                          <option value="textarea">Textarea</option>
                          <option value="select">Select</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })} />
                          Required
                        </label>
                        <button type="button" onClick={() => removeField(field.id)}
                          className="p-1 text-muted-foreground hover:text-destructive">
                          <X className="size-4" />
                        </button>
                      </div>
                      {field.type === 'select' && (
                        <div className="ml-8 space-y-1">
                          {field.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1">
                              <input value={opt} onChange={(e) => {
                                const opts = [...field.options]; opts[oi] = e.target.value; updateField(field.id, { options: opts })
                              }} placeholder={`Option ${oi + 1}`} className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none" />
                              {field.options.length > 1 && (
                                <button type="button" onClick={() => updateField(field.id, { options: field.options.filter((_, i) => i !== oi) })}
                                  className="p-0.5 text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={() => updateField(field.id, { options: [...field.options, ''] })}
                            className="text-xs text-ieee-blue hover:underline">+ Add option</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar — 1 col */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Registration & Pricing</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price (₹)</label>
                  <input type="number" min="0" value={form.price} onChange={update('price')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Capacity</label>
                  <input type="number" min="1" value={form.maxCapacity} onChange={update('maxCapacity')} placeholder="Unlimited" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.registrationOpen} onChange={(e) => setForm((prev) => ({ ...prev, registrationOpen: e.target.checked }))} className="rounded border-input" />
                  <span className="text-sm font-medium">Registration Open</span>
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Contact & Status</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Email</label>
                  <input type="email" value={form.contactEmail} onChange={update('contactEmail')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Phone</label>
                  <input value={form.contactPhone} onChange={update('contactPhone')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">WhatsApp Link</label>
                  <input value={form.whatsappLink} onChange={update('whatsappLink')} placeholder="https://chat.whatsapp.com/..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none">
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Registration Method</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={useExternalForm} onChange={(e) => setUseExternalForm(e.target.checked)} className="rounded border-input" />
                  <span className="text-sm font-medium">Use External Form</span>
                </label>
                {useExternalForm && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Google Form URL</label>
                    <input value={form.externalFormUrl} onChange={update('externalFormUrl')} placeholder="https://docs.google.com/forms/..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Advanced Settings</CardTitle>
                  <span className="text-xs text-muted-foreground">{showAdvanced ? '▲' : '▼'}</span>
                </div>
              </CardHeader>
              {showAdvanced && (
                <CardContent className="space-y-4 border-t border-border/50 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Registration Deadline</label>
                    <input type="datetime-local" value={form.registrationDeadline} onChange={update('registrationDeadline')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Society ID</label>
                    <input value={form.society} onChange={update('society')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none" />
                  </div>
                </CardContent>
              )}
            </Card>

            {error && <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</div>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium disabled:opacity-50">
                {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
              <Link href={`/admin/events/${eventId}`}
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted">Cancel</Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
