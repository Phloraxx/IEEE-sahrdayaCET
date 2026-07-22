# WC Predict '26

WC Predict '26 is a free-to-enter prediction game layered on the IEEE Sahrdaya site. It uses fake points only; no entry fee, wallet deposit, withdrawal, or real-money stake exists.

## Product model

A player signs in with the site's PocketBase OAuth account and receives a points balance. Players place point bets on configured World Cup markets. Correct predictions receive points according to pool/fixed-odds settlement. Leaderboard participation feeds the sponsor-prize raffle rules configured by admins.

## Collections

| Collection | Purpose |
| --- | --- |
| `users` | application identity plus `display_name` and fake-point `balance` |
| `fifa_matches` | teams, stage, kickoff/lock, result, settled state |
| `fifa_bet_markets` | market type/mode/options/odds and denormalized pool totals |
| `fifa_bets` | immutable placement snapshot and eventual outcome/payout |
| `fifa_transactions` | append-style points ledger |
| `fifa_settings` | singleton game/raffle/top-up configuration |
| `fifa_feed_events` | retired legacy rows; all API rules locked |

The schema is defined in `pb_migrations/202607200000_baseline_schema.js`; there is no separate game-schema script.

## Market types

Current market types:

- `match_winner`
- `total_goals_ou`
- `correct_score`
- `any_scorer`
- `cards_ou`
- `clean_sheet`
- `custom`

Markets may be `pool` or `fixed` mode. The bet stores its mode and locked fixed odds at placement so later market edits cannot rewrite the historical price.

## Bet placement

Clients cannot create `fifa_bets` records directly. They call:

```text
POST /api/fifa/bets
```

PocketBase performs one transaction:

1. require an authenticated user;
2. verify game registration is open;
3. verify match/market relation and open state;
4. reject bets after the lock/kickoff time;
5. validate selection and fixed odds;
6. re-read user balance inside the transaction;
7. enforce positive integer stake and `max_bet_percent`;
8. create the bet;
9. debit user balance;
10. append `bet_placed` ledger row;
11. recompute the market pool.

A rejected bet changes none of these records.

## Settlement

There is exactly one payout engine:

```text
POST /api/fifa/settle
```

It is admin-only and transactional. It calculates each pending bet outcome, credits payouts/refunds, appends ledger rows, updates bets/markets, records the result, and marks the match settled in one commit.

Settlement is idempotent. Calling it again on a settled match returns an already-settled response and cannot pay a second time.

### Match winner

For knockout matches, `result_advance` is the authoritative winning side when supplied. Otherwise the normal `result_winner` is used.

### Pool markets

The distributable pool is allocated proportionally to winning stakes, after the configured house-cut percentage. If no bet can win the pool under the recorded result, pending stakes are refunded rather than stranded.

### Fixed markets

A winning fixed bet pays `stake × odds_locked`, rounded to integer points.

## Voiding

Changing a market or match into a financial void is not ordinary CRUD.

Direct `void=true` market updates and direct match status changes to `void` are rejected. Admins use:

```text
POST /api/fifa/markets/:id/void
POST /api/fifa/matches/:id/void
```

The transaction refunds pending bets, credits balances, appends `bet_refund` ledger rows, marks bets void, closes markets, and clears pool totals. Repeating the command does not refund twice.

There is no background financial auto-void process.

## Live scores

```text
GET /api/fifa/live-scores
```

is a display-only PocketBase server route. It tries ESPN first, optionally football-data.org, and uses OpenFootball as a static fallback. Its results do not move points or settle bets.

This separation is intentional: an upstream sports-data error cannot directly issue payouts.

## Daily top-up

The daily top-up job may credit users below the configured threshold. Each balance change and its ledger row are committed together.

There is no production balance-adjustment or game-reset console. Disposable environments should use disposable PocketBase data instead of mutating production economy state for testing.

## Raffle

The raffle route is admin-only. Eligibility/ranking is based on the game settings and leaderboard state. The selected result and entry snapshot are persisted on the singleton settings record so the draw is auditable.

## Frontend routes

Public:

- `/FIFA`
- `/FIFA/matches`
- `/FIFA/matches/:id`
- `/FIFA/leaderboard`
- `/FIFA/rules`

Signed-in:

- `/FIFA/dashboard`

Admin:

- `/admin/FIFA/matches`
- `/admin/FIFA/matches/:id`
- `/admin/FIFA/settings`
- `/admin/FIFA/raffle`

Admin pages use the PocketBase SDK directly for ordinary CRUD and the custom commands above for financial state transitions.

## Testing contract

`tests/backend/pocketbase_smoke.py` boots against a fresh migrated PocketBase and covers the critical game invariants:

- bet placement debits once;
- oversized bet rejection leaves state unchanged;
- settlement pays once and is idempotent;
- direct market void is rejected;
- market void refunds once;
- role/registration/coupon operations coexist correctly on the same fresh schema.

Unit tests in `tests/unit/lib/fifa-*.test.ts` cover pure payout/result/filter/label helpers. Browser tests cover the public FIFA pages and unauthenticated admin guard behavior.
