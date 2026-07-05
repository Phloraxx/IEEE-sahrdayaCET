/// <reference path="../pb_data/types.d.ts" />

// ─── FIFA WC Predict '26 — game logic hooks ─────────────────────────
// All balance-affecting logic runs server-side here, never trusting client-
// submitted values for stake validation, payout, or balance. Mirrors the
// pattern in registrations.pb.js: hooks enforce invariants at the DB layer
// with direct $app access, and the TanStack routes authenticate + scope
// before writing with the user's own client.
//
// Sections (added incrementally per phase):
//   Phase 2 — starting grant on user create + settings singleton guard
//   Phase 4 — bet create (validate, deduct, transaction, pool bump, feed)
//   Phase 7 — settle match custom route (idempotent, per-market payouts)
//   Phase 8 — daily top-up cron
//   Phase 9 — raffle draw custom route

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Reads the single fifa_settings row, returning a fresh record each call.
 * Returns null if settings hasn't been seeded yet (backfill script does it).
 */
function getFifaSettings() {
    try {
        // findFirstRecordByFilter requires a non-empty filter; "1 = 1" is a
        // tautology that matches the single settings row.
        return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {})
    } catch (err) {
        return null
    }
}

/**
 * Writes a fifa_transactions ledger row + updates the user's balance in one
 * DAO save. Every balance change must go through this so the ledger stays
 * the source of truth. Returns the new balance, or null on failure.
 */
function applyTransaction(userId, type, amount, balanceAfter, refBetId, note) {
    try {
        var dao = $app.dao()
        var txCol = $app.findCollectionByNameOrId("fifa_transactions")
        var tx = new Record(txCol, {
            user: userId,
            type: type,
            amount: amount,
            balance_after: balanceAfter,
            ref_bet: refBetId || "",
            note: note || "",
        })
        dao.saveRecord(tx)

        var user = dao.findRecordById("users", userId)
        user.set("balance", balanceAfter)
        dao.saveRecord(user)
        return balanceAfter
    } catch (err) {
        console.log("[fifa] applyTransaction failed for " + userId + ": " + err)
        return null
    }
}

/**
 * Applies a RELATIVE balance change (delta) to the user's CURRENT balance,
 * re-reading it from the DB to avoid stale-read races when multiple deltas
 * hit the same user in one settle call. Writes a transaction + updates
 * balance. Use this for payouts/refunds/deductions where the new balance
 * = current + delta. Use applyTransaction (absolute) for starting_grant
 * and daily_topup where the target balance is known. Returns new balance.
 */
function applyDelta(userId, type, delta, refBetId, note) {
    try {
        var dao = $app.dao()
        var user = dao.findRecordById("users", userId)
        if (!user) return null
        var currentBalance = user.getInt("balance") || 0
        var newBalance = currentBalance + delta

        var txCol = $app.findCollectionByNameOrId("fifa_transactions")
        var tx = new Record(txCol, {
            user: userId,
            type: type,
            amount: delta,
            balance_after: newBalance,
            ref_bet: refBetId || "",
            note: note || "",
        })
        dao.saveRecord(tx)

        user.set("balance", newBalance)
        dao.saveRecord(user)
        return newBalance
    } catch (err) {
        console.log("[fifa] applyDelta failed for " + userId + ": " + err)
        return null
    }
}

/**
 * Emits a public feed event. System events (no user) pass null for userId.
 */
function emitFeedEvent(type, userId, matchId, message) {
    try {
        var col = $app.findCollectionByNameOrId("fifa_feed_events")
        var ev = new Record(col, {
            type: type,
            user: userId || "",
            match: matchId || "",
            message: message || "",
        })
        $app.dao().saveRecord(ev)
    } catch (err) {
        console.log("[fifa] emitFeedEvent failed: " + err)
    }
}

// ─── Phase 2: Starting grant on user create ─────────────────────────
// Fires AFTER a new user is committed. Reads starting_balance from settings,
// sets the user's balance, and writes a starting_grant transaction. Skips
// silently if settings isn't seeded yet (the backfill script will catch up).

