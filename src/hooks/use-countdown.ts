import { useEffect, useState } from 'react'

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  expired: boolean
}

function compute(targetMs: number): CountdownParts {
  const diff = Math.max(0, targetMs - Date.now())
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    totalMs: diff,
    expired: diff === 0,
  }
}

export function formatCountdown(parts: CountdownParts): string {
  if (parts.expired) return 'Kickoff now'
  return `Kicks off in ${parts.days}d ${parts.hours}h ${parts.minutes}m ${parts.seconds}s`
}

export function useCountdown(isoDate: string | null | undefined): CountdownParts | null {
  const [parts, setParts] = useState<CountdownParts | null>(null)

  useEffect(() => {
    if (!isoDate) {
      setParts(null)
      return
    }
    const target = new Date(isoDate).getTime()
    if (Number.isNaN(target)) {
      setParts(null)
      return
    }
    const tick = () => setParts(compute(target))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isoDate])

  return parts
}