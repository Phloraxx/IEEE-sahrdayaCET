# FIFA WC Predict '26 — Design & Fix Log

> Points-based match prediction game for the 2026 FIFA World Cup
> (quarterfinals onward). Free to enter, college-email-only, sponsor voucher
> prize via weighted raffle. **Not a gambling product** — fake points only.

This document captures every design decision, the logical gaps found in the
initial implementation, and the fixes applied. It is the canonical reference
for the game's rules, economy, settlement, and admin tooling. `AGENTS.md`
covers the technical architecture (collections, hooks, routes); this doc
covers the **product and football-domain logic**.

---

## 1. Player journey

1. **Land on `/FIFA`** → branding, prize chip, player/bet counts, next match,
   4-step "how it works", quick links. A prominent **Rules** link is in the
   nav and the hero.
2. **Sign in** with `@sahrdaya.ac.in` Google account → `starting_balance`
   (1000 pts) lands, feed posts "New player joined".
3. **`/FIFA/matches`** → upcoming QF/SF/3rd/final. Each card shows teams,
   kickoff (local time), stage, open-market count, and a **live score** overlay
   when the match is in play (polled from football-data.org, 60s cache).
4. **Click a match** → teams hero, kickoff, knockout notice ("Match Winner =
   who advances · score markets are 90-minute"), markets list. Each market
   card shows its **mode** (pool/fixed) with a one-line explainer and the
   25% cap. Options are tappable chips with live pool bars (SSE) or fixed
   odds.
5. **Tap a chip** → sticky betting slip → stake input (capped at
   `max_bet_percent`% of balance, with the cap shown) → confirm → toast,
   balance drops, feed posts, pool bar moves.
6. **Watch the match IRL.** Admin enters the 90-min result + who advanced →
   settle → bets flip to won/lost/void, balances update, feed shows the
   scoreline. If the admin is a no-show, a cron auto-voids after
   `auto_void_hours` (default 6h).
7. **`/FIFA/leaderboard`** → ranked by balance (tiebreak: bets count), with
   the **raffle formula** and min-bets threshold shown inline so users
   understand how rank maps to raffle tickets.
8. **End of tournament** → admin triggers raffle → weighted pick, winner
   announced in feed, full ticket snapshot stored for audit.

---

## 2. Fixes applied (from the review)

### 2.1 Knockout football modeling (was: no ET/pens/advance)

**Problem.** All matches are knockouts (QF→final) but the schema only had
`result_winner: home|away|draw` and `correct_score` = `"{home}-{away}"`. A
90-min draw in a QF is common, but there was no field for who advanced on
extra time/penalties. `match_winner` settling on `result_winner` meant a QF
that ended 1-1 (90 min) with home winning on pens would void all
match-winner bets (result was "draw") — wrong.

**Fix.** Added three fields to `fifa_matches`:

| Field | Type | Purpose |
|-------|------|---------|
| `result_advance` | select `home\|away` | Who advanced (knockouts). Auto-set to `result_winner` if 90-min wasn't a draw. |
| `result_after_extra_time` | bool | Went to extra time (display only). |
| `result_after_penalties` | bool | Decided on penalties (display only). |

**Settlement semantics (now explicit and documented on the match page):**

| Market | Settles on |
|--------|-----------|
| `match_winner` | **Who advances** (`result_advance`). In a group stage (future) without `result_advance`, falls back to `result_winner`. |
| `correct_score` | 90-minute score (`result_home_goals`-`result_away_goals`). |
| `total_goals_ou` | 90-minute total goals. |
| `any_scorer` | Any goal during regulation + extra time. |
| `clean_sheet` | 90-minute clean sheet (conceded 0 in 90 min). |
| `cards_ou` | Total cards across 90 min + extra time. |
| `custom` | Admin marks winning option(s). |

The judge in `fifa-payout.ts` and `fifa.pb.js` now does:
`const winner = result.result_advance || result.result_winner; return sel === winner ? 'won' : 'lost'`.

The admin settle form has a **"90-min result"** select (home/away/draw) and a
**"Who advanced?"** select (home/away). If 90-min isn't a draw, the advance
field auto-fills and disables. If it's a draw, the admin picks who went
through.

### 2.2 `first_scorer` → `any_scorer` (was: mislabeled)

**Problem.** The judge did `scorers.indexOf(selection) !== -1` against the
full scorers array — so it was actually "any scorer", not "first scorer".
The label lied.

**Fix.** Renamed the market type `first_scorer` → `any_scorer`, label
"Anytime Scorer". The admin form relabeled to "Anytime scorers
(comma-separated)". The judge logic is unchanged (it was already correct for
"any scorer"); only the name now matches the behavior. Pre-launch, no data
migration needed.

