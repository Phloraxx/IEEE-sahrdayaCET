# FIFA WC Predict — Full Automation Architecture

> Target scale: **10,000+ students**  
> Status: **Design / not implemented**  
> Companion docs: `FIFA-GAME.md` (game rules), `AGENTS.md` (current stack)

This document specifies how to evolve the FIFA prediction game from a
**manual-admin + client-polled** model to a **fully automated sports-data
pipeline** with conservative auto-settlement, realtime at scale, and
operational safety nets.

---

## 1. Executive summary

### Goals

| Goal | Description |
|------|-------------|
| **Fixture automation** | Discover, import, and update WC matches without admin clicks |
| **Live automation** | `upcoming → live → finished` driven by provider data |
| **Event automation** | Goals, cards, scorers, ET/penalties ingested server-side |
| **Settlement automation** | Staged, confidence-gated settlement using existing payout logic |
| **Realtime at scale** | 10k concurrent users without client-driven API polling |
| **Auditability** | Every auto-action traceable to provider snapshots |

### Non-goals

- Real-money betting or payment integration
- In-match micro-bets (v2+)
- Replacing `fifa-payout.ts` / `pb_hooks/fifa.pb.js` money logic

### Core principle

> **Automate ingestion and state transitions aggressively.**  
> **Automate settlement conservatively** (multi-source consensus, delay, audit).  
> **Keep PocketBase hooks as the money authority.**

---

## 2. Current state vs target

| Capability | Today | Target |
|------------|-------|--------|
| Fixtures | Manual import / testing console | Daily sync from providers |
| Live scores | Client poll `/api/fifa/live-scores` (60s cache) | Single worker ingests → Redis → SSE |
| Match events | Not ingested | API-Football events + ESPN summary |
| Status transitions | Admin manual | Cron/worker on provider status |
| Settlement | Admin button | Staged auto-settle with hold + dispute |
| Leaderboard | Poll every 15s per client | Materialized Redis ZSET, push every 5s |
| Rate limits | In-memory, single instance | Redis token bucket |
| Bet peak (~10k) | Direct PB writes + TOCTOU heal | Queue + tuned SQLite or Postgres path |

### What we keep

- `src/lib/fifa-payout.ts` — pure judgment + payout math (unit-tested)
- `pb_hooks/fifa.pb.js` — balance, ledger, settlement, raffle, crons
- `fifa_transactions` hook-only ledger
- Idempotent settlement semantics
- Fake points / college OAuth / raffle transparency model

### What we replace

- Browser-driven football API polling
- Manual match creation as the default path
- Manual settlement as the default path
- In-memory rate limiting at scale
- Per-client leaderboard polling against PocketBase

---

## 3. External data providers

### 3.1 Provider roles (recommended stack)

