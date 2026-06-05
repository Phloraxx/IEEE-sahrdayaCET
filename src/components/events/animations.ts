import type { Variants } from 'framer-motion'

export const FADE_UP: Variants = {
    hidden: { opacity: 0, y: 40 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 60, damping: 15 } },
}

export const STAGGER: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
}
