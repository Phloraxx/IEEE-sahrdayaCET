import { Link } from '@tanstack/react-router'
import {
  flagUrl,
  getMatchCardAsset,
  getStageColor,
  getStageLabel,
  teamShortName,
} from '@/lib/fifa-assets'
import { findLiveMatch, isLiveStatus } from '@/lib/fifa-live-match'
import type { LiveScoreMatch } from '@/lib/fifa-live-match'

export interface FifaMatchCardData {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  status: string
  settled?: boolean
  markets?: Array<{ is_open: boolean; void: boolean }>
}

function fmtDay(d: Date) {
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    dom: d.getDate(),
    mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  }
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function FlagImg({ team }: { team: string }) {
  const src = flagUrl(team)
  if (!src) return <span className="inline-block h-[18px] w-[26px] shrink-0 rounded-sm bg-white/20" />
  return (
    <img
      src={src}
      alt=""
      className="h-[18px] w-[26px] shrink-0 rounded-sm object-cover shadow-[0_0_0_1px_rgba(255,255,255,.55),0_2px_6px_rgba(0,0,0,.4)]"
      loading="lazy"
    />
  )
}

export function FifaMatchCard({
  match,
  liveMatches = [],
  liveConfigured = false,
  className = '',
}: {
  match: FifaMatchCardData
  liveMatches?: LiveScoreMatch[]
  liveConfigured?: boolean
  className?: string
}) {
  const kickoff = new Date(match.kickoff_at)
  const day = fmtDay(kickoff)
  const asset = getMatchCardAsset(match.team_home, match.team_away, match.stage)
  const stageColor = getStageColor(match.stage)

  const liveMatch = liveConfigured
    ? findLiveMatch(match.team_home, match.team_away, liveMatches)
    : null
  const showLive = (liveMatch && isLiveStatus(liveMatch.status)) || match.status === 'live'
  const openMarkets = (match.markets || []).filter((m) => m.is_open && !m.void).length

  return (
    <Link
      to="/FIFA/matches/$id/"
      params={{ id: match.id }}
      className={`group relative flex h-[238px] min-w-[302px] max-w-[302px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[14px] p-4 shadow-[0_1px_0_rgba(255,255,255,.04)_inset] transition-[transform,box-shadow] duration-300 hover:-translate-y-[7px] hover:shadow-[0_22px_40px_rgba(0,0,0,.5)] ${className}`}
      style={{ background: '#101823' }}
    >
      <div
        className="absolute top-0 right-0 left-0 z-[3] h-1"
        style={{ background: stageColor }}
      />

      {asset.imageUrl ? (
        <div
          className="absolute inset-0 scale-[1.04] bg-cover transition-[transform,filter] duration-500 group-hover:scale-[1.14]"
          style={{
            backgroundImage: `url("${asset.imageUrl}")`,
            backgroundPosition: asset.position,
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${stageColor}88, #101823)`,
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.06) 30%, rgba(0,0,0,.15) 55%, rgba(0,0,0,.92) 100%)',
        }}
      />
      {asset.imageUrl && (
        <div
          className="absolute inset-0 opacity-30 mix-blend-color"
          style={{ background: stageColor }}
        />
      )}

      <div className="relative z-[2] flex items-center justify-between">
        <span
          className={`rounded-full border border-white/18 px-2.5 py-[5px] font-mono text-[10px] font-bold tracking-[0.06em] backdrop-blur-[8px] ${
            showLive
              ? 'border-ieee-danger bg-ieee-danger text-white'
              : 'bg-black/40 text-white'
          }`}
        >
          {showLive ? 'LIVE' : getStageLabel(match.stage)}
        </span>
        <span className="text-right text-[10.5px] leading-snug font-bold text-white/90 shadow-[0_1px_4px_rgba(0,0,0,.6)]">
          {showLive && liveMatch ? (
            <span className="font-mono tabular-nums">
              {liveMatch.homeGoals ?? 0} – {liveMatch.awayGoals ?? 0}
            </span>
          ) : (
            <>
              {day.dow}
              <br />
              {day.dom} {day.mon}
            </>
          )}
        </span>
      </div>

      <div className="relative z-[2]">
        <div className="mb-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <FlagImg team={match.team_home} />
            <span className="font-display text-[19px] leading-none tracking-[-0.01em] text-white uppercase shadow-[0_2px_10px_rgba(0,0,0,.7)]">
              {teamShortName(match.team_home)}
            </span>
          </div>
          <span className="ml-[35px] font-mono text-[9.5px] font-bold tracking-[0.18em] text-white/55">
            VS
          </span>
          <div className="flex items-center gap-2">
            <FlagImg team={match.team_away} />
            <span className="font-display text-[19px] leading-none tracking-[-0.01em] text-white uppercase shadow-[0_2px_10px_rgba(0,0,0,.7)]">
              {teamShortName(match.team_away)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 border-t border-white/18 pt-2 text-[11.5px] text-white/82 shadow-[0_1px_4px_rgba(0,0,0,.6)]">
          <span className="truncate font-semibold text-white">{fmtTime(kickoff)}</span>
          {openMarkets > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-ieee-light-blue">
              {openMarkets} open
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function FifaMatchCardSkeleton() {
  return (
    <div className="h-[238px] min-w-[302px] max-w-[302px] shrink-0 animate-pulse rounded-[14px] bg-[#131519]" />
  )
}