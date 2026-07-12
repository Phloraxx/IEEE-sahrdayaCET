export function FifaStatsStrip({
  playerCount,
  totalBets,
}: {
  playerCount: number | null
  totalBets: number | null
}) {
  if (playerCount === null || totalBets === null) {
    return (
      <div className="border-t border-white/10 px-[clamp(20px,4vw,48px)] py-4 text-center">
        <p className="font-mono text-xs tracking-wide text-white/50">
          <span className="text-white/40 italic">Global stats temporarily unavailable</span>
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-white/10 px-[clamp(20px,4vw,48px)] py-4 text-center">
      <p className="font-mono text-xs tracking-wide text-white/50 tabular-nums">
        <span className="text-white/70">{playerCount.toLocaleString()}</span> players
        <span className="mx-2 text-white/25">·</span>
        <span className="text-white/70">{totalBets.toLocaleString()}</span> bets placed
      </p>
    </div>
  )
}