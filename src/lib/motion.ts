export const MOTION_EASE = [0.16, 1, 0.3, 1] as const;

export const MOTION_DURATION = {
  micro: 0.18,
  ui: 0.3,
  reveal: 0.52,
  success: 0.85,
} as const;

export const revealUp = (reduceMotion: boolean, distance = 14) => ({
  initial: reduceMotion ? false : { opacity: 0, y: distance },
  animate: { opacity: 1, y: 0 },
  transition: reduceMotion
    ? { duration: 0 }
    : { duration: MOTION_DURATION.reveal, ease: MOTION_EASE },
});

export function eventTitleSize(title: string): string {
  const length = title.trim().length;
  if (length > 68) return "text-[clamp(2.65rem,6.2vw,6.4rem)]";
  if (length > 38) return "text-[clamp(2.8rem,7vw,7.3rem)]";
  return "text-[clamp(3rem,8vw,8.5rem)]";
}