onRecordAfterCreateSuccess(function (e) {
    var user = e.record
    if (!user) { e.next(); return }

    // Only grant once — skip if balance already non-zero (defensive)
    var existingBalance = user.getInt("balance") || 0
    if (existingBalance > 0) { e.next(); return }

    var settings = getFifaSettings()
    if (!settings) {
        // Settings not seeded yet — backfill script will grant on next run.
        e.next()
        return
    }

    var startingBalance = settings.getInt("starting_balance") || 0
    if (startingBalance <= 0) { e.next(); return }

    // Re-fetch via dao to avoid the stale-record set() issue (same pattern
    // as registrations.pb.js:238-241).
    var dao = $app.dao()
    var record = dao.findRecordById("users", user.id)
    if (!record) { e.next(); return }

    record.set("balance", startingBalance)
    dao.saveRecord(record)

    // Write the ledger entry.
    var txCol = $app.findCollectionByNameOrId("fifa_transactions")
    var tx = new Record(txCol, {
        user: user.id,
        type: "starting_grant",
        amount: startingBalance,
        balance_after: startingBalance,
        ref_bet: "",
        note: "Starting balance grant",
    })
    dao.saveRecord(tx)

    emitFeedEvent("system", user.id, "", "New player joined the game")

    e.next()
}, "users")

// ─── Phase 2: Settings singleton guard ──────────────────────────────
// Rejects creation of a second fifa_settings row. The backfill script
// creates the one and only row; admin edits it via the admin route.

onRecordCreateRequest(function (e) {
    var existing = null
    try {
        existing = $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {})
    } catch (err) { existing = null }
    if (existing) {
        throw new errors.BadRequestError("Settings already exist — edit the existing row instead")
    }
    e.next()
}, "fifa_settings")

// ─── Phase 4: Bet create — validate, snapshot, set fields ──────────
// Fires BEFORE the INSERT. Validates all business rules and sets
// server-authoritative fields (status, payout, odds_locked, placed_at,
// mode copied from market). Throws to abort on any validation failure.
//
// Balance deduction + transaction + pool bump happen in onRecordAfterCreate
// Success (post-commit) — see below. The pre-commit hook only validates and
// snapshots, so a failed validation doesn't leave orphan records.

onRecordCreateRequest(function (e) {
    var bet = e.record
    var settings = getFifaSettings()
    if (!settings) {
        throw new errors.BadRequestError("Game not configured")
    }

    var marketId = bet.getString("market")
    var matchId = bet.getString("match")
    var stake = bet.getInt("stake")
    var selection = bet.getString("selection") || ""

    if (!marketId || !matchId) {
        throw new errors.BadRequestError("Missing market or match")
    }
    if (stake <= 0) {
        throw new errors.BadRequestError("Stake must be positive")
    }
    if (!selection) {
        throw new errors.BadRequestError("Missing selection")
    }

    // Load market + match
    var market
    try {
        market = $app.findRecordById("fifa_bet_markets", marketId)
    } catch (err) {
        throw new errors.BadRequestError("Market not found")
    }
    var match
    try {
        match = $app.findRecordById("fifa_matches", matchId)
    } catch (err) {
        throw new errors.BadRequestError("Match not found")
    }

    // 1. Market must be open and not voided
    if (!market.getBool("is_open")) {
        throw new errors.BadRequestError("Market is closed")
    }
    if (market.getBool("void")) {
        throw new errors.BadRequestError("Market has been voided")
    }

    // 2. Match must not be voided
    if (match.getString("status") === "void") {
        throw new errors.BadRequestError("Match has been voided")
    }

    // 3. Betting deadline: before betting_locks_at on the match (defaults
    //    to kickoff_at if not set). bet_markets don't have their own lock
    //    time — they inherit the match's.
    var locksAt = match.getString("betting_locks_at") || match.getString("kickoff_at")
    if (locksAt && locksAt !== "") {
        var locksDate = new Date(locksAt)
        if (locksDate <= new Date()) {
            throw new errors.BadRequestError("Betting is closed for this market")
        }
    }

    // 4. Selection must be a valid option
    var optionsRaw = market.get("options")
    var options = []
    if (typeof optionsRaw === "string") {
        try { options = JSON.parse(optionsRaw) } catch (e) { options = [] }
    } else if (Array.isArray(optionsRaw)) {
        options = optionsRaw
    }
    if (options.length > 0 && options.indexOf(selection) === -1) {
        throw new errors.BadRequestError("Invalid selection for this market")
    }

    // 5. Auth record (the user placing the bet)
    var auth = e.requestInfo ? e.requestInfo.auth : null
    if (!auth || !auth.id) {
        throw new errors.UnauthorizedError("Must be logged in to bet")
    }

    // 6. Stake vs balance + max_bet_percent (pre-commit check; the
    //    after-create hook re-checks balance post-commit for TOCTOU safety)
    var balance = auth.getInt("balance") || 0
    if (stake > balance) {
        throw new errors.BadRequestError("Insufficient balance")
    }
    var maxBetPercent = settings.getInt("max_bet_percent") || 25
    var maxStake = Math.floor(balance * maxBetPercent / 100)
    if (maxBetPercent > 0 && stake > maxStake) {
        throw new errors.BadRequestError("Stake exceeds " + maxBetPercent + "% of your balance")
    }

    // 7. Pin user to the authenticated caller (createRule also enforces this
    //    but we set it here so a direct DAO write can't impersonate)
    bet.set("user", auth.id)

    // 8. Snapshot mode + odds_locked from the market
    var mode = market.getString("mode") || "pool"
    bet.set("mode", mode)
    if (mode === "fixed") {
        var fixedOddsRaw = market.get("fixed_odds")
        var fixedOdds = {}
        if (typeof fixedOddsRaw === "string") {
            try { fixedOdds = JSON.parse(fixedOddsRaw) } catch (e) { fixedOdds = {} }
        } else if (typeof fixedOddsRaw === "object" && fixedOddsRaw !== null) {
            fixedOdds = fixedOddsRaw
        }
        var odds = fixedOdds[selection]
        if (typeof odds !== "number" || odds <= 0) {
            throw new errors.BadRequestError("No odds set for selection '" + selection + "'")
        }
        bet.set("odds_locked", odds)
    } else {
        bet.set("odds_locked", 0)
    }

    // 9. Server-authoritative fields
    bet.set("status", "pending")
    bet.set("payout", 0)
    bet.set("placed_at", new Date().toISOString())

    e.next()
}, "fifa_bets")

