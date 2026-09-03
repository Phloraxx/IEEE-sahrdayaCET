
import { useQuery } from "@tanstack/react-query"
import { listAdminFifaMatches, type AdminFifaMatchRecord } from "@/lib/data/admin-fifa.client";
import { useState } from "react"
import { ChevronDown, ChevronUp, Trophy } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/dates";
import { AdminFifaMarketsSection } from "@/features/fifa/admin-market-management";
import { AdminFifaSettlementSection } from "@/features/fifa/admin-match-settlement";

type MatchRow = AdminFifaMatchRecord



export default function AdminFifaMatches() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-fifa-matches'], queryFn: listAdminFifaMatches })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div>
      <PanelHeader
        eyebrow="WC Predict '26"
        title="Matches"
        description="Matches are synced from live data. Manage markets and settle results here."
      />

      {isLoading && <Skeleton className="h-32 w-full" />}
      {data && data.matches.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No matches synced yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.matches.map((m) => (
          <MatchItem
            key={m.id}
            match={m}
            isExpanded={expandedId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
          />
        ))}
      </div>
    </div>
  )
}

function StatusBadge({ status, settled }: { status: string; settled: boolean }) {
  if (settled) return <Badge variant="secondary">Settled</Badge>
  const variant = status === 'live' ? 'destructive' : status === 'finished' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

function MatchItem({ match, isExpanded, onToggle }: { match: MatchRow; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-lg border bg-card overflow-hidden transition-colors ${isExpanded ? 'border-primary/50' : 'hover:border-primary/50'}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <p className="font-medium truncate">{match.team_home} vs {match.team_away}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {match.stage.toUpperCase()} · {match.kickoff_at ? formatDateTime(match.kickoff_at) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={match.status} settled={match.settled} />
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t bg-muted/20">
          <div className="grid gap-6 lg:grid-cols-2 mt-4">
            <AdminFifaMarketsSection matchId={match.id} />
            <AdminFifaSettlementSection match={match} />
          </div>
        </div>
      )}
    </div>
  )
}