| Role | Provider | Why |
|------|----------|-----|
| **Settlement primary** | [API-Football](https://www.api-football.com/) (api-sports) | Documented `/fixtures`, `/fixtures/events`, `/fixtures/statistics`; used widely in production |
| **Live display backup** | ESPN hidden API | Fast scoreboard + rich `summary?event={id}` play-by-play |
| **Fixture backbone** | openfootball GitHub JSON | Complete WC 2026 list, ET/pens in static JSON, no rate limits |
| **Consensus verifier** | football-data.org (paid tier) or second API-Football poll | Cross-check scores before money moves |

### 3.2 What each source provides (verified Jul 2026)

#### ESPN (`site.api.espn.com`)

| Endpoint | Data |
|----------|------|
| `GET /apis/site/v2/sports/soccer/fifa.world/scoreboard` | Event IDs, teams, live score, minute, status (`pre`/`in`/`post`), `playByPlayAvailable` |
| `GET /apis/site/v2/sports/soccer/fifa.world/summary?event={id}` | Boxscore, play-by-play, `homeTeamAdvance`/`awayTeamAdvance`, shootout scores, team stats |

**Pros:** Free, real-time, rich knockout metadata (advance, pens).  
**Cons:** Unofficial, no SLA, schema can change, not licensed for commercial settlement.

**Use for:** Live UI overlay, consensus cross-check, advance/pens confirmation.  
**Do not use as:** Sole settlement source.

#### football-data.org

| Endpoint | Data (free tier) |
|----------|------------------|
| `GET /v4/competitions/WC/matches` | Fixtures, delayed scores, status, stage |

**Pros:** Stable 13+ year API, WC included.  
**Cons:** Free tier **10 req/min**; delayed ~30–60s; limited events on free.

**Use for:** Fallback verification (paid tier for production).  
**Do not use for:** Client polling at 10k scale.

#### openfootball

| Source | Data |
|--------|------|
| `worldcup.json/2026/worldcup.json` | All 104 matches, FT/ET/pens scores when played |

**Pros:** No auth, no limits, complete fixture list.  
**Cons:** Static only — no live minute or events.

**Use for:** Fixture import backbone, historical result verification.

#### API-Football (recommended primary for automation)

Typical endpoints (v3):

| Endpoint | Purpose |
|----------|---------|
| `GET /fixtures?league={id}&season=2026` | Full fixture list |
| `GET /fixtures?id={id}` | Live status, score by period (1H, 2H, ET, PEN) |
| `GET /fixtures/events?id={id}` | Goals, cards, subs with player names + minute |
| `GET /fixtures/statistics?id={id}` | Team stats (cards, shots, etc.) |
| `GET /fixtures/lineups?id={id}` | Lineups for player-name mapping |

**Pros:** Designed for this use case; clear rate limits per plan.  
**Cons:** Paid for production volume (~$20–80/mo realistic for WC month).

### 3.3 Provider anti-patterns (industry)

1. **Never let browsers poll football APIs** — rate limits, key exposure, DDoS your own quota.
2. **Never settle on a single source instantly** — VAR corrections, scorer changes, advance lag.
3. **Never use unofficial APIs as sole settlement truth** — ESPN can break without notice.
4. **Separate display latency from settlement latency** — UI can be 15s; money waits 15–30 min.

---

## 4. Target system architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL PROVIDERS                          │
│  API-Football (primary) │ ESPN │ openfootball │ football-data  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              fifa-ingest WORKER (dedicated process)              │
│  • fixture-sync cron (daily)                                     │
│  • live-match poller (15–30s, only during tournament)          │
│  • normalizer + team/player alias resolver                       │
│  • confidence scorer                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ enqueue
┌────────────────────────────▼────────────────────────────────────┐
│                    JOB QUEUE (Redis + BullMQ)                    │
│  status-transition │ snapshot-write │ settle-match               │
│  leaderboard-rebuild │ feed-fanout                               │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
┌────────────▼──────────────┐   ┌────────────▼────────────────────┐
│   POCKETBASE + HOOKS      │   │   REDIS (read models + pub/sub)  │
│   fifa.pb.js money engine │   │   live scores, pools, leaderboard│
│   SQLite (short-term)     │   │   rate limit buckets             │
└────────────┬──────────────┘   └────────────┬────────────────────┘
             │                               │
┌────────────▼───────────────────────────────▼────────────────────┐
│              SSE / WebSocket GATEWAY (TanStack or sidecar)         │
│              10k clients subscribe — no football API polling       │
└───────────────────────────────────────────────────────────────────┘
```

### Infrastructure additions required

| Component | Purpose | Required for 10k? |
|-----------|---------|-------------------|
| **Redis** | Pub/sub, leaderboard ZSET, rate limits, job queue | **Yes** |
| **fifa-ingest worker** | Poll providers, enqueue jobs | **Yes** |
| **SSE gateway** | Fanout live data to clients | **Yes** |
| Postgres PocketBase | Write contention on bet peaks | **Recommended** if peak > 5 bets/s sustained |

---

## 5. Automation pipelines

### 5.1 Fixture sync (daily + on deploy)

**Trigger:** Cron `0 3 * * *` UTC + manual admin "Sync fixtures".

**Flow:**

1. Fetch knockout fixtures from openfootball + API-Football.
2. Upsert `fifa_matches`:
   - `team_home`, `team_away`, `kickoff_at`, `stage`
   - `betting_locks_at` = `kickoff_at` (unless overridden)
   - `external_ids` = `{ "api_football": N, "espn": "760510" }`
3. Resolve team identity via `fifa_provider_team_map` (aliases, ISO codes).
4. Auto-create 6 standard markets per new match (same as testing console).
5. Log sync run to `fifa_ingest_runs` (new admin visibility).

**Idempotency:** Upsert by `(kickoff_at, team_home, team_away)` or `external_ids`.

### 5.2 Match lifecycle (every 30s during tournament)

**Trigger:** Worker polls only matches in `upcoming | live` window (±24h).

| Condition | Action |
|-----------|--------|
| `now >= kickoff_at - 5min` && status `upcoming` | Set `live`; close all markets (`is_open=false`) |
| Provider `IN_PLAY` / ESPN `state=in` | Confirm `live` |
| Provider `FINISHED` / ESPN `state=post` + clock complete | Set `finished` |
| Provider `POSTPONED` / `CANCELLED` | Set `void` → existing market-void cascade |

**Betting lock:** Enforced in `fifa.pb.js` on create (already) **and** on status transition (close markets in same transaction).

### 5.3 Result snapshot ingestion (every 30s per live/finished match)

**Trigger:** For each match with status `live | finished` and unsettled bets.

**Flow:**

1. Fetch API-Football fixture + events + statistics.
2. Fetch ESPN `summary?event={espn_id}` if mapped.
3. Normalize to canonical `MatchResult` (see §6).
4. Append row to `fifa_match_snapshots` (never overwrite).
5. Compute `confidence` score (see §7).
6. Update `fifa_matches.last_snapshot_id`.
7. If confidence threshold met → enqueue staged settlement jobs.

### 5.4 Staged automatic settlement

**Do not settle all markets at once.** Knockout football has different clocks for different markets (see `FIFA-GAME.md` §2.1).

| Stage | Delay after signal | Markets settled |
|-------|-------------------|-----------------|
| **FT** | 90-min score stable 10 min | `correct_score`, `total_goals_ou`, `clean_sheet` |
| **ET** | ET complete or confirmed none | `any_scorer` (if events feed stable) |
| **ADVANCE** | Advance + pens confirmed 15 min | `match_winner` |
| **STATS** | Stats finalized 30 min | `cards_ou` |
| **CUSTOM** | Admin marks winners | `custom` (never auto) |

Each stage:

1. Enqueue `settle-match` job with `{ matchId, stage, snapshotId, idempotency_key }`.
2. Worker calls existing `POST /api/fifa/settle` logic (or internal hook path) with snapshot payload.
3. Write `fifa_settlement_runs` audit row.
4. Enqueue `leaderboard-rebuild`.

**Idempotency key:** `{matchId}:{stage}:{snapshotHash}` — safe to retry.

### 5.5 Realtime fanout (replace client polling)

| Data | Source | Fanout |
|------|--------|--------|
| Live scores | Redis `fifa:live:{matchId}` | SSE topic `live-scores` |
| Pool totals | Redis `fifa:pool:{marketId}` + PB hook writes | SSE topic `pools` (keep PB hook as writer) |
| Feed events | PB `fifa_feed_events` insert | Redis pub/sub → SSE |
| Leaderboard | Redis ZSET `fifa:leaderboard` | SSE topic `leaderboard` every 5s |

**Client rule:** Browsers only connect to **our** SSE gateway. Zero direct football API calls.

#### Load math (why this matters)

- 10k users × leaderboard poll every 15s = **~666 req/s** to PocketBase → not viable.
- 10k SSE connections × 1 push every 5s = **2k msg/s** from one Redis pub/sub → viable with a proper gateway.

---

## 6. Canonical MatchResult schema

Normalized snapshot stored in `fifa_match_snapshots.payload`:

```ts
interface MatchResultSnapshot {
  // 90-minute result
  result_home_goals: number
  result_away_goals: number
  result_winner: 'home' | 'away' | 'draw' | ''

  // Knockout advance (ET/pens)
  result_advance: 'home' | 'away' | ''
  result_after_extra_time: boolean
  result_after_penalties: boolean

  // Player markets
  result_scorers: string[]        // mapped to fifa_player_map display names
  result_yellow_cards: number
  result_red_cards: number
  result_home_clean_sheet: boolean
  result_away_clean_sheet: boolean

  // Provider audit
  sources: {
    api_football?: { fixture_id: number; fetched_at: string; raw_hash: string }
    espn?: { event_id: string; fetched_at: string; raw_hash: string }
  }
  confidence: number            // 0.0 – 1.0
  provider_status: string         // e.g. FT, AET, PEN
}
```

Mapping rules:

| Field | Source priority |
|-------|-----------------|
| 90-min goals | API-Football `score.fulltime` > ESPN regulation score |
| Advance | ESPN `homeTeamAdvance` / API-Football winner after pens |
| Scorers | API-Football events type `Goal` → `fifa_player_map` |
| Cards | API-Football events type `Card` or statistics endpoint |

---

## 7. Confidence gating (before money moves)

| Level | Conditions | Action |
|-------|------------|--------|
| **0.0 – 0.4** | Single source or sources disagree | UI update only; alert ops channel |
| **0.5 – 0.7** | Two sources agree on 90-min score; status FINAL < 5 min | Hold settlement; continue polling |
| **0.8 – 0.9** | Two sources agree; FINAL > 15 min; events stable | Queue staged settlement |
| **1.0** | Three sources agree + advance confirmed on knockouts | Fast-track settlement (still respect stage delays) |

**Blocked conditions (never auto-settle):**

- Knockout 90-min draw without `result_advance`
- Scorer name unmapped (anytime scorer market open with pending bets)
- Source score mismatch > 0 goals
- `fifa_settings.auto_settle_enabled = false`
- `fifa_matches.auto_settle_state = frozen | disputed`

**Dispute window:** Default `settle_delay_minutes = 15` after confidence threshold. Admin can extend per match.

---

## 8. New / extended database schema

### 8.1 Extend `fifa_matches`

| Field | Type | Purpose |
|-------|------|---------|
| `external_ids` | json | `{ api_football, espn, football_data }` |
| `auto_settle_state` | select | `disabled \| watching \| held \| settling \| settled \| disputed \| frozen` |
| `last_snapshot_id` | relation → `fifa_match_snapshots` | Pointer to latest ingest |
| `provider_status` | text | Raw provider status string (FT, AET, PEN) |

### 8.2 New `fifa_match_snapshots`

| Field | Type | Purpose |
|-------|------|---------|
| `match` | relation | → `fifa_matches` |
| `captured_at` | date | When ingested |
| `source_primary` | text | `api-football` / `espn` / `consensus` |
| `confidence` | number | 0.0 – 1.0 |
| `payload` | json | `MatchResultSnapshot` |
| `raw_api_football` | json | Optional raw for audit (truncate large) |
| `raw_espn` | json | Optional raw for audit |

**Rule:** Append-only. Never update — new row per poll when data changes.

### 8.3 New `fifa_provider_team_map`

| Field | Type | Purpose |
|-------|------|---------|
| `canonical_name` | text | Our `team_home`/`team_away` string |
| `api_football_id` | number | Provider team ID |
| `espn_id` | text | ESPN team ID |
| `aliases` | json | `["FRA", "France", "Les Bleus"]` |

### 8.4 New `fifa_player_map`

| Field | Type | Purpose |
|-------|------|---------|
| `display_name` | text | Name shown in market options |
| `api_football_id` | number | |
| `espn_id` | text | |
| `aliases` | json | `["K. Mbappé", "Mbappe", "Kylian Mbappé"]` |

### 8.5 New `fifa_settlement_runs`

| Field | Type | Purpose |
|-------|------|---------|
| `match` | relation | |
| `stage` | text | `FT \| ET \| ADVANCE \| STATS` |
| `snapshot` | relation | → `fifa_match_snapshots` |
| `idempotency_key` | text | **unique** |
| `status` | select | `queued \| running \| completed \| failed` |
| `bets_affected` | number | |
| `started_at` | date | |
| `completed_at` | date | |
| `error` | text | |

### 8.6 New `fifa_ingest_runs`

| Field | Type | Purpose |
|-------|------|---------|
| `type` | select | `fixture_sync \| live_poll \| settle` |
| `status` | select | `ok \| partial \| failed` |
| `matches_processed` | number | |
| `errors` | json | |
| `ran_at` | date | |

### 8.7 Extend `fifa_settings`

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `auto_settle_enabled` | bool | `false` | Master switch |
| `settle_delay_minutes` | number | `15` | Hold after confidence threshold |
| `confidence_threshold` | number | `0.8` | Min confidence to queue settle |
| `ingest_poll_interval_sec` | number | `30` | Live poll frequency |
| `provider_primary` | text | `api-football` | |

---

## 9. Redis key schema

| Key | Type | TTL | Content |
|-----|------|-----|---------|
| `fifa:live:{matchId}` | HASH | 120s | score, minute, status, updated_at |
| `fifa:pool:{marketId}` | HASH | none | pool_total, pool_by_option JSON |
| `fifa:leaderboard` | ZSET | none | userId → balance (score), tiebreak in separate HASH |
| `fifa:leaderboard:meta` | HASH | none | bets_count per userId |
| `fifa:ratelimit:{key}` | STRING | window | token bucket state |
| `fifa:sse:version` | STRING | none | monotonic counter for cache bust |

Pub/sub channels:

- `fifa:pub:live`
- `fifa:pub:pools`
- `fifa:pub:feed`
- `fifa:pub:leaderboard`

---

## 10. Worker cron schedule

| Job | Schedule | Active |
|-----|----------|--------|
| `fixture-sync` | `0 3 * * *` UTC | Tournament window |
| `live-poll` | every 30s | When any match in ±24h window |
| `status-transition` | every 30s | Same window |
| `snapshot-ingest` | every 30s | `live \| finished` matches |
| `settlement-queue` | every 60s | Matches past confidence + delay |
| `leaderboard-rebuild` | every 5s | Tournament window |
| `daily-topup` | `0 9 * * *` | Existing — keep in PB hook |
| `auto-void` | `*/30 * * * *` | Existing — keep as safety net |

---

## 11. Scale analysis (10k students)

### Assumptions

- 10,000 registered players
- ~3,000 concurrent during a marquee match
- ~10–20% place bets in the 10 minutes before kickoff
- ~500–1,500 bets in a 10-minute pre-kickoff window
- Peak **~2–5 bets/second**

### Bottlenecks in current architecture

| Component | Risk at 10k | Mitigation |
|-----------|-------------|------------|
| PocketBase SQLite writes | Bet peak contention | Redis queue serializes balance writes OR migrate to Postgres PB |
| TOCTOU self-heal | More races | Acceptable short-term; add optimistic locking later |
| Client live-score poll | API quota + server CPU | **Eliminate** — worker-only ingest |
| Leaderboard poll 15s | ~666 req/s | **Redis materialized view** |
| In-memory rate limit | Broken multi-replica | **Redis rate limit** |
| PB SSE 10k connections | Connection limits | Dedicated SSE gateway |
| Sequential settlement | Minutes for 50k bets | Batch per market; parallel markets |

### Target SLOs

| Metric | Target |
|--------|--------|
| Live score propagation | < 30s from real world |
| Pool bar update after bet | < 2s |
| Leaderboard freshness | < 5s |
| Auto-settlement after FT | 15–30 min (configurable) |
| Bet placement p99 | < 500ms |
| Uptime during match day | 99.9% |

---

## 12. Security & operations

### API keys

| Secret | Storage | Access |
|--------|---------|--------|
| `API_FOOTBALL_KEY` | Server env only | fifa-ingest worker |
| `FOOTBALL_DATA_API_TOKEN` | Server env only | fifa-ingest worker (fallback) |
| ESPN | No key | Worker only, rate-limited |

Never expose provider keys to the browser or TanStack client bundle.

### Alerting (required for auto-settle)

| Alert | Channel |
|-------|---------|
| Confidence < 0.5 on finished match with open bets | Slack / email |
| Source score mismatch | Slack / email |
| Settlement job failed | Slack / email + PagerDuty |
| Provider poll failure > 5 min | Slack |
| Unmapped scorer blocking settlement | Admin dashboard banner |

### Admin controls (always available)

- `freeze_settlement` per match
- `force_settle` with manual override (existing admin form)
- `void_match` (existing cascade)
- `auto_settle_enabled` global kill switch
- Provider health dashboard (`/admin/FIFA/ingest`)

### Rollback

- Settlement is idempotent — re-run safe.
- To reverse a bad auto-settlement: **v2 feature** — requires compensating ledger entries (not in v1; prefer freeze + manual fix before settle).

---

## 13. Implementation plan (PR stack)

### PR-A1 — Schema + provider clients (foundation)

- Migration: new collections + `fifa_matches` extensions
- `src/lib/fifa-providers/` — API-Football, ESPN summary, openfootball clients
- `fifa_provider_team_map` seed for WC teams
- Unit tests: normalizers with fixture JSON fixtures

### PR-A2 — `fifa-ingest` worker

- New package or `scripts/fifa-ingest/` long-running process
- `fixture-sync` job
- `live-poll` job → writes Redis + snapshots
- Docker Compose service + env docs
- Admin: `/admin/FIFA/ingest` health page

### PR-A3 — Auto lifecycle

- `status-transition` job
- Auto-close markets at kickoff
- Remove client responsibility for football API fetch (display reads Redis)

### PR-A4 — Confidence + staged settlement

- Confidence scorer
- `settle-match` queue jobs calling existing hook settle path
- `fifa_settlement_runs` audit
- `auto_settle_enabled` settings UI
- Alerting hooks

### PR-A5 — Realtime scale layer

- Redis deployment
- SSE gateway (extend existing `/pb` proxy pattern or new `/fifa/stream`)
- Materialized leaderboard
- Distributed rate limits (`lib/rate-limit.ts` → Redis backend)

### PR-A6 — Load test + hardening

- k6 or Artillery: 10k SSE connections, 2000 bets in 10 min
- Tune PB or plan Postgres migration
- Runbook for match day

---

## 14. Environment variables (new)

```env
# Provider keys (server-only, fifa-ingest worker)
API_FOOTBALL_KEY=
FOOTBALL_DATA_API_TOKEN=          # optional fallback

# Redis
REDIS_URL=redis://redis:6379

# Automation toggles (can also live in fifa_settings)
FIFA_AUTO_SETTLE_ENABLED=false
FIFA_SETTLE_DELAY_MINUTES=15
FIFA_INGEST_POLL_INTERVAL_SEC=30

# Alerting
FIFA_ALERT_WEBHOOK_URL=           # Slack incoming webhook
```

---

## 15. Open decisions

| # | Question | Recommendation | Owner |
|---|----------|----------------|-------|
| 1 | API-Football budget? | Pro tier ~$20–80 for WC month | Product/ops |
| 2 | Auto-settle delay? | 15 min minimum after FT | Product |
| 3 | Dispute/reversal policy? | Freeze before settle; no auto-reversal v1 | Product |
| 4 | 10k = one college or multi-campus? | Affects auth + infra sizing | Product |
| 5 | Redis + worker in Docker Compose? | Required — add to `docker-compose.yml` | Ops |
| 6 | PocketBase Postgres vs SQLite? | Postgres if load test shows write contention | Ops |
| 7 | Custom markets auto-settle? | Never — admin only | Product |

---

## 16. Relationship to existing docs

| Doc | Role |
|-----|------|
| `FIFA-GAME.md` | Game rules, market semantics, knockout modeling — **unchanged** |
| `AGENTS.md` | Update after PR-A1+ with new collections, worker, Redis |
| `scripts/migrate-game-schema.ts` | Extend with §8 schema |
| `src/lib/fifa-live.ts` | Deprecate client-facing fetch; move logic to `fifa-providers/` |
| `pb_hooks/fifa.pb.js` | Keep as money engine; add `settle-from-snapshot` internal route optional |

---

## 17. Success criteria

Automation is **done** when:

1. Admin can deploy with **zero manual match creation** for a full knockout bracket.
2. Match status transitions happen **without admin** for 95%+ of matches.
3. 90-min markets settle **automatically** within 30 min of FT for 95%+ of matches.
4. Advance markets settle **automatically** within 45 min of final whistle for 95%+ of knockouts.
5. 10k simulated users: leaderboard + pools update via SSE, p99 bet < 500ms.
6. Every auto-settlement has a **snapshot + settlement_run** audit trail.
7. Admin kill switch stops all money-moving automation in < 1 second.

---

*Last updated: 2026-07-09 — initial design from architecture review session.*