### 2.3 Auto-void cron (was: no expiry on pending bets)

**Problem.** If the admin forgot to settle, bets sat `pending` forever —
frozen balance, no leaderboard reflection. Single point of failure.

**Fix.** Added a cron `fifa-auto-void` running every 30 minutes:

| Condition | Action |
|-----------|--------|
| `status = 'upcoming'` and `kickoff_at` > `auto_void_hours` ago | Set `status = 'void'`, void all markets (triggers refund hook). |
| `status = 'live'` and `kickoff_at` > `auto_void_hours` ago | Same. |
| `status = 'finished'` and `settled = false` and `kickoff_at` > 48h ago | Same (admin entered result but never settled). |

`auto_void_hours` is a settings field (default 6). A football match is
~2-2.5h including ET, so 6h gives the admin ample time. The 48h
finished-but-unsettled timeout is a hard safety net.

### 2.4 Leaderboard ranking (was: balance-only, non-bettors outrank active losers)

**Problem.** A non-bettor at 1000 pts outranked an active loser at 750. The
raffle's `min_bets=1` didn't gate participation meaningfully.

**Fix.** Two changes:
1. **Leaderboard tiebreak**: rank by `balance` desc, then `bets_count` desc.
   Same-balance users with more bets rank higher. The leaderboard still
   shows everyone with `balance > 0` (non-bettors appear, but the raffle
   gate filters them out — and the formula is shown so users understand).
2. **Raffle eligibility raised**: `raffle_active_participant_min_bets`
   default 1 → **5**. Only players who placed ≥5 bets enter the raffle.
   Late joiners can still hit 5 bets across the remaining matches (the user
   confirmed late joiners are acceptable).

The leaderboard page now shows the raffle formula inline:
> Rank → tickets: `max(1, base − decay × (rank − 1))`. Min 5 bets to enter.

### 2.5 UX opacity (was: rules invisible)

**Fix.** Added a dedicated **`/FIFA/rules`** page (linked from the nav and
the overview hero) that explains every rule in plain language:

- The 25% cap and why it exists (risk limiter — you can't blow everything
  on one bet).
- Pool vs fixed mode (pool = split the pot proportional to stake; fixed =
  stake × odds).
- Settlement timing (90-min vs advance, any-scorer scope, cards scope).
- The raffle formula and min-bets gate.
- Daily top-up (below threshold → topped to target at 9am).
- Voiding rules (market void = refund; auto-void if admin is a no-show).

On the **match page**, each market card now shows a one-line mode explainer
and the 25% cap in the betting slip. A knockout notice appears on QF/SF/3rd/
final matches. The `correct_score` options have a `2-1` format hint.

On the **betting slip**, the stake input shows "Max X pts (25% of balance)"
and clamps.

### 2.6 Admin testing console (`/admin/FIFA/testing`)

**Problem.** No way to test the full bet→settle→payout flow without a live
match and real users betting.

**Fix.** A dedicated admin page with:
- **All matches + bets table**: every match with its bet count, pool total,
  status; expand to see every bet across all users.
- **One-click test match**: creates a match (kickoff +1h) with all 6
  standard market types pre-configured, so the admin can immediately bet
  from their own account and settle.
- **Balance adjust**: grant/deduct points for any user (writes an
  `admin_adjust` ledger row via a new admin-gated PB route).
- **Auto-void trigger**: manually fire the auto-void sweep (for testing
  without waiting for the cron).
- **Danger zone — reset game**: voids all non-settled bets, refunds all
  stakes, resets every user's balance to `starting_balance`, wipes
  transactions. Behind a type-to-confirm ("RESET") dialog. For
  pre-launch testing only.