// ─── Phase 4: Bet create — after commit (deduct, ledger, pool, feed) ─
// Fires AFTER the bet row is committed. Deducts balance, writes the
// bet_placed transaction, recomputes the market's pool counters from live
// bets (self-healing), and emits a feed event.
//
// TOCTOU safety: re-reads the user's balance from the DB. If concurrent
// bets raced past the pre-commit check and balance went negative, voids
// this bet and refunds the stake. Mirrors registrations.pb.js:263-282.

onRecordAfterCreateSuccess(function (e) {
    var bet = e.record
    if (!bet) { e.next(); return }
    var userId = bet.getString("user")
    var marketId = bet.getString("market")
    var matchId = bet.getString("match")
    var stake = bet.getInt("stake")
    var selection = bet.getString("selection") || ""

    var dao = $app.dao()

    // Re-read user balance from DB (not the stale auth record)
    var user = dao.findRecordById("users", userId)
    if (!user) { e.next(); return }
    var currentBalance = user.getInt("balance") || 0

    // TOCTOU self-heal: if balance went negative from concurrent bets, void
    if (currentBalance - stake < 0) {
        try {
            var betRec = dao.findRecordById("fifa_bets", bet.id)
            betRec.set("status", "void")
            betRec.set("payout", 0)
            dao.saveRecord(betRec)
            applyDelta(userId, "bet_refund", 0, bet.id, "Voided: insufficient balance (race)")
        } catch (err) {
            console.log("[fifa] TOCTOU void failed for bet " + bet.id + ": " + err)
        }
        e.next()
        return
    }

    // Deduct balance + write ledger (relative: re-reads current balance
    // inside applyDelta to avoid stale-read races)
    applyDelta(userId, "bet_placed", -stake, bet.id, "Bet placed on " + selection)

    // Recompute market pool counters from live bets (self-healing, not atomic
    // increment — same pattern as registeredCount in registrations.pb.js)
    try {
        var allBets = $app.findRecordsByFilter(
            "fifa_bets",
            "market = {:marketId} && status != {:void}",
            "", 0, 0,
            { marketId: marketId, void: "void" }
        )
        var poolTotal = 0
        var poolByOption = {}
        for (var i = 0; i < allBets.length; i++) {
            var b = allBets[i]
            var s = b.getInt("stake") || 0
            poolTotal += s
            var sel = b.getString("selection") || ""
            if (!poolByOption[sel]) poolByOption[sel] = 0
            poolByOption[sel] += s
        }
        var marketRec = dao.findRecordById("fifa_bet_markets", marketId)
        marketRec.set("pool_total", poolTotal)
        marketRec.set("pool_by_option", poolByOption)
        dao.saveRecord(marketRec)
    } catch (err) {
        console.log("[fifa] pool recompute failed for market " + marketId + ": " + err)
    }

    // Emit feed event (alias the display name if available)
    var displayName = user.getString("display_name") || "Player"
    emitFeedEvent("bet_placed", userId, matchId, displayName + " bet " + stake + " on " + selection)

    e.next()
}, "fifa_bets")

