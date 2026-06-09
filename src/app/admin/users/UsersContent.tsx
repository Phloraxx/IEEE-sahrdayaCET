'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'

interface UserItem {
  id: string
  name: string
  email: string
  role: string
  created: string
  registrationsCount?: number
}

export function UsersContent() {
  const router = useRouter()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = [...users]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
    }
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }
    return result
  }, [users, searchQuery, roleFilter])

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId)
    try {
      const res = await fetch(`/api/admin/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
      toast.success('Role updated')
    } catch {
      toast.error('Failed to update role')
    } finally {
      setUpdatingRole(null)
    }
  }

  if (loading) {
    return (
      <Card className="card-hover">
        <div className="p-3 border-b border-border/50">
          <div className="animate-shimmer rounded-md h-8 w-full" />
        </div>
        <CardContent className="p-0">
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="animate-shimmer rounded-full h-8 w-8" />
                <div className="flex-1 space-y-1">
                  <div className="animate-shimmer rounded-md h-4 w-32" />
                  <div className="animate-shimmer rounded-md h-3 w-48" />
                </div>
                <div className="animate-shimmer rounded-full h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (filtered.length === 0) {
    const hasFilters = searchQuery.trim() || roleFilter !== 'all'
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {hasFilters ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-1">No matches</h3>
              <p className="text-sm text-muted-foreground mb-6">No users match your filters.</p>
              <button onClick={() => { setSearchQuery(''); setRoleFilter('all') }}
                className="inline-flex rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Clear filters</button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No users found.</p>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="card-hover">
      <div className="border-b border-border/50 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <Search className="size-4 text-muted-foreground/60" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-xs text-muted-foreground/60 hover:text-foreground">Clear</button>}
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none">
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="chair">Chair</option>
          <option value="user">User</option>
        </select>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Registrations</th>
                <th className="sticky top-0 bg-card z-10 px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group">
                  <td className="px-4 py-3 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-ieee-blue/10 text-xs text-ieee-blue">
                          {(u.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium group-hover:text-ieee-blue">{u.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={updatingRole === u.id}
                      className={`rounded-md border px-2 py-1 text-xs outline-none font-medium ${
                        u.role === 'admin' ? 'border-ieee-blue/30 bg-ieee-blue/5 text-ieee-blue' :
                        u.role === 'chair' ? 'border-ieee-warning/30 bg-ieee-warning/5 text-ieee-warning' :
                        'border-border/50 bg-background text-muted-foreground'
                      }`}
                    >
                      <option value="user">User</option>
                      <option value="chair">Chair</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-sm text-muted-foreground">
                    {u.registrationsCount ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                    {new Date(u.created || '').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