New admin routes:
- `GET /api/admin/fifa/bets?match=ID` — all bets for a match (admin-only).
- `POST /api/admin/fifa/testing/create-test-match` — one-click test match.
- `POST /api/admin/fifa/testing/adjust-balance` — admin balance adjust.
- `POST /api/admin/fifa/testing/trigger-auto-void` — run the void sweep.
- `POST /api/admin/fifa/testing/reset` — full game reset (destructive).

The PB hook gains `POST /api/fifa/admin-adjust` (admin-gated, calls
`applyDelta`) and `POST /api/fifa/admin-reset` (admin-gated, resets
everything). The TanStack routes proxy to these.

### 2.7 Live scores API (multi-source)

**Problem.** No live match data — the admin manually enters everything and
users see no live scores.

**Fix.** Three-source strategy, tried in priority order, mirroring the
emrbli/worldcup project's proven approach:

1. **ESPN hidden API** (`site.api.espn.com`) — **primary** for live scores.
   No auth, real-time, rich data (scores, events, cards, lineups). Used by
   the emrbli project as its primary live source. Tried first on every poll.
2. **football-data.org** — **fallback** for delayed scores + fixtures. Free
   tier (10 req/min, WC included, scores ~30-60s delayed). Requires
   `FOOTBALL_DATA_API_TOKEN`. Stable (13 yrs), permanent free.
3. **openfootball GitHub JSON** (`openfootball/worldcup.json`) — **static
   backbone** for fixture import + final scores. Complete 104-match WC 2026
   list, no auth, no rate limits, includes ET/penalty scores. The canonical
   backbone emrbli uses. Always works — zero setup.