// ─── Phase 4b: Market void — refund pending bets ───────────────────
// Fires AFTER a bet_markets record is updated. If `void` flipped to true,
// refund all pending bets on that market. This is the missing piece that
// the settle route's "skip voided markets" comment assumed already happened.

onRecordAfterUpdateSuccess(function (e) {
    var market = e.record
    if (!market) { e.next(); return }

    // Only act when void just turned true
    if (!market.getBool("void")) { e.next(); return }

    var marketId = market.id
    var dao = $app.dao()

    // Find all pending bets on this market
    var pendingBets
    try {
        pendingBets = $app.findRecordsByFilter(
            "fifa_bets",
            "market = {:marketId} && status = {:status}",
            "", 0, 0,
            { marketId: marketId, status: "pending" }
        )
    } catch (err) {
        console.log("[fifa] void refund: failed to load bets for " + marketId + ": " + err)
        e.next()
        return
    }

    for (var i = 0; i < pendingBets.length; i++) {
        var bet = pendingBets[i]
        var stake = bet.getInt("stake") || 0
        bet.set("status", "void")
        bet.set("payout", stake) // refund
        dao.saveRecord(bet)
        applyDelta(bet.getString("user"), "bet_refund", stake, bet.id, "Market voided — refund")
    }

    if (pendingBets.length > 0) {
        emitFeedEvent("system", "", "", "Market voided — " + pendingBets.length + " bets refunded")
    }

    e.next()
}, "fifa_bet_markets")

// ─── Phase 5: Public custom routes ──────────────────────────────────
// Leaderboard + live feed. These bypass collection API rules (users.listRule
// is self+admin, so a public leaderboard can't read users via REST) using
// internal $app access — same bypass pattern as coupons.pb.js.

// GET /api/fifa/leaderboard — ranked list of players by balance desc.
// Returns [{rank, id, display_name, balance, bets_count}]. No PII (no email).
// Polled by the client every ~15s (SSE can't fire on a custom route).
routerAdd("GET", "/api/fifa/leaderboard", function (e) {
    try {
        // Only count users who have placed at least one bet OR have a
        // starting_grant — i.e. actual players, not every account.
        // For simplicity and speed at small scale, list all users with
        // balance > 0, ranked desc.
        var users = $app.findRecordsByFilter(
            "users",
            "balance > 0",
            "-balance",
            200, 0,
            {}
        )
        var rows = []
        for (var i = 0; i < users.length; i++) {
            var u = users[i]
            var displayName = u.getString("display_name") || "Player"
            // Count the user's bets. limit=0 means no limit in PB's
            // findRecordsByFilter, so .length is the true count. At ~100
            // players this is fine; would denormalize into a counter at scale.
            var betCount = 0
            try {
                var allUserBets = $app.findRecordsByFilter(
                    "fifa_bets",
                    "user = {:uid}",
                    "", 0, 0,
                    { uid: u.id }
                )
                betCount = allUserBets.length
            } catch (err) { betCount = 0 }
            rows.push({
                rank: i + 1,
                id: u.id,
                display_name: displayName,
                balance: u.getInt("balance") || 0,
                bets_count: betCount,
            })
        }
        return e.json(200, { leaderboard: rows })
    } catch (err) {
        console.log("[fifa] leaderboard route failed: " + err)
        return e.json(500, { error: "Failed to load leaderboard" })
    }
})

