import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FifaMatchCard, FifaMatchCardSkeleton } from '@/features/fifa/fifa-match-card'
import type { FifaMatchCardData } from '@/features/fifa/fifa-match-card'
import { filterPublicActiveFifaMatches } from '@/lib/fifa-match-filters'

async function fetchMatches(): Promise<{ matches: FifaMatchCardData[] }> {
  const res = await fetch('/api/fifa/matches')
  if (!res.ok) throw new Error('Failed to load matches')
  return res.json()
}

async function fetchLiveScores() {
  const res = await fetch('/api/fifa/live-scores')
  if (!res.ok) return { matches: [], configured: false }
  return res.json()
}

export function FifaMatchCarousel() {
  const carouselRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['fifa-matches'],
    queryFn: fetchMatches,
    refetchInterval: 15_000,
  })

  const { data: liveData } = useQuery({
    queryKey: ['fifa-live-scores'],
    queryFn: fetchLiveScores,
    refetchInterval: 60_000,
  })

  const scroll = (dir: 'left' | 'right') => {
    carouselRef.current?.scrollBy({ left: dir === 'left' ? -318 : 318, behavior: 'smooth' })
  }

  const activeMatches = filterPublicActiveFifaMatches(data?.matches ?? [])

  return (
    <section className="border-t border-white/10 px-[clamp(20px,4vw,48px)] py-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <div className="flex w-full shrink-0 flex-row items-center justify-between gap-6 lg:w-[250px] lg:flex-col lg:items-start lg:justify-between">
          <Link
            to="/FIFA/matches/"
            className="group flex min-h-[44px] items-start gap-3.5 text-left text-[#f5f5f5] transition-colors hover:text-ieee-light-blue"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#f5f5f5] transition-all group-hover:border-ieee-light-blue">
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
            <span className="text-[15px] leading-snug font-bold">
              View all matches &amp; results
            </span>
          </Link>
          <div className="flex items-center gap-2.5 text-[13px] font-semibold text-[#9a9aa2]">
            <span className="live-dot" />
            All times in your local timezone
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={carouselRef}
            className="flex gap-4 overflow-x-auto pb-1 scroll-smooth snap-x snap-proximity no-scrollbar"
          >
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => <FifaMatchCardSkeleton key={i} />)}
            {!isLoading && activeMatches.length === 0 && (
              <p className="py-8 text-sm text-[#9a9aa2]">No upcoming matches yet. Check back soon.</p>
            )}
            {activeMatches.map((m) => (
              <FifaMatchCard
                key={m.id}
                match={m}
                liveMatches={liveData?.matches ?? []}
                liveConfigured={liveData?.configured ?? false}
              />
            ))}
          </div>
          <div className="mt-3.5 hidden justify-end gap-2 md:flex">
            <button
              type="button"
              onClick={() => scroll('left')}
              aria-label="Scroll left"
              className="flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-[#131519] text-[#f5f5f5] transition-colors hover:border-ieee-light-blue hover:bg-white/10"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              aria-label="Scroll right"
              className="flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/10 bg-[#131519] text-[#f5f5f5] transition-colors hover:border-ieee-light-blue hover:bg-white/10"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}