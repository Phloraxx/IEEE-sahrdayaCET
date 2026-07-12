# DESIGN.md

Inherits the existing IEEE Sahrdaya design system (Tailwind v4 + CSS custom properties in `src/features/globals.css`). The FIFA game does not invent a new palette — it uses the inherited tokens with a brand-register treatment for the public surfaces.

## Color

Inherited from `globals.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--color-ieee-blue` | `#00629B` | Primary brand, header, primary buttons |
| `--color-ieee-light-blue` | `#0099D6` | Accent, live indicators, links |
| `--color-ieee-slate` | `#1e293b` | Ink, body text on light |
| `--color-ieee-success` | `#16a34a` | Won bet, positive payout |
| `--color-ieee-warning` | `#d97706` | Pending bet, live match |
| `--color-ieee-danger` | `#dc2626` | Lost bet, voided market |
| shadcn semantic tokens | (see globals.css) | background, foreground, card, muted, border, etc. |

FIFA game additions (brand register, pitch-side energy):
- **Pool bar fill:** `--color-ieee-light-blue` (the "live money" indicator).
- **Bet status:** success/warning/danger from inherited tokens — never color-only, always text + icon.
- **No new gradient text, no glassmorphism, no purple.** The inherited tokens are clean; keep them.

## Typography

| Role | Family | Source |
|------|--------|--------|
| Display (hero, match teams, "PLACE BET") | `--font-display`: Anton | `globals.css:53` |
| Body / UI | `--font-sans`: Inter Variable | `globals.css:51` |
| Mono / numbers (balance, stake, pool totals) | `--font-mono`: Geist Mono | `globals.css:52` |
| Pixel (retro game accents, "GOAL!") | Press Start 2P | `__root.tsx:13` |

Scale: use Tailwind's fluid clamp utilities. Hero `clamp(2.5rem, 6vw, 5rem)`. Body 1rem / 1.6 line-height. Cap body line length 65-75ch per Impeccable.

## Components

Inherited shadcn/ui primitives (`src/components/ui/`): Button, Card, Dialog, Table, Badge, Input, Select, Tabs, Tooltip. Use these for the betting slip, dashboard tables, admin forms — do not reinvent.

FIFA-specific components (to build in `src/features/fifa/`):
- `MatchCard` — team vs team, kickoff, stage badge, pool total chip.
- `MarketRow` — market type, options as tappable chips, pool bar per option, odds (fixed mode).
- `BettingSlip` — selection summary, stake input (with max-bet slider), confirm button. Mobile-first, thumb-reachable.
- `LeaderboardRow` — rank, alias, balance, bets count.
- `FeedItem` — type icon, message, timestamp. Live scroll-in with reduced-motion fallback.
- `PoolBar` — horizontal stacked bar showing pool split per option.

## Layout

- Mobile-first single column. Max content width `max-w-2xl` for public pages, `max-w-4xl` for dashboard/admin.
- Match detail: teams hero → markets list (each a card with options) → betting slip sticky-bottom on mobile.
- Feed: reverse-chronological list, newest at top, live-prepend on SSE event.
- Spacing: Tailwind's default scale. Vary spacing for rhythm — don't make every section `py-8`.

## Motion

- Use `framer-motion` (already in deps) for feed item entrance (slide-in + fade, 220ms ease-out-quart), pool bar width transitions (300ms ease-out-quart), and the "bet placed" confirmation burst.
- Reduced-motion: `@media (prefers-reduced-motion: reduce)` → crossfade or instant. No bounce, no elastic.
- Live indicators (pulsing dot for "live match"/"pool updating") use opacity pulse, 2s ease-in-out infinite, with reduced-motion fallback to static.

## Icons

`lucide-react` (already in deps) for UI icons. No emoji in the UI unless the user asks.

## Z-index scale

Inherited semantic scale: dropdown (1000) → sticky header (1020) → modal-backdrop (1040) → modal (1050) → toast (1060) → tooltip (1070). Betting slip sticky-bottom on mobile uses `z-30` (below dropdowns).
