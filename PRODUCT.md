# Product

## Surface register

The primary WC Predict public surfaces (`/FIFA`, `/FIFA/leaderboard`, `/FIFA/matches`) are brand-first: the impression is part of the product. The authenticated dashboard (`/FIFA/dashboard`) and admin routes are product/operations surfaces and prioritise clarity, state, and control.

## Users

Primary users are Sahrdaya College of Engineering & Technology students joining a free-to-enter football prediction game for fun and sponsor prizes.

Typical usage is mobile, between classes or while matches are active. The important jobs are:

1. see upcoming/live/recent matches quickly;
2. understand available prediction markets;
3. place a point bet with very little friction;
4. see current balance, bet state, and leaderboard position;
5. understand settlement/refund outcomes after a match.

Admins are a small set of IEEE student-branch operators managing matches/markets, results, settlement, settings, and raffle operations.

## Product purpose

WC Predict '26 is a points-based match prediction game on top of the IEEE Sahrdaya website.

It is free to enter and uses fake points only. There is no entry fee, deposit, withdrawal, cash stake, or user-to-user money transfer.

Success means:

- students can understand and place predictions quickly;
- balances and pool/market state remain coherent;
- settlement and void/refund behaviour are fair and repeatable;
- leaderboard and raffle outcomes are auditable;
- the game remains clearly distinguishable from a real-money gambling product.

## Brand personality

Lively, competitive, pitch-side.

Three words: **energetic, social, fair**.

Voice is punchy and game-day oriented without pretending fake points are cash. The emotional goal is friendly competition: seeing a prediction land, watching rank move, and comparing performance with friends.

## Anti-references

- Real-money sportsbook apps — too money-coded and misleading for this product.
- Generic SaaS dashboards on public game pages — too sterile for a student event.
- Green-felt/casino/chip-stack visual language.
- Deposit/withdrawal/wallet terminology that implies redeemable money.
- Purple-blue AI-template gradients and gratuitous glassmorphism on every surface.

## Product principles

1. **Pitch-side, not sportsbook.** Use stadium/scoreboard energy without mimicking real-money betting UX.
2. **Fast prediction flow.** Match → selection → stake → confirm should be understandable and thumb-friendly.
3. **State must be clear.** Upcoming, locked, live, settled, won, lost, void, and refunded states must be explicit.
4. **Fairness is visible.** Settlement, ledger changes, leaderboard rank, and raffle evidence should be explainable and auditable.
5. **One thumb.** Public interaction is mobile-first and should not depend on hover.
6. **Backend truth wins.** UI optimism must never override PocketBase transaction/invariant results.

## Economy model

Fake points are stored on the user record with an append-style transaction ledger.

Load-bearing economy changes happen only through PocketBase commands/hooks that keep balance, bet, pool, payout/refund, and ledger state coherent.

Live-score/display integrations never settle balances automatically. Admin settlement remains explicit.

## Accessibility and inclusion

- WCAG AA contrast target.
- Reduced-motion alternatives for continuous/entrance animation.
- Touch targets at least 44px where practical.
- No color-only status signalling.
- Kickoff/lock times must be labelled and formatted clearly.
- Critical controls must remain keyboard accessible.

## Relationship to the main site

WC Predict is a feature inside the same React Router + PocketBase application, not a separate service or database.

It shares the site's PocketBase identity/role model and deployment pipeline while keeping its own `.fifa-theme` visual register and backend transactional rules.

See `FIFA-GAME.md` for the backend/game contract, `DESIGN.md` for the visual contract, and `docs/security-architecture.md` for trust boundaries.
