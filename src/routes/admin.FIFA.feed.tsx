
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, RefreshCw, Info, Loader2 } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { useState, useMemo } from "react"

interface FeedEvent {
  id: string
  type: string
  message: string
  created: string
  user: { id: string; display_name: string } | null
}

async function fetchFeed(): Promise<{ events: FeedEvent[]; total: number }> {
  const res = await fetch('/api/admin/fifa/feed')
  if (!res.ok) throw new Error('Failed to load feed')
  return res.json()
}

function getTypeColor(type: string) {
  switch (type) {
    case 'bet_placed': return 'default'
    case 'result': return 'secondary'
    case 'raffle': return 'default' // We'll add custom class for purple
    case 'system': return 'destructive'
    case 'comment': return 'outline'
    default: return 'outline'
  }
}

function getTypeClass(type: string) {
  if (type === 'raffle') return 'bg-purple-500 hover:bg-purple-600 text-white border-transparent'
  if (type === 'system') return 'bg-amber-500 hover:bg-amber-600 text-white border-transparent'
  return ''
}

export default function AdminFifaFeed() {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, refetch } = useQuery({ 
    queryKey: ['admin-fifa-feed'], 
    queryFn: fetchFeed,
    refetchInterval: 15000, // Optional: keep fresh, but filtering is client-side
  })
  
  const [filterText, setFilterText] = useState('')

  const visibleEvents = useMemo(() => {
    if (!data?.events) return []
    if (!filterText.trim()) return data.events
    const lowerFilter = filterText.toLowerCase()
    return data.events.filter(e => e.message.toLowerCase().includes(lowerFilter))
  }, [data?.events, filterText])

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/fifa/feed/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete event')
      }
      return id
    },
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['admin-fifa-feed'] })
      // Snapshot previous value
      const previousData = queryClient.getQueryData<{ events: FeedEvent[]; total: number }>(['admin-fifa-feed'])
      // Optimistically update
      if (previousData) {
        queryClient.setQueryData<{ events: FeedEvent[]; total: number }>(['admin-fifa-feed'], {
          ...previousData,
          events: previousData.events.filter(e => e.id !== id),
          total: previousData.total - 1,
        })
      }
      return { previousData }
    },
    onError: (err, id, context) => {
      // Revert to snapshot
      if (context?.previousData) {
        queryClient.setQueryData(['admin-fifa-feed'], context.previousData)
      }
      toast.error(`Could not delete: ${err.message}`)
    },
    onSettled: () => {
      // Ensure we have truthy state if something goes out of sync, though not strictly required
      // queryClient.invalidateQueries({ queryKey: ['admin-fifa-feed'] })
    }
  })

  return (
    <div className="space-y-4">
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Feed Moderation"
        description="Monitor and moderate the live public feed. Showing latest 50 events."
      />

      <div className="flex items-center gap-3 bg-card p-3 border rounded-lg">
        <Input 
          placeholder="Filter by message content..." 
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="max-w-md"
        />
        <Button 
          variant="secondary" 
          onClick={() => {
            setFilterText('')
            refetch()
          }}
          disabled={isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[150px]">User</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[60px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            )}
            
            {!isLoading && visibleEvents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {data?.events.length === 0 ? "The feed is empty." : "No events match your filter."}
                </TableCell>
              </TableRow>
            )}

            {visibleEvents.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(event.created).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeColor(event.type) as any} className={getTypeClass(event.type)}>
                    {event.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {event.user?.display_name || <span className="text-muted-foreground italic">System</span>}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex flex-col gap-1">
                    <span>{event.message}</span>
                    {event.type === 'system' && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/50 p-1 rounded-sm w-fit">
                        <Info className="h-3 w-3" /> This is an automatic audit trace from a concurrent bet race condition. Do not delete — it is required for ledger integrity.
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteEvent.mutate(event.id)}
                    title="Delete event immediately"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
