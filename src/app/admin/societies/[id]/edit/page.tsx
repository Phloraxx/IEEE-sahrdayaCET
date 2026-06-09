'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, X, Search, Plus } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface User {
  id: string
  name: string
  email: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditSocietyPage({ params }: PageProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [societyId, setSocietyId] = useState<string>('')
  const [form, setForm] = useState({
    name: '',
    slug: '',
    bio: '',
    isHidden: false,
    defaultWhatsappLink: '',
  })
  const [chairs, setChairs] = useState<string[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [userSearch, setUserSearch] = useState('')

  useEffect(() => {
    params.then(({ id }) => {
      setSocietyId(id)
      Promise.all([
        fetch(`/api/admin/societies/${id}`).then((r) => r.json()),
        fetch('/api/admin/users').then((r) => r.json()),
      ])
        .then(([socData, usersData]) => {
          const s = socData.society
          setForm({
            name: s.name || '',
            slug: s.slug || '',
            bio: s.bio || '',
            isHidden: !!s.isHidden,
            defaultWhatsappLink: s.defaultWhatsappLink || '',
          })
          setChairs((s.chairs as string[]) || [])
          setUsers(usersData.users || [])
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load society')
          setLoading(false)
        })
    })
  }, [params])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/societies/${societyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          chairs,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update society')
      }
      router.push(`/admin/societies/${societyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSaving(false)
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const addChair = (userId: string) => {
    if (!chairs.includes(userId)) {
      setChairs((prev) => [...prev, userId])
    }
    setUserSearch('')
  }

  const removeChair = (userId: string) => {
    setChairs((prev) => prev.filter((id) => id !== userId))
  }

  const filteredUsers = users.filter(
    (u) =>
      !chairs.includes(u.id) &&
      (u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(userSearch.toLowerCase())),
  )

  const getChairUser = (id: string) => users.find((u) => u.id === id)

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <div className="animate-shimmer rounded-lg h-8 w-8" />
          <div className="space-y-1">
            <div className="animate-shimmer rounded-md h-6 w-48" />
            <div className="animate-shimmer rounded-md h-4 w-32" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="animate-shimmer rounded-md h-5 w-36" />
          <div className="animate-shimmer rounded-md h-10 w-full" />
          <div className="animate-shimmer rounded-md h-10 w-full" />
          <div className="animate-shimmer rounded-md h-20 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="animate-shimmer rounded-md h-5 w-32" />
          <div className="animate-shimmer rounded-md h-10 w-full" />
          <div className="animate-shimmer rounded-md h-10 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/societies/${societyId}`}
          className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Society</h1>
          <p className="text-sm text-muted-foreground mt-1">{form.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <input required value={form.name} onChange={update('name')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug *</label>
              <input required value={form.slug} onChange={update('slug')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
              <p className="text-xs text-muted-foreground">URL-friendly identifier (e.g. &quot;ieee-cs&quot;)</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bio</label>
              <textarea value={form.bio} onChange={update('bio')} rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 resize-y" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default WhatsApp Link</label>
              <input value={form.defaultWhatsappLink} onChange={update('defaultWhatsappLink')} placeholder="https://chat.whatsapp.com/..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
              <p className="text-xs text-muted-foreground">Fallback link for events under this society</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isHidden" checked={form.isHidden}
                onChange={(e) => setForm((prev) => ({ ...prev, isHidden: e.target.checked }))}
                className="rounded border-input" />
              <label htmlFor="isHidden" className="text-sm font-medium cursor-pointer">Hidden (not shown publicly)</label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Society Chairs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Chairs</label>
              {chairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chairs assigned.</p>
              ) : (
                <div className="space-y-1.5">
                  {chairs.map((id) => {
                    const u = getChairUser(id)
                    return (
                      <div key={id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium">{u?.name || 'Unknown user'}</span>
                          {u?.email && <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>}
                          <span className="text-muted-foreground ml-2 font-mono text-[10px]">{id}</span>
                        </div>
                        <button type="button" onClick={() => removeChair(id)}
                          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Add a Chair</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50" />
              </div>
              {userSearch && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-card divide-y divide-border/30">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matching users.</div>
                  ) : (
                    filteredUsers.slice(0, 10).map((u) => (
                      <button type="button" key={u.id} onClick={() => addChair(u.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left">
                        <div>
                          <span className="font-medium">{u.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                        </div>
                        <Plus className="size-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
          </button>
          <Link href={`/admin/societies/${societyId}`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
