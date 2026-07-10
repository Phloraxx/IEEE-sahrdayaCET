# FIFA WC Predict — Automation Plan (KISS)

> College IEEE event · fake points · **ESPN → PocketBase → browser**  
> Status: **design approved / not implemented**  
> Companion: `FIFA-GAME.md` (rules), `AGENTS.md` (stack)

This replaces the earlier 10k / Redis / multi-collection design.  
**Do not implement that architecture.**

---

## Goals

| Goal | Approach |
|------|----------|
| Fixture import | openfootball once (admin / deploy) |
| Live status + scores | Server polls ESPN → writes `fifa_matches` |
| Settlement | Delay + kill switch → **existing** settle in `fifa.pb.js` |
| Cancel / postpone | Provider status → void markets (no auto-void cron) |
| Realtime for users | PocketBase SSE (already have) — not football WebSockets |

### Non-goals

- Redis, BullMQ, dedicated workers, SSE gateways  
- Multi-source confidence scoring  
- New snapshot / team_map / player_map / ingest collections  
- Social feed / chat  
- Free forever paid-API trial as production foundation  
- Real money

---

## Truth model

```
ESPN scoreboard     = football truth (status, score)     [default free]
PocketBase          = game truth (matches, bets, balances)
Browser             = only PocketBase (REST + PB SSE)
```

```
openfootball ──► import fixtures (once)
ESPN REST    ──► cron ~2 min ──► patch fifa_matches
                                      │
                     kickoff → close markets
                     finished + delay → existing settle()
                     cancelled → void markets
                                      │
Browser ◄── PocketBase SSE (matches, markets)
```

Money authority stays in **`pb_hooks/fifa.pb.js`**. Automation only fills results and calls the same settle path.

---

## Collections

### Keep (5)

| Collection | Role |
|------------|------|
| `fifa_matches` | Schedule, status, results |
| `fifa_bet_markets` | Pools / open / void per market |
| `fifa_bets` | Predictions (selection, stake, won/lost) |
| `fifa_transactions` | Balance ledger (not the same as bets) |
| `fifa_settings` | Knobs + **one-time raffle result** |

### Drop / stop using

| Thing | Why |
|-------|-----|
| `fifa_feed_events` | No social |
| `fifa_raffle_draws` | One end-of-WC draw → store on settings |
| Auto-void cron | Auto-settle + cancel→void + admin void |
| New audit/map/snapshot tables | Never |

### Bets vs transactions

- **Bet** = prediction ticket  
- **Transaction** = bank line (grant, −stake, +payout, top-up, admin)  

Both stay. Not duplicates.

### Raffle (one-time, on settings)

Fields on `fifa_settings`:

- `raffle_drawn_at`  
- `raffle_winner`  
- `raffle_seed`  
- `raffle_entries_snapshot` (json)  

Admin runs raffle once → writes settings. No collection for one row.

### Schema field adds only

**`fifa_matches`**

| Field | Type | Purpose |
|-------|------|---------|
| `external_ids` | json | e.g. `{ "espn": "760510" }` |
| `auto_settle_at` | date | When delay expires (optional) |

**`fifa_settings`**

| Field | Default | Purpose |
|-------|---------|---------|
| `auto_settle_enabled` | `false` | Global kill switch |
| `settle_delay_minutes` | `15` | Hold after FT before settle |
| raffle_* fields | — | One-time draw result |

---

## Default markets (4)

Auto-create and auto-settle:

1. `match_winner` (who advances)  
2. `total_goals_ou`  
3. `correct_score` (90-min)  
4. `clean_sheet`  

Do **not** default-create `any_scorer` / `cards_ou` (hard free data). Keep schema if admin wants them later; settle those manually.

---

## Providers

| Job | Source | Cost |
|-----|--------|------|
| Fixtures | openfootball `2026/worldcup.json` | Free |
| Live status + scores (**default**) | ESPN `site.api.espn.com/.../soccer/fifa.world/scoreboard` | Free, unofficial |
| Fallback | football-data.org (optional token) | Free, 10 req/min |
| Paid if ESPN fails | API-Football Pro ~$19/mo | Optional |
| Paid alt / eval only | iSports ~$49/mo | Optional |

