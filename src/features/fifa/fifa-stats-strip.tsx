export function FifaStatsStrip({
  playerCount,
  totalBets,
}: {
  playerCount: number
  totalBets: number
}) {
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