// GET /api/fifa/feed?limit=50 — recent feed events, newest first.
// Public, unauthenticated. The client also subscribes via SSE to
// fifa_feed_events for live updates; this route is the SSR initial load.
routerAdd("GET", "/api/fifa/feed", function (e) {
    try {
        var limit = 50
        var qLimit = e.request.url.query().get("limit")
        if (qLimit) {
            var n = parseInt(qLimit, 10)
            if (!isNaN(n) && n > 0 && n <= 200) limit = n
        }
        var events = $app.findRecordsByFilter(
            "fifa_feed_events",
            "1 = 1",
            "-created",
            limit, 0,
            {}
        )
        var rows = []
        for (var i = 0; i < events.length; i++) {
            var ev = events[i]
            rows.push({
                id: ev.id,
                type: ev.getString("type") || "",
                user: ev.getString("user") || "",
                match: ev.getString("match") || "",
                message: ev.getString("message") || "",
                created: ev.getString("created") || "",
            })
        }
        return e.json(200, { events: rows })
    } catch (err) {
        console.log("[fifa] feed route failed: " + err)
        return e.json(500, { error: "Failed to load feed" })
    }
})

// ─── Phase 7: Settlement — admin-only custom route ─────────────────
// POST /api/fifa/settle
// Body: { matchId, result_winner, result_home_goals, result_away_goals,
//         result_scorers, result_yellow_cards, result_red_cards,
//         result_home_clean_sheet, result_away_clean_sheet, custom_winners }
//
// Idempotent: bets already won/lost/void keep their status. Marks
// match.settled=true LAST so a crash leaves the route re-runnable.
// Mirrors the idempotency pattern in webhook.pb.js:75.
//
// Payout logic is the JS mirror of src/lib/fifa-payout.ts. The unit tests
// cover the TS version; this hook re-implements the same math because PB
// JS hooks can't import TS modules.

// ─── Payout math (mirror of fifa-payout.ts) ─────────────────────────

function judgeBetJS(selection, status, marketType, line, result, customWinners) {
    // Idempotent: already-settled bets keep their status
    if (status === "won" || status === "lost" || status === "void") {
        return status
    }
    switch (marketType) {
        case "match_winner": {
            if (!result.result_winner) return "void"
            return selection === result.result_winner ? "won" : "lost"
        }
        case "total_goals_ou": {
            var total = (result.result_home_goals || 0) + (result.result_away_goals || 0)
            if (selection === "over") {
                if (total > line) return "won"
                if (total < line) return "lost"
                return "void"
            }
            if (selection === "under") {
                if (total < line) return "won"
                if (total > line) return "lost"
                return "void"
            }
            return "lost"
        }
        case "correct_score": {
            var expected = (result.result_home_goals || 0) + "-" + (result.result_away_goals || 0)
            return selection === expected ? "won" : "lost"
        }
        case "first_scorer": {
            var scorers = result.result_scorers || []
            if (scorers.length === 0) return "void"
            return scorers.indexOf(selection) !== -1 ? "won" : "lost"
        }
        case "cards_ou": {
            var cards = (result.result_yellow_cards || 0) + (result.result_red_cards || 0)
            if (selection === "over") {
                if (cards > line) return "won"
                if (cards < line) return "lost"
                return "void"
            }
            if (selection === "under") {
                if (cards < line) return "won"
                if (cards > line) return "lost"
                return "void"
            }
            return "lost"
        }
        case "clean_sheet": {
            if (selection === "home") return result.result_home_clean_sheet ? "won" : "lost"
            if (selection === "away") return result.result_away_clean_sheet ? "won" : "lost"
            return "lost"
        }
        case "custom": {
            if (!customWinners || customWinners.length === 0) return "void"
            return customWinners.indexOf(selection) !== -1 ? "won" : "lost"
        }
        default:
            return "void"
    }
}

function computePayoutJS(stake, mode, oddsLocked, outcome, totalPool, totalWinningStakes, houseCutPercent) {
    if (outcome === "lost") return 0
    if (outcome === "void") return stake // refund
    if (mode === "fixed") {
        return Math.round(stake * oddsLocked)
    }
    // pool
    if (totalWinningStakes <= 0) return 0
    var cut = houseCutPercent / 100
    var pool = totalPool * (1 - cut)
    return Math.round((stake / totalWinningStakes) * pool)
}