**Rules:** one primary + delay + kill switch + admin override. No multi-source consensus.

### iSports free trial (checked Jul 2026)

| Fact | Detail |
|------|--------|
| Trial | **15 days**, no credit card, no auto-bill |
| Quota | **200 calls/day** per sport |
| Live delay (trial) | ~**2 minutes** |
| After trial | Key deactivates until paid |
| Protocol | REST only — **no WebSocket** |

Does **not** replace free ESPN as foundation. Continuous 2-min poll (~720/day) exceeds trial quota; smart poll near match windows is fine for **evaluation**.  
If paid SLA needed later: swap provider behind one client module — **same architecture**.

---

## Lifecycle (one cron)

Prefer PB `cronAdd` + `$http.send` (or TanStack interval → same logic).

Every ~2 min (or only when a match is within ±2h of kickoff):

1. Fetch ESPN scoreboard (one request).  
2. Map to `fifa_matches` via `external_ids.espn` or team-name normalize.  
3. Status: upcoming / live (close markets) / finished (fill `result_*`, set `auto_settle_at`).  
4. Cancelled / postponed → match void + void markets (existing refund cascade).  
5. If `auto_settle_enabled` and delay elapsed and fields complete → existing settle.  
6. Knockout 90-min draw without `result_advance` → **do not** auto-settle; admin fills advance.

**Keep:** `fifa-daily-topup`  
**Remove:** `fifa-auto-void`

---

## Client realtime

- Match score/status + pools → **PocketBase SSE** (`use-pb-subscription`)  
- Leaderboard → poll 30–60s (campus scale; no Redis)  
- **Never** browser → ESPN / iSports / API-Football  

---

## Implementation (2 PRs)

### PR1 — Slim surface

- Schema field adds (matches + settings raffle fields)  
- Raffle admin writes settings; stop using `fifa_raffle_draws`  
- Stop feed writes; hide/remove feed UI  
- Remove auto-void cron  
- Fixture import: upsert + ESPN id + 4 markets  
- Team name normalize helper in code  

### PR2 — Lifecycle + auto-settle

- `syncFromEspn()` (+ optional free fallbacks)  
- Cron every ~2 min  
- Delay + kill switch → existing settle  
- Cancelled → void  
- Settings UI toggles  
- Tests: delay, kill switch, missing advance, cancel void, settle idempotency  

### Critical files

| File | Role |
|------|------|
| `src/lib/fifa-live.ts` | Provider clients |
| `pb_hooks/fifa.pb.js` | Lifecycle cron; drop auto-void; settle reuse; raffle→settings |
| `scripts/migrate-game-schema.ts` | Fields only |
| `src/routes/api/admin/fifa/*` | Import, settings, raffle |
| `src/routes/FIFA/feed.tsx`, feed marquee | Remove from product |

**Unchanged money core:** `fifa-payout.ts`, bet hooks, transactions, settle body.

---

## Verification

1. Import knockouts → 4 markets each; re-import no dupes  
2. Status tracks ESPN without admin  
3. Kickoff closes markets  
4. Auto-settle off → results fill, balances unchanged  
5. Auto-settle on + delay → ledger correct  
6. Kill switch stops money  
7. Cancelled → stakes refunded  
8. Manual settle still works if ESPN fails  
9. One raffle write on settings; no feed required  

---

## Success checklist

- [ ] 5 collections (matches, markets, bets, transactions, settings)  
- [ ] ESPN → PB → browser (PB SSE)  
- [ ] No Redis / workers / new services  
- [ ] No feed, no `fifa_raffle_draws`, no auto-void cron  
- [ ] Auto-settle with delay + kill switch  
- [ ] Cancel handled from provider status  

---

*Last updated: 2026-07-10 — KISS rewrite; supersedes Redis/10k design.*
