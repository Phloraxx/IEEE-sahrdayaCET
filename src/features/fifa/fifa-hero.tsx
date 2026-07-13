import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { flagUrl, getStageLabel } from '@/lib/fifa-assets'
import { findLiveMatch, isLiveStatus, type LiveScoreMatch } from '@/lib/fifa-live-match'
import { useCountdown, formatCountdown } from '@/hooks/use-countdown'

export interface HeroMatch {
  id: string
  team_home: string
  team_away: string
  stage: string
  kickoff_at: string
  status: string
  openMarkets: number
}

interface FifaHeroProps {
  nextMatch: HeroMatch | null
  startingBalance: number
  prize?: string
}

async function fetchLiveScores() {
  const res = await fetch('/api/fifa/live-scores')
  if (!res.ok) return { matches: [], configured: false }
  return res.json() as Promise<{ matches: LiveScoreMatch[]; configured: boolean }>
}

function FlagImg({ team }: { team: string }) {
  const src = flagUrl(team)
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="h-[17px] w-6 shrink-0 rounded-sm object-cover shadow-[0_0_0_1px_rgba(0,0,0,.12)]"
      loading="lazy"
    />
  )
}

function useHeroVideoAutoplay() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const play = () => {
      if (video.paused) void video.play().catch(() => {})
    }

    play()
    video.addEventListener('loadeddata', play)
    video.addEventListener('canplay', play)

    const onVisibility = () => {
      if (!document.hidden) play()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      video.removeEventListener('loadeddata', play)
      video.removeEventListener('canplay', play)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return videoRef
}

export function FifaHero({ nextMatch, startingBalance, prize }: FifaHeroProps) {
  const videoRef = useHeroVideoAutoplay()
  const countdown = useCountdown(nextMatch?.kickoff_at)

  const { data: liveData } = useQuery({
    queryKey: ['fifa-live-scores'],
    queryFn: fetchLiveScores,
    refetchInterval: 60_000,
    enabled: !!nextMatch,
  })

  const liveMatch = nextMatch && liveData?.configured
    ? findLiveMatch(nextMatch.team_home, nextMatch.team_away, liveData.matches)
    : null
  const showLive = liveMatch && isLiveStatus(liveMatch.status)
  const isLive = showLive || nextMatch?.status === 'live'

  const tagLabel = isLive ? 'LIVE' : 'UPCOMING'

  const cardContent = nextMatch ? (
    <>
      <div
        className={`shrink-0 rounded-full px-[11px] py-[7px] text-[10px] font-extrabold tracking-[0.1em] text-white ${
          isLive ? 'bg-ieee-danger' : 'bg-ieee-blue'
        }`}
      >
        {tagLabel}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 overflow-hidden text-[17px] font-extrabold whitespace-nowrap text-[#0a0a0b]">
          <FlagImg team={nextMatch.team_home} />
          <span className="truncate">{nextMatch.team_home}</span>
          <span className="text-xs font-medium text-[#9a978f]">vs</span>
          <FlagImg team={nextMatch.team_away} />
          <span className="truncate">{nextMatch.team_away}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs whitespace-nowrap text-[#9a9aa2]">
          <span>{getStageLabel(nextMatch.stage)}</span>
          {showLive ? (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-[#c9c3b8]" />
              <span className="font-mono font-semibold text-ieee-danger tabular-nums">
                {liveMatch!.homeGoals ?? 0} – {liveMatch!.awayGoals ?? 0}
              </span>
            </>
          ) : countdown ? (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-[#c9c3b8]" />
              <span className="font-mono font-semibold text-ieee-blue tabular-nums">
                {formatCountdown(countdown)}
              </span>
            </>
          ) : null}
          <span className="h-[3px] w-[3px] rounded-full bg-[#c9c3b8]" />
          <span className="font-mono font-semibold text-ieee-light-blue">
            {nextMatch.openMarkets} market{nextMatch.openMarkets === 1 ? '' : 's'} open
          </span>
        </div>
      </div>
      <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-ieee-blue text-xl text-white">
        ⚽
      </div>
    </>
  ) : (
    <div className="flex-1 py-2 text-sm text-[#9a9aa2]">
      No upcoming matches yet. Check back soon.
    </div>
  )

  return (
    <header className="relative min-h-[85svh] w-full overflow-hidden bg-black md:min-h-svh">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/fifa/hero-poster.jpg"
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover saturate-[1.05] contrast-[1.03]"
      >
        <source src="/fifa/worldcup26-hero.mp4" type="video/mp4" />
      </video>

      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,10,20,.5) 0%, rgba(0,10,20,.05) 22%, rgba(0,10,20,.12) 55%, rgba(5,15,25,.88) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(0,20,35,.5) 100%)',
        }}
      />

      <div className="relative z-[2] flex h-full min-h-[inherit] flex-col justify-end pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-start justify-between gap-7 px-[clamp(20px,4vw,48px)] md:flex-row md:items-end">
          <div className="max-w-[640px]">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/8 px-3 py-[7px] font-mono text-[clamp(9px,1vw,11px)] font-semibold tracking-[0.22em] text-ieee-light-blue uppercase backdrop-blur-[10px]">
              2026 Tournament · June 11 — July 19
            </span>
            <h1
              className="font-pixel text-[clamp(22px,7vw,52px)] leading-[1.15] tracking-[-0.02em] text-white select-none"
              style={{
                textShadow:
                  '4px 4px 0 rgba(0,98,155,.55), 0 14px 40px rgba(0,0,0,.4)',
              }}
            >
              WC PREDICT &apos;26
            </h1>
            <p className="font-display mt-2 text-[clamp(18px,3vw,28px)] tracking-wide text-white/90 uppercase">
              IEEE Sahrdaya SB
            </p>
            <div className="mt-[18px] inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/12 px-[14px] py-2 text-xs font-semibold tracking-[0.02em] text-white backdrop-blur-[10px]">
              Free to play ·{' '}
              <b className="font-extrabold text-ieee-light-blue">{startingBalance} tickets</b> to start
              {prize ? (
                <>
                  {' '}
                  · Win <b className="font-extrabold text-ieee-light-blue">{prize}</b>
                </>
              ) : (
                <> · Win a sponsor voucher</>
              )}
            </div>
          </div>

          {nextMatch ? (
            <Link
              to="/FIFA/matches/$id/"
              params={{ id: nextMatch.id }}
              className="flex w-full min-h-[44px] max-w-[560px] shrink-0 items-center gap-[18px] rounded-2xl bg-white/[0.97] px-[22px] py-[18px] text-[#0a0a0b] shadow-[0_24px_60px_rgba(0,20,40,.35)] backdrop-blur-[14px] transition-transform hover:-translate-y-0.5 md:w-auto"
            >
              {cardContent}
            </Link>
          ) : (
            <div className="flex w-full max-w-[560px] items-center gap-[18px] rounded-2xl bg-white/[0.97] px-[22px] py-[18px] shadow-[0_24px_60px_rgba(0,20,40,.35)]">
              {cardContent}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}