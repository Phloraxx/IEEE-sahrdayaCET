'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { buildFileUrl } from '@/lib/pb'
import { Skeleton } from '@/components/ui/skeleton'

export default function UserDetailPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [user, setUser] = useState<{ name: string; email: string; role: string; avatar: string; created: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    props.params.then(({ id }) => {
      setUserId(id)
      fetch(`/api/admin/users`)
        .then((r) => r.json())
        .then((data) => {
          const u = (data.users || []).find((u: { id: string }) => u.id === id)
          if (u) {
            setUser(u)
            setEditName(u.name || '')
            setEditEmail(u.email || '')
          } else {
            setError('User not found')
          }
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load user')
          setLoading(false)
        })
    })
  }, [props.params])

  const handleSave = async () => {
    if (!userId || !user) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, name: editName, email: editEmail }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update')
      }
      setUser((prev) => prev ? { ...prev, name: editName, email: editEmail } : prev)
      toast.success('User updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-32 mb-3" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (error || !user) {
    return <div className="p-12 text-center text-sm text-muted-foreground">{error || 'User not found.'}</div>
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        <Link href="/admin/users" className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit User</h1>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>
        <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${
          user.role === 'admin' ? 'bg-red-50 text-red-700 border border-red-200'
          : user.role === 'chair' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          : 'bg-gray-50 text-gray-600 border border-gray-200'
        }`}>{user.role}</span>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        {/* Avatar preview */}
        {user.avatar && userId && (
          <div className="flex justify-center mb-4">
            <img
              src={buildFileUrl('users', userId, user.avatar) || undefined}
              alt="Avatar"
              className="size-20 rounded-full object-cover border-2 border-border"
            />
          </div>
        )}
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Role</label>
          <select
            value={user.role}
            onChange={(e) => setUser((prev) => prev ? { ...prev, role: e.target.value } : prev)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="user">User</option>
            <option value="chair">Chair</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="text-xs text-muted-foreground">
          Joined: {new Date(user.created || '').toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
      </button>
    </div>
  )
}