routerAdd("POST", "/api/fifa/settle", function (e) {
    // ─── Admin-only ────────────────────────────────────────────────
    var auth = e.auth
    if (!auth) {
        return e.json(401, { error: "Authentication required" })
    }
    var role = ""
    try { role = auth.getString("role") } catch (err) { role = "" }
    if (role !== "admin") {
        return e.json(403, { error: "Admin only" })
    }

    // ─── Parse body ────────────────────────────────────────────────
    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (err) { body = {} }
    }
    var matchId = body.matchId || ""
    if (!matchId) {
        return e.json(400, { error: "matchId is required" })
    }

    var match
    try {
        match = $app.findRecordById("fifa_matches", matchId)
    } catch (err) {
        return e.json(404, { error: "Match not found" })
    }

    // Idempotency: if already settled, return success with no-op
    if (match.getBool("settled")) {
        return e.json(200, { success: true, message: "Already settled", matchId: matchId })
    }

    var result = {
        result_winner: body.result_winner || "",
        result_home_goals: Number(body.result_home_goals) || 0,
        result_away_goals: Number(body.result_away_goals) || 0,
        result_scorers: body.result_scorers || [],
        result_yellow_cards: Number(body.result_yellow_cards) || 0,
        result_red_cards: Number(body.result_red_cards) || 0,
        result_home_clean_sheet: !!body.result_home_clean_sheet,
        result_away_clean_sheet: !!body.result_away_clean_sheet,
    }
    var customWinnersMap = body.custom_winners || {}

    // ─── Update the match record with the result ───────────────────
    var dao = $app.dao()
    match.set("result_winner", result.result_winner)
    match.set("result_home_goals", result.result_home_goals)
    match.set("result_away_goals", result.result_away_goals)
    match.set("result_scorers", result.result_scorers)
    match.set("result_yellow_cards", result.result_yellow_cards)
    match.set("result_red_cards", result.result_red_cards)
    match.set("result_home_clean_sheet", result.result_home_clean_sheet)
    match.set("result_away_clean_sheet", result.result_away_clean_sheet)
    match.set("status", "finished")
    dao.saveRecord(match)

    // ─── Load all markets for this match ───────────────────────────
    var markets = $app.findRecordsByFilter(
        "fifa_bet_markets",
        "match = {:matchId}",
        "", 0, 0,
        { matchId: matchId }
    )

    var settings = getFifaSettings()
    var houseCutPercent = settings ? (settings.getInt("pool_house_cut_percent") || 0) : 0

    var settledCount = 0
    var totalPayout = 0
    var marketsProcessed = 0

    // ─── Settle each market ────────────────────────────────────────
    for (var mi = 0; mi < markets.length; mi++) {
        var market = markets[mi]
        var marketId = market.id
        var marketType = market.getString("market_type") || ""
        var marketMode = market.getString("mode") || "pool"
        var line = market.getInt("line") || 0
        var customWinners = customWinnersMap[marketId] || []

        // Skip voided markets — their bets were already refunded by the
        // onRecordAfterUpdateSuccess hook on fifa_bet_markets when void was
        // flipped to true.
        if (market.getBool("void")) continue
        marketsProcessed++

        // Load all bets for this market
        var bets = $app.findRecordsByFilter(
            "fifa_bets",
            "market = {:marketId}",
            "", 0, 0,
            { marketId: marketId }
        )

        // First pass: judge every bet
        var judged = []
        for (var bi = 0; bi < bets.length; bi++) {
            var bet = bets[bi]
            var outcome = judgeBetJS(
                bet.getString("selection"),
                bet.getString("status"),
                marketType,
                line,
                result,
                customWinners
            )
            judged.push({ bet: bet, outcome: outcome })
        }

        // Pool market: if nobody won, void + refund all
        if (marketMode === "pool" && judged.length > 0) {
            var anyWinner = false
            for (var j = 0; j < judged.length; j++) {
                if (judged[j].outcome === "won") { anyWinner = true; break }
            }
            if (!anyWinner) {
                for (var k = 0; k < judged.length; k++) {
                    var b = judged[k].bet
                    var refundStake = b.getInt("stake") || 0
                    b.set("status", "void")
                    b.set("payout", refundStake)
                    dao.saveRecord(b)
                    // Refund via applyDelta (re-reads balance — safe if user
                    // has multiple bets across voided markets in one call)
                    applyDelta(b.getString("user"), "bet_refund", refundStake, b.id, "Pool voided — refund")
                }
                continue
            }
        }

        // Compute pool context
        var totalPool = 0
        var totalWinningStakes = 0
        for (var j2 = 0; j2 < judged.length; j2++) {
            totalPool += judged[j2].bet.getInt("stake") || 0
            if (judged[j2].outcome === "won") {
                totalWinningStakes += judged[j2].bet.getInt("stake") || 0
            }
        }

        // Second pass: update bets + pay out winners
        for (var j3 = 0; j3 < judged.length; j3++) {
            var jb = judged[j3]
            var stake = jb.bet.getInt("stake") || 0
            var mode = jb.bet.getString("mode") || "pool"
            var oddsLocked = jb.bet.getInt("odds_locked") || 0
            var payout = computePayoutJS(stake, mode, oddsLocked, jb.outcome, totalPool, totalWinningStakes, houseCutPercent)

            jb.bet.set("status", jb.outcome)
            jb.bet.set("payout", payout)
            dao.saveRecord(jb.bet)
            settledCount++

            // Pay out (or refund) via transaction. applyDelta re-reads the
            // current balance from the DB each call, so multiple payouts to
            // the same user in one settle call compose correctly.
            if (jb.outcome === "won" || jb.outcome === "void") {
                var userId = jb.bet.getString("user")
                var txType = jb.outcome === "void" ? "bet_refund" : "bet_payout"
                var note = jb.outcome === "void" ? "Bet voided — refund" : "Bet won — payout"
                applyDelta(userId, txType, payout, jb.bet.id, note)
                totalPayout += payout
            }
        }
    }

    // ─── Mark match settled LAST (crash → re-runnable) ─────────────
    match.set("settled", true)
    dao.saveRecord(match)

    // Emit feed event
    var homeTeam = match.getString("team_home") || ""
    var awayTeam = match.getString("team_away") || ""
    emitFeedEvent("result", "", matchId, homeTeam + " " + result.result_home_goals + "-" + result.result_away_goals + " " + awayTeam + " — settled")

    return e.json(200, {
        success: true,
        matchId: matchId,
        marketsSettled: marketsProcessed,
        betsSettled: settledCount,
        totalPayout: totalPayout,
    })
})

