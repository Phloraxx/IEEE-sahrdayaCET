import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
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

const HERO_POSTER = '/fifa/hero-poster.jpg'
// ?v= busts CDN caches of older responses that lacked Content-Length / Range.
// #t=0.001 nudges iOS Safari to decode the first frame for inline autoplay.
const HERO_VIDEO = '/fifa/worldcup26-hero.mp4?v=3#t=0.001'

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

function configureIosInlineVideo(video: HTMLVideoElement) {
  video.muted = true
  video.defaultMuted = true
  video.volume = 0
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', 'true')
  video.setAttribute('disableRemotePlayback', '')
}

function useHeroVideoAutoplay(enabled: boolean, onHardError: () => void) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!enabled) return
    const video = videoRef.current
    if (!video) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onHardError()
      return
    }

    configureIosInlineVideo(video)

    const play = () => {
      configureIosInlineVideo(video)
      // iOS often rejects the first autoplay attempt — keep the element mounted
      // and retry on touch/scroll instead of falling back to a static poster.
      void video.play().catch(() => undefined)
    }

    const onError = () => onHardError()

    play()
    video.addEventListener('loadedmetadata', play)
    video.addEventListener('loadeddata', play)
    video.addEventListener('canplay', play)
    video.addEventListener('error', onError)

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) play()
      },
      { threshold: 0.1 },
    )
    observer.observe(video)

    const onVisibility = () => {
      if (!document.hidden) play()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const unlock = () => play()
    document.addEventListener('touchstart', unlock, { capture: true, passive: true })
    document.addEventListener('touchend', unlock, { capture: true, passive: true })
    document.addEventListener('scroll', unlock, { capture: true, passive: true })
    window.addEventListener('pageshow', unlock)

    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', play)
      video.removeEventListener('loadeddata', play)
      video.removeEventListener('canplay', play)
      video.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('touchstart', unlock, true)
      document.removeEventListener('touchend', unlock, true)
      document.removeEventListener('scroll', unlock, true)
      window.removeEventListener('pageshow', unlock)
    }
  }, [enabled, onHardError])

  return videoRef
}

export function FifaHero({ nextMatch, startingBalance, prize }: FifaHeroProps) {
  const [mounted, setMounted] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const onVideoHardError = useCallback(() => setVideoFailed(true), [])
  const videoRef = useHeroVideoAutoplay(mounted && !videoFailed, onVideoHardError)
  const countdown = useCountdown(nextMatch?.kickoff_at)

  useEffect(() => {
    setMounted(true)
  }, [])

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
        <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs text-[#9a9aa2] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-0.5">
          <span className="shrink-0 font-medium">{getStageLabel(nextMatch.stage)}</span>
          {showLive ? (
            <span className="min-w-0 font-mono font-semibold text-ieee-danger tabular-nums">
              {liveMatch!.homeGoals ?? 0} – {liveMatch!.awayGoals ?? 0}
            </span>
          ) : countdown ? (
            <>
              <span className="min-w-0 truncate font-mono font-semibold text-ieee-blue tabular-nums sm:hidden">
                {formatCountdown(countdown, true)}
              </span>
              <span className="hidden min-w-0 truncate font-mono font-semibold text-ieee-blue tabular-nums sm:inline">
                {formatCountdown(countdown)}
              </span>
            </>
          ) : null}
          <span className="shrink-0 font-mono font-semibold text-ieee-light-blue">
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
    <header
      className="relative min-h-[85svh] w-full overflow-hidden bg-black md:min-h-svh"
      style={{
        backgroundImage: `url("${HERO_POSTER}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {mounted && !videoFailed && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={HERO_POSTER}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover saturate-[1.05] contrast-[1.03]"
        >
          {/* Explicit type helps browsers pick the track; codecs left off so High/Main profiles aren't rejected. */}
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      )}

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
              to={`/FIFA/matches/${nextMatch.id}`}
              className="flex w-full min-h-[44px] max-w-[560px] shrink-0 items-center gap-[18px] overflow-hidden rounded-2xl bg-white/[0.97] px-[22px] py-[18px] text-[#0a0a0b] shadow-[0_24px_60px_rgba(0,20,40,.35)] backdrop-blur-[14px] transition-transform hover:-translate-y-0.5 md:w-auto"
            >
              {cardContent}
            </Link>
          ) : (
            <div className="flex w-full max-w-[560px] items-center gap-[18px] overflow-hidden rounded-2xl bg-white/[0.97] px-[22px] py-[18px] shadow-[0_24px_60px_rgba(0,20,40,.35)]">
              {cardContent}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}