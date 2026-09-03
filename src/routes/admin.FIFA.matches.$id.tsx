import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query"
import { getAdminFifaMatch } from "@/lib/data/admin-fifa.client";
import { ArrowLeft } from "lucide-react"
import { PanelHeader } from "@/components/admin/panel-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/dates";
import { AdminFifaMarketsSection } from "@/features/fifa/admin-market-management";
import { AdminFifaSettlementSection } from "@/features/fifa/admin-match-settlement";

export default function AdminFifaMatchDetail() {
  const { id = "" } = useParams();
  const { data: matchData, isLoading } = useQuery({ queryKey: ['admin-fifa-match', id], queryFn: () => getAdminFifaMatch(id) })
  const match = matchData?.match

  return (
    <div>
      <Link to="/admin/FIFA/matches/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All matches
      </Link>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : match ? (
        <>
          <PanelHeader
            eyebrow={match.stage.toUpperCase()}
            title={`${match.team_home} vs ${match.team_away}`}
            description={`Kickoff: ${match.kickoff_at ? formatDateTime(match.kickoff_at) : '—'}`}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Markets section */}
            <AdminFifaMarketsSection matchId={id} emptyMessage="No markets yet. Create one to open betting." />

            {/* Settle section */}
            <AdminFifaSettlementSection match={match} />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Match not found.</p>
      )}
    </div>
  )
}