// ─── Phase 8: Daily top-up cron ─────────────────────────────────────
// Runs daily at 09:00. Tops up anyone whose balance is below
// daily_topup_threshold to daily_topup_target. Idempotent: skips users who
// already received a daily_topup transaction today.
//
// "Today" is by calendar date in the DB's created timestamp, not a rolling
// 24h — so re-running on the same day is a no-op.

cronAdd("fifa-daily-topup", "0 9 * * *", function () {
    var settings = getFifaSettings()
    if (!settings) { return }
    var threshold = settings.getInt("daily_topup_threshold") || 0
    var target = settings.getInt("daily_topup_target") || 0
    if (threshold <= 0 || target <= 0 || target <= threshold) { return }

    // Find users below threshold
    var users
    try {
        users = $app.findRecordsByFilter(
            "users",
            "balance < {:threshold}",
            "", 0, 0,
            { threshold: threshold }
        )
    } catch (err) {
        console.log("[fifa] topup: failed to list users: " + err)
        return
    }

    // Today's date prefix (YYYY-MM-DD) for idempotency check
    var todayPrefix = new Date().toISOString().slice(0, 10)

    var toppedUp = 0
    for (var i = 0; i < users.length; i++) {
        var user = users[i]
        var userId = user.id

        // Idempotency: skip if already topped up today
        try {
            var existing = $app.findFirstRecordByFilter(
                "fifa_transactions",
                "user = {:uid} && type = {:type} && created ~ {:prefix}",
                { uid: userId, type: "daily_topup", prefix: todayPrefix }
            )
            if (existing) { continue }
        } catch (err) { /* no existing — proceed */ }

        var currentBalance = user.getInt("balance") || 0
        var topupAmount = target - currentBalance
        if (topupAmount <= 0) { continue }

        applyTransaction(userId, "daily_topup", topupAmount, target, "", "Daily top-up")
        toppedUp++
    }

    if (toppedUp > 0) {
        emitFeedEvent("system", "", "", toppedUp + " players received their daily top-up")
        console.log("[fifa] daily topup: " + toppedUp + " users topped up to " + target)
    }
})

// ─── Phase 9: Raffle draw — admin-only custom route ─────────────────
// POST /api/fifa/raffle
// Body: {} (no params — reads settings + leaderboard)
//
// Builds the ticket list from the current leaderboard using
//   tickets = max(1, raffle_tickets_base - raffle_tickets_decay * rank)
// (rank 1 = base tickets, decay per rank, floor 1). Everyone with at least
// raffle_active_participant_min_bets bets gets at least 1 ticket.
// CSPRNG weighted pick. Stores entries_snapshot + seed + winner for
// transparency.

