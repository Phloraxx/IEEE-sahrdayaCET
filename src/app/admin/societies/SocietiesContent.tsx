'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface SocietyItem {
  id: string
  name: string
  slug: string
  isHidden: boolean
  chairs: string[]
  eventsCount?: number
}

export function SocietiesContent() {
  const [societies, setSocieties] = useState<SocietyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState('all')

  useEffect(() => {
    fetch('/api/admin/societies')
      .then((r) => r.json())
      .then((data) => {
        setSocieties(data.societies || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = [...societies]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
    }
    if (visibilityFilter === 'visible') result = result.filter((s) => !s.isHidden)
    else if (visibilityFilter === 'hidden') result = result.filter((s) => s.isHidden)
    return result
  }, [societies, searchQuery, visibilityFilter])

  if (loading) {
    return (
      <Card className="card-hover">
        <div className="p-3 border-b border-border/50">
          <div className="animate-shimmer rounded-md h-8 w-full" />
        </div>
        <CardContent className="p-0">
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="animate-shimmer rounded-md h-4 w-40" />
                  <div className="animate-shimmer rounded-md h-3 w-24" />
                </div>
                <div className="animate-shimmer rounded-full h-5 w-16" />
              </div>
            ))}
          </div>
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
            placeholder="Search societies..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-xs text-muted-foreground/60 hover:text-foreground">Clear</button>}
        </div>
        <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}
          className="rounded-lg border border-border/50 bg-background px-2 py-1 text-xs outline-none">
          <option value="all">All</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No societies found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Slug</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Chairs</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Events</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors relative group">
                    <td className="px-4 py-3 relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 rounded-full bg-ieee-blue opacity-0 group-hover:opacity-100 group-hover:h-5 transition-all duration-200" />
                      <Link href={`/admin/societies/${s.id}`} className="text-sm font-medium hover:text-ieee-blue transition-colors">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{s.slug}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {Array.isArray(s.chairs) ? s.chairs.length : 0} chairs
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {s.eventsCount ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.isHidden ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit">
                          <EyeOff className="size-3" /> Hidden
                        </Badge>
                      ) : (
                        <Badge className="bg-ieee-success/15 text-ieee-success border-ieee-success/20 text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit">
                          <Eye className="size-3" /> Visible
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
