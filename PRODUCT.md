# Product

## Register

brand

The primary public surface (`/FIFA`, `/FIFA/leaderboard`, `/FIFA/feed`, `/FIFA/matches`) is brand: the impression IS the product — a vibrant, game-day experience that makes students want to join. The authenticated dashboard (`/FIFA/dashboard`) and admin panel (`/admin/FIFA`) are product surfaces and follow product conventions, but the default register for the game is brand.

## Users

Sahrdaya College of Engineering & Technology students, roughly 18-22, joining a free-to-enter FIFA World Cup prediction game for fun and a sponsor voucher prize. They open it on their phones between classes, during the quarterfinals onward (June 10 start). Context: casual, social, competitive with friends, low attention span, thumb-driven. They want to (1) see the next match and current odds, (2) place a bet in under 15 seconds, (3) watch the live feed and leaderboard move, (4) check their rank. The admin is one or two IEEE student-branch members managing matches, entering results, and triggering the raffle.

## Product Purpose

A points-based match prediction game (fake points, no real money) on top of the existing IEEE Sahrdaya site, for the 2026 FIFA World Cup quarterfinals onward. Free to enter, college-email-only via Google OAuth, with a sponsor voucher prize decided by a weighted raffle at the end. Success = high participation (most active students playing every match day), lively live feed, fair settlement, a clean raffle draw. Not a gambling product — keep currency fake and the tone playful.

## Brand Personality

Lively, competitive, pitch-side. Three words: energetic, social, fair. Voice: punchy, game-day commentator, never preachy. Emotional goals: the thrill of watching your bet come in, the social pull of seeing friends climb the leaderboard, the fairness of a transparent raffle.

## Anti-references

- Sportsbook apps (Bet365, DraftKings) — too slick, too money-coded, too dark-green-on-black. This is a college game, not a gambling product.
- Generic SaaS dashboards with cards-in-cards and gray-on-purple — the AI slop default.
- Purple-to-blue gradients, glassmorphism, bounce easing — the 2026 AI-frontend tells.
- Anything that reads as "real money" — no green-felt-table aesthetic, no chip stacks, no "$" symbols.

## Design Principles

1. **Pitch-side, not sportsbook.** The energy of a stadium scoreboard, not the polish of a betting app. Big type, bold results, live movement — but the currency is fake points and the tone stays student-social.
2. **Bet in 15 seconds.** The betting UI is the hero. From match page → pick selection → stake → confirm is three taps. Friction kills participation.
3. **Live is the point.** The feed and pool splits update in real time. Movement = presence = "people are playing right now."
4. **Fairness is visible.** The raffle snapshot, the settlement math, the leaderboard rank — all transparent. No black-box payouts.
5. **One thumb.** Mobile-first, thumb-reachable, no hover-dependent interactions. Students are on phones.

## Accessibility & Inclusion

- WCAG 2.1 AA minimum. Body text ≥4.5:1 contrast, large text ≥3:1.
- Reduced-motion alternatives for every animation (live feed scroll-in, pool-bar transitions).
- Touch targets ≥44px on the betting controls.
- No color-only signaling (bet status uses text + icon + color).
- Kickoff times in the user's local timezone, labeled clearly.