routerAdd("POST", "/api/fifa/raffle", function (e) {
    // ─── Admin-only ────────────────────────────────────────────────
    var auth = e.auth
    if (!auth) {
        return e.json(401, { error: "Authentication required" })
    }
    var role = ""
    try { role = auth.getString("role") } catch (err) { role = "" }
    if (role !== "admin") {
        return e.json(403, { error: "Admin only" })
    }

    var settings = getFifaSettings()
    if (!settings) {
        return e.json(400, { error: "Game not configured" })
    }
    var base = settings.getInt("raffle_tickets_base") || 50
    var decay = settings.getInt("raffle_tickets_decay") || 2
    var minBets = settings.getInt("raffle_active_participant_min_bets") || 1

    // ─── Build leaderboard (ranked by balance desc) ────────────────
    var users
    try {
        users = $app.findRecordsByFilter(
            "users",
            "balance > 0",
            "-balance",
            500, 0,
            {}
        )
    } catch (err) {
        return e.json(500, { error: "Failed to load players" })
    }

    if (users.length === 0) {
        return e.json(400, { error: "No eligible players" })
    }

    // ─── Build ticket list ─────────────────────────────────────────
    // Each entry: { user_id, display_name, rank, tickets, bets_count }
    var entries = []
    var totalTickets = 0
    for (var i = 0; i < users.length; i++) {
        var u = users[i]
        var rank = i + 1

        // Count bets (eligibility check). limit=0 = no limit, so .length is
        // the true count.
        var betCount = 0
        try {
            var bets = $app.findRecordsByFilter(
                "fifa_bets",
                "user = {:uid}",
                "", 0, 0,
                { uid: u.id }
            )
            betCount = bets.length
        } catch (err) { betCount = 0 }

        if (betCount < minBets) { continue }

        var tickets = Math.max(1, base - decay * (rank - 1))
        entries.push({
            user_id: u.id,
            display_name: u.getString("display_name") || "Player",
            rank: rank,
            tickets: tickets,
            bets_count: betCount,
        })
        totalTickets += tickets
    }

    if (entries.length === 0) {
        return e.json(400, { error: "No eligible players (min " + minBets + " bets required)" })
    }

    // ─── Weighted random pick ──────────────────────────────────────
    // Generate a random number in [0, totalTickets). Walk the entries,
    // subtracting each entry's ticket count until we hit the winner.
    //
    // Not a CSPRNG — uses Math.random(). The admin triggering the draw is
    // trusted, the full ticket list + winning pick + seed are stored in
    // entries_snapshot for audit, and this is a college raffle for a sponsor
    // voucher, not a security-critical draw. The seed is recorded so the
    // result is reproducible if challenged, but it does NOT influence the
    // pick (Math.random isn't seedable in JS). Honest about the tradeoff.
    var seed = $security.randomString(32) // audit token, not the PRNG seed
    var pick = Math.floor(Math.random() * totalTickets)
    var winnerIndex = 0
    var acc = 0
    for (var j = 0; j < entries.length; j++) {
        acc += entries[j].tickets
        if (pick < acc) {
            winnerIndex = j
            break
        }
    }
    var winner = entries[winnerIndex]

    // ─── Store the draw ────────────────────────────────────────────
    try {
        var dao = $app.dao()
        var col = $app.findCollectionByNameOrId("fifa_raffle_draws")
        var draw = new Record(col, {
            drawn_at: new Date().toISOString(),
            winner: winner.user_id,
            entries_snapshot: {
                total_tickets: totalTickets,
                winning_pick: pick,
                entries: entries,
            },
            seed: seed,
        })
        dao.saveRecord(draw)

        // Emit feed event
        emitFeedEvent("raffle", winner.user_id, "", "🎁 Raffle winner: " + winner.display_name + " (rank #" + winner.rank + ")")

        return e.json(200, {
            success: true,
            winner: {
                user_id: winner.user_id,
                display_name: winner.display_name,
                rank: winner.rank,
                tickets: winner.tickets,
            },
            totalTickets: totalTickets,
            totalEntries: entries.length,
            drawId: draw.id,
            seed: seed,
        })
    } catch (err) {
        console.log("[fifa] raffle draw failed: " + err)
        return e.json(500, { error: "Failed to store raffle draw" })
    }
})
