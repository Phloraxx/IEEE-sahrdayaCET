import { getTeamPlayerVisual } from '@/lib/fifa-assets'

interface FifaMatchPlayerCutoutProps {
  team: string
  side: 'home' | 'away'
  size?: 'card' | 'hero'
}

const SIZE_STYLES = {
  card: {
    wrap: 'h-[118px] w-[88px]',
    img: 'object-top',
    crest: 'object-contain p-3',
    label: 'text-[8px]',
  },
  hero: {
    wrap: 'h-[148px] w-[108px] sm:h-[180px] sm:w-[132px]',
    img: 'object-top',
    crest: 'object-contain p-4',
    label: 'text-[9px] sm:text-[10px]',
  },
} as const

export function FifaMatchPlayerCutout({ team, side, size = 'card' }: FifaMatchPlayerCutoutProps) {
  const visual = getTeamPlayerVisual(team)
  if (!visual) return null

  const styles = SIZE_STYLES[size]
  const isHome = side === 'home'

  return (
    <div
      className={`pointer-events-none relative shrink-0 ${styles.wrap} ${
        isHome ? '-translate-x-1' : 'translate-x-1'
      }`}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-t-[40%] opacity-70 blur-xl"
        style={{
          background: isHome
            ? 'linear-gradient(135deg, rgba(0,98,155,.55), transparent)'
            : 'linear-gradient(225deg, rgba(0,184,169,.45), transparent)',
        }}
      />
      <img
        src={visual.photoUrl}
        alt=""
        loading="lazy"
        className={`relative h-full w-full ${
          visual.isPlayerPhoto ? styles.img : styles.crest
        } drop-shadow-[0_10px_18px_rgba(0,0,0,.55)] [mask-image:linear-gradient(to_top,black_72%,transparent_100%)]`}
      />
      <span
        className={`absolute bottom-0 ${isHome ? 'left-0' : 'right-0'} max-w-full truncate rounded-full bg-black/55 px-1.5 py-0.5 font-mono font-bold tracking-[0.08em] text-white/85 uppercase backdrop-blur-sm ${styles.label}`}
      >
        {visual.isPlayerPhoto ? visual.name.split(' ').pop() : visual.name}
      </span>
    </div>
  )
}