- New `FOOTBALL_DATA_API_TOKEN` env var (optional — only needed for source #2).
- `src/lib/fifa-live.ts` tries sources in order, caches 60s server-side,
  returns the first successful source with a `source` field for debugging.
- If **all** sources fail, returns `{ matches: [], configured: false }` and
  the UI hides the overlay gracefully.
- The public matches list and match-detail pages poll `/api/fifa/live-scores`
  every 60s and overlay live scores by matching team names case-insensitively.
- The admin settle form has an **"Auto-fill from live"** button that
  populates the 90-min result fields from the latest live-scores data.
- The admin testing console has a **"Fetch WC fixtures"** button that imports
  knockout matches (R32→final) from openfootball into PB (one-click setup).

**Why not worldcupjson.net?** It was a community favorite but is currently
down (404 as of testing). The ESPN hidden API + openfootball combo is more
reliable: ESPN is a major infrastructure, openfootball is a static GitHub
file that can't go down. football-data.org is the stable fallback with a
13-year track record.

**Why three sources?** Each has a weakness — ESPN's hidden API could get
rate-limited or schema-changed, football-data.org's free tier has delayed
scores, openfootball is static (not real-time). The fallback chain means
if any one is down, the others cover. The game works without live scores
entirely — settlement is admin-manual, so live-score accuracy isn't
load-bearing.

---

## 3. Database schema (final)

All `fifa_*` collections + the `users` extensions are created by
`scripts/migrate-game-schema.ts` (idempotent). Rules are applied by
`scripts/migrate-pb-rules.ts` (already present). Settings seeded by
`scripts/migrate-game-backfill.ts`.

### `fifa_matches`

| Field | Type | Notes |
|-------|------|-------|
| `team_home` | text (req, max 100) | |
| `team_away` | text (req, max 100) | |
| `stage` | select `qf\|sf\|third_place\|final` (req) | All knockouts. |
| `kickoff_at` | date (req) | |
| `betting_locks_at` | date | Defaults to kickoff. |
| `status` | select `upcoming\|live\|finished\|void` (req) | |
| `result_winner` | select `home\|away\|draw` | **90-minute** result. |
| `result_home_goals` | number | 90-min goals. |
| `result_away_goals` | number | 90-min goals. |
| `result_scorers` | json (string[]) | All scorers (regulation + ET). |
| `result_yellow_cards` | number | |
| `result_red_cards` | number | |
| `result_home_clean_sheet` | bool | Conceded 0 in 90 min. |
| `result_away_clean_sheet` | bool | |
| `result_advance` | select `home\|away` | **NEW.** Who advanced (knockouts). |
| `result_after_extra_time` | bool | **NEW.** Went to ET. |
| `result_after_penalties` | bool | **NEW.** Decided on pens. |
| `settled` | bool | |

### `fifa_bet_markets`

| Field | Type | Notes |
|-------|------|-------|
| `match` | relation → fifa_matches (req, cascade) | |
| `market_type` | select (req) | `match_winner`, `total_goals_ou`, `correct_score`, **`any_scorer`** (was `first_scorer`), `cards_ou`, `clean_sheet`, `custom` |
| `mode` | select `pool\|fixed` (req) | |
| `line` | number | For O/U markets. |
| `fixed_odds` | json | `{ option: odds }` for fixed mode. |
| `options` | json (string[]) | Valid selections. |
| `is_open` | bool | |
| `void` | bool | |
| `pool_total` | number | Hook-maintained. |
| `pool_by_option` | json | Hook-maintained. |

### `fifa_bets` — unchanged

### `fifa_transactions` — unchanged (`admin_adjust` type already existed)

### `fifa_settings`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `event_name` | text | "IEEE Sahrdaya WC Predict '26" | |
| `starting_balance` | number | 1000 | |
| `max_bet_percent` | number | 25 | |
| `daily_topup_threshold` | number | 100 | |
| `daily_topup_target` | number | 200 | |
| `pool_house_cut_percent` | number | 0 | |
| `raffle_tickets_base` | number | 50 | |
| `raffle_tickets_decay` | number | 2 | |
| `raffle_active_participant_min_bets` | number | **5** (was 1) | Raised. |
| `auto_void_hours` | number | **6** | **NEW.** |
| `prize` | text | "" | |
| `registration_open` | bool | true | |

### `fifa_raffle_draws`, `fifa_feed_events` — unchanged

### `users` (extended)

| Field | Type | Notes |
|-------|------|-------|
| `display_name` | text (max 40) | Unique partial index. |
| `balance` | number | Hook-only writes. |

---

## 4. Settlement logic (final)

The PB hook `POST /api/fifa/settle` and `src/lib/fifa-payout.ts` mirror each
other. Per-market-type judging:

| market_type | Selection | Win condition |
|-------------|-----------|---------------|
| `match_winner` | `home\|away\|draw` | `selection === (result_advance \|\| result_winner)`; a 90-min draw with no `result_advance` → void (knockout-only game, "draw" isn't a valid match-winner outcome) |
| `total_goals_ou` | `over\|under` | 90-min total vs `line`; exact push → void |
| `correct_score` | `"H-A"` | `selection === "{result_home_goals}-{result_away_goals}"` (90-min) |
| `any_scorer` | player name | `result_scorers.includes(selection)`; empty scorers → void |
| `cards_ou` | `over\|under` | total cards (yellow+red) vs `line`; push → void |
| `clean_sheet` | `home\|away` | home: `result_away_goals === 0`; away: `result_home_goals === 0` (90-min) |
| `custom` | any | `customWinners.includes(selection)`; no winners → void |

Payout:
- **fixed**: `stake × odds_locked`
- **pool**: `(stake / totalWinningStakes) × pool × (1 − house_cut)`
- **void**: refund `stake`
- **lost**: `0`
- **pool with no winners**: void all + refund

Idempotency: `judgeBet` preserves already-settled statuses; the settle route
only credits bets that were `pending` before this run (`wasPending` guard).
`match.settled = true` is written last — crash → re-runnable.

---

## 5. Security model (unchanged from original)

- All balance-affecting logic in PB hooks (`$app.dao`, bypasses REST rules).
- No runtime elevated token — `POCKETBASE_SUPERUSER_TOKEN` is migration-only.
- `users.balance` forbidden from client-set changes (rule + hook).
- `fifa_transactions` create/update/delete = `null` (hooks only).
- `fifa_bets` create pins `user = @request.auth.id`, forbids
  `status`/`payout`/`odds_locked` writes; update/delete = `null`.
- Admin routes (`/api/admin/fifa/*`) authenticate via `requireRole(['admin'])`
  + same-origin check + zod validation.
- Rate limiting: `fifa-bet` 30/60s, `fifa-raffle` 5/60s.

---

## 6. Acceptable risks (unchanged, small-event scale)

- **Concurrent-bet TOCTOU**: post-commit self-heal voids the loser. Fine for
  fake points at ~100 students.
- **Pool counter races**: recompute-from-live-bets (self-healing). Same
  pattern as `registeredCount`.
- **Settlement is sequential saves, not one transaction**: idempotency makes
  a crash re-runnable.
- **Raffle uses `Math.random()`** (not CSPRNG): the admin is trusted, the
  full ticket list + winning pick + audit seed are stored. Honest about the
  tradeoff in the hook comments.

---

## 7. Migration runbook

```bash
# 1. Create collections + extend users (idempotent)
bun run migrate:game-schema

# 2. Tighten API rules (idempotent)
bun run migrate:pb-rules

# 3. Apply indexes (idempotent)
bun run migrate:indexes

# 4. Seed settings + grant starting balance to existing users (idempotent)
bun run migrate:game-backfill
```

All four are safe to re-run. The schema script creates collections with
permissive rules first; the rules script tightens them. The backfill script
seeds the single `fifa_settings` row and grants `starting_balance` to any
user who doesn't have a `starting_grant` transaction yet.

---

## 8. File map (new + changed)

### New files
| File | Purpose |
|------|---------|
| `FIFA-GAME.md` | This document. |
| `scripts/migrate-game-schema.ts` | Creates the 6 `fifa_*` collections + extends `users`. Was missing from the branch. |
| `scripts/migrate-game-backfill.ts` | Seeds settings + grants starting balance. Was missing. |
| `src/routes/FIFA/rules.tsx` | Public rules page. |
| `src/routes/admin.FIFA.testing.tsx` | Admin testing console. |
| `src/routes/api/fifa/live-scores.ts` | Public live-scores proxy (football-data.org, 60s cache). |
| `src/routes/api/admin/fifa/bets.ts` | Admin: list all bets for a match. |
| `src/routes/api/admin/fifa/testing.ts` | Admin testing actions (create test match, adjust balance, trigger void, reset). |
| `src/lib/fifa-live.ts` | football-data.org client + in-memory cache. |

### Changed files
| File | Change |
|------|--------|
| `pb_hooks/fifa.pb.js` | `any_scorer` rename, `result_advance` in settle, auto-void cron, admin-adjust + admin-reset routes, leaderboard tiebreak. |
| `src/lib/fifa-payout.ts` | `any_scorer` rename, `match_winner` uses `result_advance`. |
| `src/schemas/fifa.ts` | `any_scorer` rename, `result_advance`/`result_after_*` fields, `auto_void_hours`, `min_bets=5` default. |
| `tests/unit/lib/fifa-payout.test.ts` | `any_scorer` rename, knockout `result_advance` tests. |
| `src/routes/api/admin/fifa/settle.ts` | Forward `result_advance`/`result_after_*` to PB. |
| `src/routes/api/admin/fifa/matches.ts` | Include new fields in response. |
| `src/routes/api/fifa/matches.ts` | Include new fields in public response. |
| `src/routes/FIFA/index.tsx` | Link to rules, "anytime scorer" wording. |
| `src/routes/FIFA/matches.$id.tsx` | Knockout notice, pool/fixed explainer, 25% cap, correct-score hint, live score overlay. |
| `src/routes/FIFA/matches.tsx` | Live score overlay on cards. |
| `src/routes/FIFA/leaderboard.tsx` | Raffle formula + min-bets info. |
| `src/features/fifa/fifa-layout.tsx` | Add Rules nav link. |
| `src/routes/admin.FIFA.matches.$id.tsx` | Settle form: `result_advance`, 90-min label, knockout info, auto-fill-from-live. |
| `src/components/admin/admin-sidebar.tsx` | Add testing console link. |
| `src/routes/api/admin/fifa/settings.ts` | Include `auto_void_hours`. |
| `src/routes/admin.FIFA.settings.tsx` | `auto_void_hours` field, min-bets label. |
| `.env.example` | `FOOTBALL_DATA_API_TOKEN`. |
| `AGENTS.md` | Sync FIFA section with this doc. |