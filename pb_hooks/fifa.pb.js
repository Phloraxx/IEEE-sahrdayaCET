/** Shared FIFA helpers — require() inside each hook handler (PB 0.39 scope isolation). */

function getFifaSettings() {
    try {
        return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {})
    } catch (err) {
        return null
    }
}

function applyTransaction(userId, type, amount, balanceAfter, refBetId, note) {
    try {
        var txCol = $app.findCollectionByNameOrId("fifa_transactions")
        var tx = new Record(txCol, {
            user: userId,
            type: type,
            amount: amount,
            balance_after: balanceAfter,
            ref_bet: refBetId || "",
            note: note || "",
            timestamp: new Date().toISOString(),
        })
        $app.saveNoValidate(tx)

        var user = $app.findRecordById("users", userId)
        user.set("balance", balanceAfter)
        $app.saveNoValidate(user)
        return balanceAfter
    } catch (err) {
        console.log("[fifa] applyTransaction failed for " + userId + ": " + err)
        return null
    }
}

function applyDelta(userId, type, delta, refBetId, note) {
    try {
        var user = $app.findRecordById("users", userId)
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
            timestamp: new Date().toISOString(),
        })
        $app.saveNoValidate(tx)

        user.set("balance", newBalance)
        $app.saveNoValidate(user)
        return newBalance
    } catch (err) {
        console.log("[fifa] applyDelta failed for " + userId + ": " + err)
        return null
    }
}

function emitFeedEvent(type, userId, matchId, message) {
    // No-op — social feed removed (FIFA-AUTOMATION.md PR1).
    return
}

// Returns a display name for a user record. Falls back to "Player <short-id>"
// (last 4 of the user id) when display_name is empty — so multiple unset users
// are distinguishable on the public leaderboard instead of all reading "Player".
function displayName(user) {
    var name = user.getString("display_name")
    if (name) return name
    var shortId = user.id.length >= 4 ? user.id.slice(-4) : user.id
    return "Player " + shortId
}

/// <reference path="../pb_data/types.d.ts" />

// ─── FIFA WC Predict '26 — game logic hooks ─────────────────────────
// Touch this file to trigger PB hook reload (auto-watch enabled).
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



// Decode PB JSON fields (string, object, or goja byte array).
var parseJsonField = function(raw) {
    if (!raw) return null
    if (typeof raw === "string") {
        try { return JSON.parse(raw) } catch (ex) { return null }
    }
    if (typeof raw === "object" && typeof raw.length === "number") {
        if (raw.length > 0 && typeof raw[0] === "number") {
            try {
                var str = ""
                for (var i = 0; i < raw.length; i++) str += String.fromCharCode(raw[i])
                return JSON.parse(str)
            } catch (ex) { return null }
        }
        return raw
    }
    if (typeof raw === "object") return raw
    return null
}

var getRecordFloat = function(record, field) {
    var v = record.get(field)
    if (v === null || v === undefined || v === "") return 0
    var n = Number(v)
    return isNaN(n) ? 0 : n
}

// Void all markets on a match — triggers market-void refund hook per market.
var voidMatchMarkets = function(matchId) {
    try {
        var markets = $app.findRecordsByFilter(
            "fifa_bet_markets",
            "match = {:matchId}",
            "", 0, 0,
            { matchId: matchId }
        )
        for (var i = 0; i < markets.length; i++) {
            var mk = markets[i]
            if (!mk.getBool("void")) {
                mk.set("void", true)
                mk.set("is_open", false)
                $app.saveNoValidate(mk)
            }
        }
    } catch (err) {
        console.log("[fifa] voidMatchMarkets failed for " + matchId + ": " + err)
    }
}

// ─── Phase X: Google OAuth Display Name ─────────────────────────────────
// Sets the display_name from the Google profile on first login.

onRecordAuthWithOAuth2Request(function (e) {
    if (e.isNewRecord && !e.record.get("display_name")) {
        var name = ""
        if (e.oAuth2User) {
            // Check standard PB OAuth2 user fields
            name = e.oAuth2User.name || (e.oAuth2User.rawUser && e.oAuth2User.rawUser.name) || ""
        }
        if (name) {
            e.record.set("display_name", name)
        }
    }
    e.next()
}, "users")

// ─── Phase 2: Starting grant on user create ─────────────────────────
// Fires AFTER a new user is committed. Reads starting_balance from settings,
// sets the user's balance, and writes a starting_grant transaction. Skips
// silently if settings isn't seeded yet (the backfill script will catch up).

onRecordAfterCreateSuccess(function (e) {
    
    var user = e.record
    if (!user) { e.next(); return }

    // Only grant once — skip if a starting_grant transaction already exists.
    try {
        var prior = $app.findRecordsByFilter(
            "fifa_transactions",
            "user = {:uid} && type = {:type}",
            "-id",
            1, 0,
            { uid: user.id, type: "starting_grant" }
        )
        if (prior.length > 0) { e.next(); return }
    } catch (err) { /* proceed */ }

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
    
    var record = $app.findRecordById("users", user.id)
    if (!record) { e.next(); return }

    record.set("balance", startingBalance)
    $app.saveNoValidate(record)

    // Write the ledger entry.
    var txCol = $app.findCollectionByNameOrId("fifa_transactions")
    var tx = new Record(txCol, {
        user: user.id,
        type: "starting_grant",
        amount: startingBalance,
        balance_after: startingBalance,
        ref_bet: "",
        note: "Starting balance grant",
        timestamp: new Date().toISOString(),
    })
    $app.saveNoValidate(tx)

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
        throw e.badRequestError("Settings already exist — edit the existing row instead")
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
    try {
    var bet = e.record
    var settings = null
    try { settings = $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (err) { settings = null }
    if (!settings) {
        throw e.badRequestError("Game not configured")
    }
    if (!settings.getBool("registration_open")) {
        throw e.badRequestError("Registration is closed")
    }

    var marketId = bet.getString("market")
    var matchId = bet.getString("match")
    var stake = bet.getInt("stake")
    var selection = bet.getString("selection") || ""

    if (!marketId || !matchId) {
        throw e.badRequestError("Missing market or match")
    }
    if (stake <= 0) {
        throw e.badRequestError("Stake must be positive")
    }
    if (!selection) {
        throw e.badRequestError("Missing selection")
    }

    // Load market + match
    var market
    try {
        market = $app.findRecordById("fifa_bet_markets", marketId)
    } catch (err) {
        throw e.badRequestError("Market not found")
    }
    var match
    try {
        match = $app.findRecordById("fifa_matches", matchId)
    } catch (err) {
        throw e.badRequestError("Match not found")
    }

    // 1. Market must be open and not voided
    if (!market.getBool("is_open")) {
        throw e.badRequestError("Market is closed")
    }
    if (market.getBool("void")) {
        throw e.badRequestError("Market has been voided")
    }

    // 2. Match must be open for betting
    var matchStatus = match.getString("status") || "upcoming"
    if (matchStatus === "void" || matchStatus === "finished" || matchStatus === "live") {
        throw e.badRequestError("Betting is closed for this match")
    }

    // 3. Betting deadline: before betting_locks_at on the match (defaults
    //    to kickoff_at if not set). bet_markets don't have their own lock
    //    time — they inherit the match's.
    var locksAt = match.getString("betting_locks_at") || match.getString("kickoff_at")
    if (locksAt && locksAt !== "") {
        var locksDate = new Date(locksAt)
        if (locksDate <= new Date()) {
            throw e.badRequestError("Betting is closed for this market")
        }
    }

    // 4. Selection must be a valid option
    // PB 0.39 stores JSON fields in goja as byte arrays. Try multiple
    // decoding strategies. If all fail, reject the bet — a market with
    // unparseable options is misconfigured and shouldn't accept bets.
    var marketType = market.getString("market_type") || ""
    var optionsParsed = parseJsonField(market.get("options"))
    var options = []
    if (optionsParsed) {
        if (typeof optionsParsed.length === "number") {
            for (var oi = 0; oi < optionsParsed.length; oi++) options.push(optionsParsed[oi])
        }
    }
    if (!optionsParsed && market.get("options")) {
        throw e.badRequestError("Market configuration error: invalid options")
    }
    if (marketType !== "custom" && options.length === 0) {
        throw e.badRequestError("Market has no valid options configured")
    }
    if (options.length > 0 && options.indexOf(selection) === -1) {
        throw e.badRequestError("Invalid selection for this market")
    }

    // 5. Auth record (the user placing the bet).
    // PB 0.39 sets e.auth when the request has a valid Authorization: Bearer
    // header. The TanStack route now passes the token as Bearer (not cookie),
    // so e.auth should be populated.
    var auth = null
    try { auth = e.auth || null } catch (err) { auth = null }
    if (!auth || !auth.id) {
        throw e.badRequestError("Must be logged in to bet")
    }

    // 6. Stake vs balance + max_bet_percent (pre-commit check; the
    //    after-create hook re-checks balance post-commit for TOCTOU safety)
    var balance = auth.getInt("balance") || 0
    if (stake > balance) {
        throw e.badRequestError("Insufficient balance")
    }
    var maxBetPercent = settings.getInt("max_bet_percent") || 25
    var maxStake = Math.floor(balance * maxBetPercent / 100)
    if (maxBetPercent > 0 && stake > maxStake) {
        throw e.badRequestError("Stake exceeds " + maxBetPercent + "% of your balance")
    }

    // 7. Pin user to the authenticated caller (createRule also enforces this
    //    but we set it here so a direct DAO write can't impersonate)
    bet.set("user", auth.id)

    // 8. Snapshot mode + odds_locked from the market
    var mode = market.getString("mode") || "pool"
    bet.set("mode", mode)
    if (mode === "fixed") {
        var fixedOdds = parseJsonField(market.get("fixed_odds")) || {}
        var odds = fixedOdds[selection]
        if (typeof odds !== "number" || odds <= 0) {
            throw e.badRequestError("No odds set for selection '" + selection + "'")
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
    } catch (err) {
        console.log("[fifa] bet create error: " + String(err))
        // Re-throw as BadRequestError so PB returns 400, not 502
        if (err && typeof err === "object" && err.name === "BadRequestError") {
            throw err
        }
        throw e.badRequestError(String(err))
    }
}, "fifa_bets")

// ─── Phase 4: Bet create — after commit (deduct, ledger, pool, feed) ─
// Fires AFTER the bet row is committed. Deducts balance, writes the
// bet_placed transaction, recomputes the market's pool counters from live
// bets (self-healing), and emits a feed event.
//
// TOCTOU safety: re-reads the user's balance from the DB. If concurrent
// bets raced past the pre-commit check, voids this bet without refunding
// (stake was never deducted). Mirrors registrations.pb.js:263-282.

onRecordAfterCreateSuccess(function (e) {
    var bet = e.record
    if (!bet) { e.next(); return }
    var userId = bet.getString("user")
    var marketId = bet.getString("market")
    var matchId = bet.getString("match")
    var stake = bet.getInt("stake")
    var selection = bet.getString("selection") || ""

    

    // Re-read user balance from DB (not the stale auth record)
    var user = $app.findRecordById("users", userId)
    if (!user) { e.next(); return }
    var currentBalance = user.getInt("balance") || 0

    // TOCTOU self-heal: void without refund — stake was never deducted
    if (currentBalance - stake < 0) {
        try {
            var betRec = $app.findRecordById("fifa_bets", bet.id)
            betRec.set("status", "void")
            betRec.set("payout", 0)
            $app.saveNoValidate(betRec)
        } catch (err) {
            console.log("[fifa] TOCTOU void failed for bet " + bet.id + ": " + err)
        }
        e.next()
        return
    }

    // Deduct balance + write ledger (inline applyDelta to avoid scope issues)
    // Re-reads the user balance from DB right before deduction to minimize
    // the race window between the TOCTOU check and the actual deduction.
    // The self-heal above is the safety net for any remaining race.
    try {
        var u = $app.findRecordById("users", userId)
        var newBal = (u.getInt("balance") || 0) - stake
        var txCol3 = $app.findCollectionByNameOrId("fifa_transactions")
        var tx3 = new Record(txCol3, { user: userId, type: "bet_placed", amount: -stake, balance_after: newBal, ref_bet: bet.id, note: "Bet placed on " + selection, timestamp: new Date().toISOString() })
        $app.saveNoValidate(tx3)
        u.set("balance", newBal)
        $app.saveNoValidate(u)
    } catch (err) {
        console.log("[fifa] balance deduction failed for bet " + bet.id + ": " + err)
        try {
            var voidBet = $app.findRecordById("fifa_bets", bet.id)
            voidBet.set("status", "void")
            voidBet.set("payout", 0)
            $app.saveNoValidate(voidBet)
        } catch (voidErr) {
            console.log("[fifa] failed to void bet after deduction error: " + voidErr)
        }
        e.next()
        return
    }

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
        var marketRec = $app.findRecordById("fifa_bet_markets", marketId)
        marketRec.set("pool_total", poolTotal)
        marketRec.set("pool_by_option", poolByOption)
        $app.saveNoValidate(marketRec)
    } catch (err) {
        console.log("[fifa] pool recompute failed for market " + marketId + ": " + err)
    }

    // Feed removed from product (FIFA-AUTOMATION.md PR1) — no feed write on bet.

    e.next()
}, "fifa_bets")

// ─── Phase 4b: Match void — void all markets (triggers refunds) ─────
onRecordAfterUpdateSuccess(function (e) {
    var match = e.record
    if (!match) { e.next(); return }
    if (match.getString("status") !== "void") { e.next(); return }
    voidMatchMarkets(match.id)
    e.next()
}, "fifa_matches")

// ─── Phase 4c: Market void — refund pending bets ───────────────────
// Fires AFTER a bet_markets record is updated. When void=true, refund all
// pending bets on that market (idempotent — pending bets clear on first pass).

onRecordAfterUpdateSuccess(function (e) {
    
    var market = e.record
    if (!market) { e.next(); return }

    if (!market.getBool("void")) { e.next(); return }

    var marketId = market.id

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

    var refundedCount = 0
    for (var i = 0; i < pendingBets.length; i++) {
        var bet = pendingBets[i]
        var stake = bet.getInt("stake") || 0
        // Credit first; leave pending if ledger write fails so a retry can refund.
        var newBal = applyDelta(bet.getString("user"), "bet_refund", stake, bet.id, "Market voided — refund")
        if (newBal === null) {
            console.log("[fifa] void refund: credit failed for bet " + bet.id + " — leaving pending")
            continue
        }
        bet.set("status", "void")
        bet.set("payout", stake) // refund
        $app.saveNoValidate(bet)
        refundedCount++
    }

    if (refundedCount > 0) {
        emitFeedEvent("system", "", "", "Market voided — " + refundedCount + " bets refunded")
    }


    e.next()
}, "fifa_bet_markets")

// ─── Phase 4c: Match void — cascade to markets (refund via market hook) ─
// Fires AFTER a match is updated. When status becomes "void", mark every
// non-void market as void so the market-void hook refunds pending bets.
// Auto-void cron and admin trigger only set match.status; this closes the
// gap that left stakes locked forever.

onRecordAfterUpdateSuccess(function (e) {
    var match = e.record
    if (!match) { e.next(); return }
    if (match.getString("status") !== "void") { e.next(); return }

    var matchId = match.id
    var markets
    try {
        markets = $app.findRecordsByFilter(
            "fifa_bet_markets",
            "match = {:matchId}",
            "", 0, 0,
            { matchId: matchId }
        )
    } catch (err) {
        console.log("[fifa] match-void cascade: failed to load markets for " + matchId + ": " + err)
        e.next()
        return
    }

    var voidedMarkets = 0
    for (var i = 0; i < markets.length; i++) {
        var market = markets[i]
        if (market.getBool("void")) continue
        try {
            market.set("void", true)
            market.set("is_open", false)
            $app.saveNoValidate(market)
            // Market onRecordAfterUpdateSuccess refunds pending bets.
            voidedMarkets++
        } catch (err) {
            console.log("[fifa] match-void cascade: failed to void market " + market.id + ": " + err)
        }
    }

    if (voidedMarkets > 0) {
        console.log("[fifa] match-void cascade: voided " + voidedMarkets + " markets for match " + matchId)
    }
    e.next()
}, "fifa_matches")


// ─── Phase 5: Public custom routes ──────────────────────────────────
// Leaderboard + live feed. These bypass collection API rules (users.listRule
// is self+admin, so a public leaderboard can't read users via REST) using
// internal $app access — same bypass pattern as coupons.pb.js.

// GET /api/fifa/leaderboard — ranked list of players by balance desc.
// Returns [{rank, id, display_name, balance, bets_count}]. No PII (no email).
// Polled by the client every ~15s (SSE can't fire on a custom route).
routerAdd("GET", "/api/fifa/leaderboard", function (e) {
    try {
        
        // Rank by balance desc, tiebreak by bets_count desc (FIFA-GAME.md §2.4).
        // PB can't sort by a computed field, so we fetch all eligible users
        // and sort in JS. At ~100 players this is trivial.
        var users = $app.findRecordsByFilter(
            "users",
            "balance > 0",
            "-balance",
            500, 0,
            {}
        )
        var rows = []
        for (var i = 0; i < users.length; i++) {
            var u = users[i]
            // NOTE: use a distinct local name — `var displayName` would hoist
            // and shadow the top-level displayName() helper, making this call
            // throw "displayName is not a function".
            var dName = displayName(u)
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
                id: u.id,
                display_name: dName,
                balance: u.getInt("balance") || 0,
                bets_count: betCount,
            })
        }
        // Tiebreak: balance desc, then bets_count desc (active > passive at
        // the same balance — FIFA-GAME.md §2.4).
        rows.sort(function (a, b) {
            if (b.balance !== a.balance) return b.balance - a.balance
            return b.bets_count - a.bets_count
        })
        // Assign ranks after sort (ties get the same rank, next rank skips —
        // standard competition ranking).
        var ranked = []
        var lastBalance = null
        var lastBets = null
        var rank = 0
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j]
            if (r.balance !== lastBalance || r.bets_count !== lastBets) {
                rank = j + 1
                lastBalance = r.balance
                lastBets = r.bets_count
            }
            ranked.push({
                rank: rank,
                id: r.id,
                display_name: r.display_name,
                balance: r.balance,
                bets_count: r.bets_count,
            })
        }
        var settings = getFifaSettings()
        // Defaults only apply when no fifa_settings record exists at all —
        // once a record exists, trust its stored values verbatim (0 is a
        // valid, intentional config, e.g. no minimum-bets requirement).
        // min_bets default of 5 matches the documented design value
        // (FIFA-GAME.md §2.4, seeded by scripts/migrate-game-backfill.ts) —
        // keep it in sync with the /api/fifa/raffle draw route's own
        // no-settings behavior below.
        var raffleBase = 50, raffleDecay = 2, minBets = 5
        if (settings) {
            raffleBase = settings.getInt("raffle_tickets_base")
            raffleDecay = settings.getInt("raffle_tickets_decay")
            minBets = settings.getInt("raffle_active_participant_min_bets")
        }
        return e.json(200, { 
            leaderboard: ranked, 
            settings: { 
                raffle_tickets_base: raffleBase, 
                raffle_tickets_decay: raffleDecay, 
                min_bets: minBets 
            } 
        })
    } catch (err) {
        console.log("[fifa] leaderboard route failed: " + err)
        return e.json(500, { error: "Failed to load leaderboard" })
    }
})

// GET /api/fifa/stats — public player + bet counts for the overview page.
// users/fifa_bets listRules block unauthenticated REST counts; this uses
// $app internal access (same pattern as leaderboard).
routerAdd("GET", "/api/fifa/stats", function (e) {
    try {
        var playerCount = 0
        var totalBets = 0
        try {
            var bets = $app.findRecordsByFilter(
                "fifa_bets",
                "1 = 1",
                "", 0, 0,
                {}
            )
            totalBets = bets ? bets.length : 0
            
            var uniqueUsers = {}
            if (bets) {
                for (var i = 0; i < bets.length; i++) {
                    var uid = bets[i].getString("user")
                    if (uid) {
                        uniqueUsers[uid] = true
                    }
                }
            }
            var count = 0;
            for (var k in uniqueUsers) {
                if (uniqueUsers.hasOwnProperty(k)) count++;
            }
            playerCount = count;
        } catch (err) { 
            playerCount = 0
            totalBets = 0
        }
        return e.json(200, { playerCount: playerCount, totalBets: totalBets })
    } catch (err) {
        console.log("[fifa] stats route failed: " + err)
        return e.json(500, { error: "Failed to load stats" })
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
                created: ev.get("created") ? ev.get("created").toString() : "",
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

routerAdd("POST", "/api/fifa/settle", function (e) {
  try {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }
    var _judgeBet = function(selection, status, marketType, line, result, customWinners) {
        if (status === "won" || status === "lost" || status === "void") { return status }
        switch (marketType) {
            case "match_winner": {
                var winner = result.result_advance || result.result_winner
                if (!winner || winner === "draw") return "void"
                return selection === winner ? "won" : "lost"
            }
            case "total_goals_ou": {
                var total = (result.result_home_goals || 0) + (result.result_away_goals || 0)
                if (selection === "over") { if (total > line) return "won"; if (total < line) return "lost"; return "void" }
                if (selection === "under") { if (total < line) return "won"; if (total > line) return "lost"; return "void" }
                return "lost"
            }
            case "correct_score": {
                var expected = (result.result_home_goals || 0) + "-" + (result.result_away_goals || 0)
                return selection === expected ? "won" : "lost"
            }
            case "any_scorer": {
                var scorers = result.result_scorers || []
                if (scorers.length === 0) return "void"
                return scorers.indexOf(selection) !== -1 ? "won" : "lost"
            }
            case "cards_ou": {
                var cards = (result.result_yellow_cards || 0) + (result.result_red_cards || 0)
                if (selection === "over") { if (cards > line) return "won"; if (cards < line) return "lost"; return "void" }
                if (selection === "under") { if (cards < line) return "won"; if (cards > line) return "lost"; return "void" }
                return "lost"
            }
            case "clean_sheet": {
                var homeClean = (result.result_away_goals || 0) === 0
                var awayClean = (result.result_home_goals || 0) === 0
                if (selection === "home") return homeClean ? "won" : "lost"
                if (selection === "away") return awayClean ? "won" : "lost"
                return "lost"
            }
            case "custom": {
                if (!customWinners || customWinners.length === 0) return "void"
                return customWinners.indexOf(selection) !== -1 ? "won" : "lost"
            }
            default: return "void"
        }
    }
    var _computePayout = function(stake, mode, oddsLocked, outcome, totalPool, totalWinningStakes, houseCutPercent) {
        if (outcome === "lost") return 0
        if (outcome === "void") return stake
        if (mode === "fixed") { return Math.round(stake * oddsLocked) }
        if (totalWinningStakes <= 0) return 0
        var cut = houseCutPercent / 100
        var pool = totalPool * (1 - cut)
        return Math.round((stake / totalWinningStakes) * pool)
    }

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

    // Idempotency: skip only when fully settled (no stranded pending bets).
    // Allows re-settle to recover from partial payout failures.
    if (match.getBool("settled")) {
        var alreadyPending = $app.findRecordsByFilter(
            "fifa_bets",
            "match = {:matchId} && status = {:pending}",
            "", 1, 0,
            { matchId: matchId, pending: "pending" }
        )
        if (alreadyPending.length === 0) {
            return e.json(200, { success: true, message: "Already settled", matchId: matchId })
        }
    }

    var homeGoals = Number(body.result_home_goals) || 0
    var awayGoals = Number(body.result_away_goals) || 0
    var result = {
        result_winner: body.result_winner || "",
        result_home_goals: homeGoals,
        result_away_goals: awayGoals,
        result_scorers: body.result_scorers || [],
        result_yellow_cards: Number(body.result_yellow_cards) || 0,
        result_red_cards: Number(body.result_red_cards) || 0,
        result_home_clean_sheet: awayGoals === 0,
        result_away_clean_sheet: homeGoals === 0,
        result_advance: body.result_advance || "",
        result_after_extra_time: !!body.result_after_extra_time,
        result_after_penalties: !!body.result_after_penalties,
    }
    // Auto-fill result_advance from result_winner when the 90-min result
    // wasn't a draw (the TanStack route does this too — belt and braces).
    if (!result.result_advance && result.result_winner && result.result_winner !== "draw") {
        result.result_advance = result.result_winner
    }
    var customWinnersMap = body.custom_winners || {}

    // ─── Update the match record with the result ───────────────────
    
    match.set("result_winner", result.result_winner)
    match.set("result_home_goals", result.result_home_goals)
    match.set("result_away_goals", result.result_away_goals)
    match.set("result_scorers", result.result_scorers)
    match.set("result_yellow_cards", result.result_yellow_cards)
    match.set("result_red_cards", result.result_red_cards)
    match.set("result_home_clean_sheet", result.result_home_clean_sheet)
    match.set("result_away_clean_sheet", result.result_away_clean_sheet)
    match.set("result_advance", result.result_advance)
    match.set("result_after_extra_time", result.result_after_extra_time)
    match.set("result_after_penalties", result.result_after_penalties)
    match.set("status", "finished")
    $app.saveNoValidate(match)

    // ─── Load all markets for this match ───────────────────────────
    var markets = $app.findRecordsByFilter(
        "fifa_bet_markets",
        "match = {:matchId}",
        "", 0, 0,
        { matchId: matchId }
    )

    var settings = _getFifaSettings()
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
        var line = getRecordFloat(market, "line")
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
            var outcome = _judgeBet(
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
                    if (b.getString("status") !== "pending") continue
                    var refundStake = b.getInt("stake") || 0
                    var refunded = _applyDelta(b.getString("user"), "bet_refund", refundStake, b.id, "Pool voided — refund")
                    if (refunded === null) {
                        console.log("[fifa] settle: pool void refund failed for bet " + b.id + " — leaving pending")
                        continue
                    }
                    b.set("status", "void")
                    b.set("payout", refundStake)
                    $app.saveNoValidate(b)
                    settledCount++
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
            var oddsLocked = getRecordFloat(jb.bet, "odds_locked")
            var wasPending = jb.bet.getString("status") === "pending"
            var payout = _computePayout(stake, mode, oddsLocked, jb.outcome, totalPool, totalWinningStakes, houseCutPercent)

            // Credit balance BEFORE flipping status when money moves. If credit
            // fails, leave the bet pending so a re-settle can retry
            // (match.settled is only set after this loop).
            if (wasPending && payout > 0) {
                var newBalance = _applyDelta(jb.bet.getString("user"), "bet_payout", payout, jb.bet.id, "Match settlement")
                if (newBalance === null) {
                    console.log("[fifa] settle: payout credit failed for bet " + jb.bet.id + " — leaving pending")
                    continue
                }
                totalPayout += payout
            }

            jb.bet.set("status", jb.outcome)
            jb.bet.set("payout", payout)
            $app.saveNoValidate(jb.bet)
            settledCount++
        }
    }

    // ─── Mark match as settled only when no pending bets remain ───
    var pendingRemaining = $app.findRecordsByFilter(
        "fifa_bets",
        "match = {:matchId} && status = {:pending}",
        "", 0, 0,
        { matchId: matchId, pending: "pending" }
    )
    var pendingCount = pendingRemaining.length

    if (pendingCount === 0) {
        match.set("settled", true)
        $app.saveNoValidate(match)
        _emitFeedEvent("settlement", "", matchId, "Match settled — " + settledCount + " bets processed")
        return e.json(200, {
            success: true,
            matchId: matchId,
            settledCount: settledCount,
            totalPayout: totalPayout,
            marketsProcessed: marketsProcessed,
        })
    }

    console.log("[fifa] settle: " + pendingCount + " bets still pending on match " + matchId + " — not marking settled")
    return e.json(200, {
        success: false,
        partial: true,
        matchId: matchId,
        settledCount: settledCount,
        totalPayout: totalPayout,
        marketsProcessed: marketsProcessed,
        pendingRemaining: pendingCount,
    })
  } catch (err) {
    console.log("[fifa] settle error: " + err)
    return e.json(500, { error: "Settlement failed: " + String(err) })
  }
})

// ─── Phase 8: Daily top-up cron ─────────────────────────────────────
// Runs daily at 09:00. Tops up anyone whose balance is below
// daily_topup_threshold to daily_topup_target. Idempotent: skips users who
// already received a daily_topup transaction today.
//
// "Today" is by calendar date in the DB's created timestamp, not a rolling
// 24h — so re-running on the same day is a no-op.

cronAdd("fifa-daily-topup", "0 9 * * *", function () {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }
    var _applyTransaction = function(userId, type, amount, balanceAfter, refBetId, note) {
        try {
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: amount, balance_after: balanceAfter, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            var u = $app.findRecordById("users", userId)
            u.set("balance", balanceAfter)
            $app.saveNoValidate(u)
            return balanceAfter
        } catch (err) { console.log("[fifa] applyTransaction failed: " + err); return null }
    }

    var settings = _getFifaSettings()
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

        // Idempotency: skip if already topped up today.
        // We can't filter by `created` (not a real SQLite column on this
        // collection), so we fetch today's daily_topup records for this user
        // and check in JS. At ~100 users this is fine.
        try {
            var todays = $app.findRecordsByFilter(
                "fifa_transactions",
                "user = {:uid} && type = {:type}",
                "-id",
                1, 0,
                { uid: userId, type: "daily_topup" }
            )
            if (todays.length > 0) {
                var last = todays[0]
                var lastCreated = last.getString("created") || ""
                if (lastCreated.indexOf(todayPrefix) === 0) { continue }
            }
        } catch (err) { /* no existing — proceed */ }

        var freshUser = $app.findRecordById("users", userId)
        if (!freshUser) { continue }
        var currentBalance = freshUser.getInt("balance") || 0
        var topupAmount = target - currentBalance
        if (topupAmount <= 0) { continue }

        if (_applyDelta(userId, "daily_topup", topupAmount, "", "Daily top-up") !== null) {
            toppedUp++
        }
    }

    if (toppedUp > 0) {
        _emitFeedEvent("system", "", "", toppedUp + " players received their daily top-up")
        console.log("[fifa] daily topup: " + toppedUp + " users topped up to " + target)
    }
})

// ─── Auto-void safety net cron (FIFA-GAME.md §2.3) ──────────────────
// Runs every 30 min. Voids matches whose settlement was never entered so
// stakes don't freeze forever on an admin no-show:
//   • upcoming | live  and kickoff was > auto_void_hours ago  → void
//   • finished & !settled and kickoff was > 48h ago           → void (hard net)
// Setting status='void' + voiding each market triggers the existing
// market-void refund hook (onRecordAfterUpdateSuccess on fifa_bet_markets),
// mirroring the proven pattern in fifa-espn-sync.
cronAdd("fifa-auto-void", "*/30 * * * *", function () {
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    // Inline market void — flips void=true so the market-void refund hook fires.
    var _voidMatchMarketsInline = function(matchId) {
        try {
            var markets = $app.findRecordsByFilter(
                "fifa_bet_markets",
                "match = {:matchId}",
                "", 0, 0,
                { matchId: matchId }
            )
            for (var i = 0; i < markets.length; i++) {
                var mk = markets[i]
                if (!mk.getBool("void")) {
                    mk.set("void", true)
                    mk.set("is_open", false)
                    $app.saveNoValidate(mk)
                }
            }
        } catch (err) {
            console.log("[fifa] auto-void: void markets failed for " + matchId + ": " + err)
        }
    }

    var settings = _getFifaSettings()
    if (!settings) { return }
    var autoVoidHours = settings.getInt("auto_void_hours")
    if (autoVoidHours === null || autoVoidHours === undefined || autoVoidHours <= 0) {
        autoVoidHours = 6
    }
    var nowMs = Date.now()
    var upcomingLiveCutoffMs = autoVoidHours * 60 * 60 * 1000
    var finishedCutoffMs = 48 * 60 * 60 * 1000

    var matches = []
    try {
        matches = $app.findRecordsByFilter(
            "fifa_matches",
            "status != {:void}",
            "kickoff_at",
            500, 0,
            { void: "void" }
        )
    } catch (err) {
        console.log("[fifa] auto-void: failed to list matches: " + err)
        return
    }

    var voided = 0
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i]
        var status = m.getString("status") || "upcoming"
        var kickoffStr = m.getString("kickoff_at") || ""
        if (!kickoffStr) { continue }
        var kickoffMs = new Date(kickoffStr).getTime()
        if (isNaN(kickoffMs)) { continue }
        var ageMs = nowMs - kickoffMs
        if (ageMs <= 0) { continue }

        var shouldVoid = false
        if ((status === "upcoming" || status === "live") && ageMs > upcomingLiveCutoffMs) {
            shouldVoid = true
        } else if (status === "finished" && !m.getBool("settled") && ageMs > finishedCutoffMs) {
            shouldVoid = true
        }
        if (!shouldVoid) { continue }

        try {
            m.set("status", "void")
            $app.saveNoValidate(m)
            _voidMatchMarketsInline(m.id)
            voided++
        } catch (err) {
            console.log("[fifa] auto-void: failed to void match " + m.id + ": " + err)
        }
    }

    if (voided > 0) {
        console.log("[fifa] auto-void: voided " + voided + " unsettled match(es)")
    }
})

// ─── Phase 9b: Admin balance adjust (FIFA-GAME.md §2.6) ─────────────
// POST /api/fifa/admin-adjust
// Body: { userId, amount, note }
// Admin-only. Applies a relative balance change via applyDelta, writing an
// admin_adjust ledger row. Used by the testing console to top up / deduct
// points for any player. amount can be negative (deduct).

routerAdd("POST", "/api/fifa/admin-adjust", function (e) {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            if (newBal < 0) return null
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }

    var auth = e.auth
    if (!auth) { return e.json(401, { error: "Authentication required" }) }
    var role = ""
    try { role = auth.getString("role") } catch (err) { role = "" }
    if (role !== "admin") { return e.json(403, { error: "Admin only" }) }

    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (err) { body = {} }
    }
    var userId = body.userId || ""
    var amount = Number(body.amount) || 0
    var note = body.note || "Admin adjustment"
    if (!userId) { return e.json(400, { error: "userId is required" }) }
    if (amount === 0) { return e.json(400, { error: "amount must be non-zero" }) }

    var uCheck = null
    try { uCheck = $app.findRecordById("users", userId) } catch (err) { uCheck = null }
    if (!uCheck) { return e.json(404, { error: "User not found" }) }
    if ((uCheck.getInt("balance") || 0) + amount < 0) {
        return e.json(400, { error: "Adjustment would result in negative balance" })
    }

    var newBalance = _applyDelta(userId, "admin_adjust", amount, "", note)
    if (newBalance === null) { return e.json(404, { error: "User not found" }) }
    return e.json(200, { success: true, userId: userId, newBalance: newBalance })
})

// ─── Phase 9c: Admin game reset (FIFA-GAME.md §2.6 — destructive) ───
// POST /api/fifa/admin-reset
// Body: { confirm: "RESET" }
// Admin-only. Wipes all bets, transactions, voids all matches, resets every
// user's balance to starting_balance, re-grants starting_grant transactions.
// For pre-launch testing ONLY — behind a type-to-confirm in the admin UI.

routerAdd("POST", "/api/fifa/admin-reset", function (e) {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }
    var _applyTransaction = function(userId, type, amount, balanceAfter, refBetId, note) {
        try {
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: amount, balance_after: balanceAfter, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            var u = $app.findRecordById("users", userId)
            u.set("balance", balanceAfter)
            $app.saveNoValidate(u)
            return balanceAfter
        } catch (err) { console.log("[fifa] applyTransaction failed: " + err); return null }
    }

    var auth = e.auth
    if (!auth) { return e.json(401, { error: "Authentication required" }) }
    var role = ""
    try { role = auth.getString("role") } catch (err) { role = "" }
    if (role !== "admin") { return e.json(403, { error: "Admin only" }) }

    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (err) { body = {} }
    }
    if (body.confirm !== "RESET") {
        return e.json(400, { error: 'Confirmation required — send { confirm: "RESET" }' })
    }

    
    var settings = _getFifaSettings()
    var startingBalance = settings ? (settings.getInt("starting_balance") || 0) : 0

    // 1. Delete all bets
    try {
        var allBets = $app.findRecordsByFilter("fifa_bets", "1 = 1", "", 0, 0, {})
        for (var i = 0; i < allBets.length; i++) { $app.deleteRecord(allBets[i]) }
    } catch (err) { console.log("[fifa] reset: bets delete failed: " + err) }

    // 2. Delete all transactions
    try {
        var allTx = $app.findRecordsByFilter("fifa_transactions", "1 = 1", "", 0, 0, {})
        for (var j = 0; j < allTx.length; j++) { $app.deleteRecord(allTx[j]) }
    } catch (err) { console.log("[fifa] reset: tx delete failed: " + err) }

    // 2b. Delete feed events (legacy) and clear raffle result on settings
    try {
        var allFeed = $app.findRecordsByFilter("fifa_feed_events", "1 = 1", "", 0, 0, {})
        for (var fi = 0; fi < allFeed.length; fi++) { $app.deleteRecord(allFeed[fi]) }
    } catch (err) { console.log("[fifa] reset: feed delete failed: " + err) }
    if (settings) {
        try {
            settings.set("raffle_drawn_at", "")
            settings.set("raffle_winner", "")
            settings.set("raffle_seed", "")
            settings.set("raffle_entries_snapshot", null)
            $app.saveNoValidate(settings)
        } catch (err) { console.log("[fifa] reset: raffle settings clear failed: " + err) }
    }

    // 3. Void all matches + clear results
    try {
        var allMatches = $app.findRecordsByFilter("fifa_matches", "1 = 1", "", 0, 0, {})
        for (var k = 0; k < allMatches.length; k++) {
            var m = allMatches[k]
            m.set("status", "upcoming")
            m.set("settled", false)
            m.set("result_winner", "")
            m.set("result_home_goals", 0)
            m.set("result_away_goals", 0)
            m.set("result_scorers", [])
            m.set("result_yellow_cards", 0)
            m.set("result_red_cards", 0)
            m.set("result_home_clean_sheet", false)
            m.set("result_away_clean_sheet", false)
            m.set("result_advance", "")
            m.set("result_after_extra_time", false)
            m.set("result_after_penalties", false)
            $app.saveNoValidate(m)
        }
    } catch (err) { console.log("[fifa] reset: matches reset failed: " + err) }

    // 4. Close + un-void all markets, reset pool counters
    try {
        var allMarkets = $app.findRecordsByFilter("fifa_bet_markets", "1 = 1", "", 0, 0, {})
        for (var mi = 0; mi < allMarkets.length; mi++) {
            var mk = allMarkets[mi]
            mk.set("void", false)
            mk.set("is_open", false)
            mk.set("pool_total", 0)
            mk.set("pool_by_option", {})
            $app.saveNoValidate(mk)
        }
    } catch (err) { console.log("[fifa] reset: markets reset failed: " + err) }

    // 5. Reset every user's balance to starting_balance + write a fresh grant
    try {
        var allUsers = $app.findRecordsByFilter("users", "1 = 1", "", 0, 0, {})
        for (var ui = 0; ui < allUsers.length; ui++) {
            var user = allUsers[ui]
            user.set("balance", startingBalance)
            $app.saveNoValidate(user)
            _applyTransaction(user.id, "starting_grant", startingBalance, startingBalance, "", "Game reset — fresh starting grant")
        }
    } catch (err) { console.log("[fifa] reset: user balance reset failed: " + err) }

    _emitFeedEvent("system", "", "", "Game has been reset by admin")
    return e.json(200, { success: true, message: "Game reset complete" })
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
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }

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

    var settings = _getFifaSettings()
    if (!settings) {
        return e.json(400, { error: "Game not configured" })
    }
    var drawnAt = settings.getString("raffle_drawn_at") || ""
    if (drawnAt) {
        return e.json(400, { error: "Raffle already drawn" })
    }
    // Settings record exists (checked above) — trust its stored values
    // verbatim, including 0, rather than silently overriding an
    // intentional zero with a hardcoded default.
    var base = settings.getInt("raffle_tickets_base")
    var decay = settings.getInt("raffle_tickets_decay")
    var minBets = settings.getInt("raffle_active_participant_min_bets")

    // ─── Build leaderboard (ranked by balance desc, tiebreak bets_count) ─
    // Mirrors the /api/fifa/leaderboard route so raffle rank == leaderboard
    // rank (FIFA-GAME.md §2.4).
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

    // Compute bets_count for each user, then sort by (balance, bets_count).
    var candidates = []
    for (var i = 0; i < users.length; i++) {
        var u = users[i]
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
        candidates.push({
            id: u.id,
            display_name: displayName(u),
            balance: u.getInt("balance") || 0,
            bets_count: betCount,
        })
    }
    candidates.sort(function (a, b) {
        if (b.balance !== a.balance) return b.balance - a.balance
        return b.bets_count - a.bets_count
    })

    // ─── Build ticket list ─────────────────────────────────────────
    // Each entry: { user_id, display_name, rank, tickets, bets_count }
    // Assign ranks with competition ranking (ties share a rank).
    var entries = []
    var totalTickets = 0
    var lastBalance = null
    var lastBets = null
    var rank = 0
    for (var j = 0; j < candidates.length; j++) {
        var c = candidates[j]
        if (c.balance !== lastBalance || c.bets_count !== lastBets) {
            rank = j + 1
            lastBalance = c.balance
            lastBets = c.bets_count
        }
        if (c.bets_count < minBets) { continue }

        var tickets = Math.max(1, base - decay * (rank - 1))
        entries.push({
            user_id: c.id,
            display_name: c.display_name,
            rank: rank,
            tickets: tickets,
            bets_count: c.bets_count,
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

    // ─── Store the draw on fifa_settings (one-time) ────────────────
    try {
        var snapshot = {
            total_tickets: totalTickets,
            winning_pick: pick,
            entries: entries,
        }
        settings.set("raffle_drawn_at", new Date().toISOString())
        settings.set("raffle_winner", winner.user_id)
        settings.set("raffle_seed", seed)
        settings.set("raffle_entries_snapshot", snapshot)
        $app.saveNoValidate(settings)

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
            seed: seed,
        })
    } catch (err) {
        console.log("[fifa] raffle draw failed: " + err)
        return e.json(500, { error: "Failed to store raffle draw" })
    }
})

// ─── PR2: ESPN sync + auto-settle cron (FIFA-AUTOMATION.md) ─────────
// Polls ESPN scoreboard every 2 min, patches match lifecycle, and optionally
// auto-settles after settle_delay_minutes when auto_settle_enabled is true.
cronAdd("fifa-espn-sync", "*/2 * * * *", function () {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var _getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }
    var _normalizeTeam = function(name) {
        return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    }
    var _mapEspnStatus = function(state, statusName) {
        var name = String(statusName || "").toUpperCase()
        if (name.indexOf("CANCEL") !== -1 || name.indexOf("POSTPON") !== -1 || name.indexOf("SUSPEND") !== -1 || name.indexOf("DELAYED") !== -1) {
            return "void"
        }
        var s = String(state || "pre").toLowerCase()
        if (s === "in") return "live"
        if (s === "post") return "finished"
        if (s === "canceled" || s === "cancelled" || s === "postponed") return "void"
        return "upcoming"
    }
    var _numOrZero = function(v) {
        var n = Number(v)
        return isNaN(n) ? 0 : n
    }
    var _parseEspnEvent = function(raw) {
        if (!raw || typeof raw !== "object") return null
        var rec = raw
        var competitions = rec.competitions
        if (!competitions || typeof competitions.length !== "number" || competitions.length < 1) return null
        var comp = competitions[0]
        if (!comp || typeof comp !== "object") return null
        var competitors = comp.competitors
        if (!competitors || typeof competitors.length !== "number" || competitors.length < 2) return null
        var home = null
        var away = null
        for (var ci = 0; ci < competitors.length; ci++) {
            if (competitors[ci].homeAway === "home") home = competitors[ci]
            if (competitors[ci].homeAway === "away") away = competitors[ci]
        }
        if (!home || !away) return null
        var homeTeamObj = home.team || {}
        var awayTeamObj = away.team || {}
        var status = comp.status || {}
        var statusType = status.type || {}
        var statusState = String(statusType.state || "pre")
        var statusName = statusType.name ? String(statusType.name) : ""
        var mapped = _mapEspnStatus(statusState, statusName)
        return {
            id: String(rec.id || ""),
            homeTeam: String(homeTeamObj.displayName || homeTeamObj.name || homeTeamObj.abbreviation || ""),
            awayTeam: String(awayTeamObj.displayName || awayTeamObj.name || awayTeamObj.abbreviation || ""),
            homeGoals: mapped === "upcoming" ? null : _numOrZero(home.score),
            awayGoals: mapped === "upcoming" ? null : _numOrZero(away.score),
            statusState: statusState,
            statusName: statusName,
            mappedStatus: mapped,
        }
    }
    var _findEventForMatch = function(match, events) {
        var externalIds = parseJsonField(match.get("external_ids")) || {}
        var espnId = externalIds.espn ? String(externalIds.espn) : ""
        if (espnId) {
            for (var i = 0; i < events.length; i++) {
                if (events[i].id === espnId) return events[i]
            }
        }
        var mh = _normalizeTeam(match.getString("team_home"))
        var ma = _normalizeTeam(match.getString("team_away"))
        for (var j = 0; j < events.length; j++) {
            var ev = events[j]
            var eh = _normalizeTeam(ev.homeTeam)
            var ea = _normalizeTeam(ev.awayTeam)
            if ((mh === eh && ma === ea) || (mh === ea && ma === eh)) return ev
        }
        return null
    }
    var _shouldPollMatch = function(matchRec, nowMs) {
        var status = matchRec.getString("status") || "upcoming"
        if (status === "void") return false
        if (status === "live") return true
        if (status === "finished" && !matchRec.getBool("settled")) return true
        var kickoffStr = matchRec.getString("kickoff_at") || ""
        if (!kickoffStr) return false
        var kickoffMs = new Date(kickoffStr).getTime()
        if (isNaN(kickoffMs)) return false
        return Math.abs(nowMs - kickoffMs) <= 2 * 60 * 60 * 1000
    }
    var _buildSettlePayload = function(matchRec, ev) {
        var mh = _normalizeTeam(matchRec.getString("team_home"))
        var ma = _normalizeTeam(matchRec.getString("team_away"))
        var eh = _normalizeTeam(ev.homeTeam)
        var ea = _normalizeTeam(ev.awayTeam)
        var homeGoals = ev.homeGoals !== null && ev.homeGoals !== undefined ? ev.homeGoals : 0
        var awayGoals = ev.awayGoals !== null && ev.awayGoals !== undefined ? ev.awayGoals : 0
        if (mh === ea && ma === eh) {
            homeGoals = ev.awayGoals !== null && ev.awayGoals !== undefined ? ev.awayGoals : 0
            awayGoals = ev.homeGoals !== null && ev.homeGoals !== undefined ? ev.homeGoals : 0
        }
        var resultWinner = "draw"
        if (homeGoals > awayGoals) resultWinner = "home"
        else if (awayGoals > homeGoals) resultWinner = "away"
        return {
            result_winner: resultWinner,
            result_home_goals: homeGoals,
            result_away_goals: awayGoals,
            result_scorers: [],
            result_yellow_cards: 0,
            result_red_cards: 0,
            result_home_clean_sheet: awayGoals === 0,
            result_away_clean_sheet: homeGoals === 0,
            result_advance: resultWinner !== "draw" ? resultWinner : "",
        }
    }
    var _closeMatchMarkets = function(matchId) {
        try {
            var markets = $app.findRecordsByFilter(
                "fifa_bet_markets",
                "match = {:matchId}",
                "", 0, 0,
                { matchId: matchId }
            )
            for (var i = 0; i < markets.length; i++) {
                var mk = markets[i]
                if (mk.getBool("is_open")) {
                    mk.set("is_open", false)
                    $app.saveNoValidate(mk)
                }
            }
        } catch (err) {
            console.log("[fifa] espn-sync: close markets failed for " + matchId + ": " + err)
        }
    }
    var _voidMatchMarketsInline = function(matchId) {
        try {
            var markets = $app.findRecordsByFilter(
                "fifa_bet_markets",
                "match = {:matchId}",
                "", 0, 0,
                { matchId: matchId }
            )
            for (var i = 0; i < markets.length; i++) {
                var mk = markets[i]
                if (!mk.getBool("void")) {
                    mk.set("void", true)
                    mk.set("is_open", false)
                    $app.saveNoValidate(mk)
                }
            }
        } catch (err) {
            console.log("[fifa] espn-sync: void markets failed for " + matchId + ": " + err)
        }
    }
    var _applyDelta = function(userId, type, delta, refBetId, note) {
        try {
            var u = $app.findRecordById("users", userId)
            if (!u) return null
            var newBal = (u.getInt("balance") || 0) + delta
            var txCol = $app.findCollectionByNameOrId("fifa_transactions")
            var tx = new Record(txCol, { user: userId, type: type, amount: delta, balance_after: newBal, ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString() })
            $app.saveNoValidate(tx)
            u.set("balance", newBal)
            $app.saveNoValidate(u)
            return newBal
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Feed removed from product (FIFA-AUTOMATION.md PR1) — no-op.
    }
    var _judgeBet = function(selection, status, marketType, line, result, customWinners) {
        if (status === "won" || status === "lost" || status === "void") { return status }
        switch (marketType) {
            case "match_winner": {
                var winner = result.result_advance || result.result_winner
                if (!winner || winner === "draw") return "void"
                return selection === winner ? "won" : "lost"
            }
            case "total_goals_ou": {
                var total = (result.result_home_goals || 0) + (result.result_away_goals || 0)
                if (selection === "over") { if (total > line) return "won"; if (total < line) return "lost"; return "void" }
                if (selection === "under") { if (total < line) return "won"; if (total > line) return "lost"; return "void" }
                return "lost"
            }
            case "correct_score": {
                var expected = (result.result_home_goals || 0) + "-" + (result.result_away_goals || 0)
                return selection === expected ? "won" : "lost"
            }
            case "any_scorer": {
                var scorers = result.result_scorers || []
                if (scorers.length === 0) return "void"
                return scorers.indexOf(selection) !== -1 ? "won" : "lost"
            }
            case "cards_ou": {
                var cards = (result.result_yellow_cards || 0) + (result.result_red_cards || 0)
                if (selection === "over") { if (cards > line) return "won"; if (cards < line) return "lost"; return "void" }
                if (selection === "under") { if (cards < line) return "won"; if (cards > line) return "lost"; return "void" }
                return "lost"
            }
            case "clean_sheet": {
                var homeClean = (result.result_away_goals || 0) === 0
                var awayClean = (result.result_home_goals || 0) === 0
                if (selection === "home") return homeClean ? "won" : "lost"
                if (selection === "away") return awayClean ? "won" : "lost"
                return "lost"
            }
            case "custom": {
                if (!customWinners || customWinners.length === 0) return "void"
                return customWinners.indexOf(selection) !== -1 ? "won" : "lost"
            }
            default: return "void"
        }
    }
    var _computePayout = function(stake, mode, oddsLocked, outcome, totalPool, totalWinningStakes, houseCutPercent) {
        if (outcome === "lost") return 0
        if (outcome === "void") return stake
        if (mode === "fixed") { return Math.round(stake * oddsLocked) }
        if (totalWinningStakes <= 0) return 0
        var cut = houseCutPercent / 100
        var pool = totalPool * (1 - cut)
        return Math.round((stake / totalWinningStakes) * pool)
    }
    var _shouldAutoSettle = function(matchRec, settingsRec, nowMs) {
        if (!settingsRec.getBool("auto_settle_enabled")) return false
        if ((matchRec.getString("status") || "") !== "finished") return false
        if (matchRec.getBool("settled")) return false
        var autoAtStr = matchRec.getString("auto_settle_at") || ""
        if (!autoAtStr) return false
        var autoAtMs = new Date(autoAtStr).getTime()
        if (isNaN(autoAtMs) || autoAtMs > nowMs) return false
        var winner = matchRec.getString("result_winner") || ""
        if (!winner) return false
        if (matchRec.getString("result_home_goals") === "" || matchRec.getString("result_away_goals") === "") return false
        if (winner === "draw" && !(matchRec.getString("result_advance") || "")) return false
        return true
    }
    var _settleMatchFromRecord = function(matchRec, settingsRec) {
        var matchId = matchRec.id
        if (matchRec.getBool("settled")) return false

        var result = {
            result_winner: matchRec.getString("result_winner") || "",
            result_home_goals: matchRec.getInt("result_home_goals") || 0,
            result_away_goals: matchRec.getInt("result_away_goals") || 0,
            result_scorers: parseJsonField(matchRec.get("result_scorers")) || [],
            result_yellow_cards: matchRec.getInt("result_yellow_cards") || 0,
            result_red_cards: matchRec.getInt("result_red_cards") || 0,
            result_home_clean_sheet: matchRec.getBool("result_home_clean_sheet"),
            result_away_clean_sheet: matchRec.getBool("result_away_clean_sheet"),
            result_advance: matchRec.getString("result_advance") || "",
            result_after_extra_time: matchRec.getBool("result_after_extra_time"),
            result_after_penalties: matchRec.getBool("result_after_penalties"),
        }
        if (!result.result_advance && result.result_winner && result.result_winner !== "draw") {
            result.result_advance = result.result_winner
        }

        var markets = $app.findRecordsByFilter(
            "fifa_bet_markets",
            "match = {:matchId}",
            "", 0, 0,
            { matchId: matchId }
        )
        var houseCutPercent = settingsRec.getInt("pool_house_cut_percent") || 0
        var settledCount = 0

        // ESPN scoreboard only yields the reliable 90-min score — it carries NO
        // scorer list and NO card counts. Auto-settling scorer/cards/custom
        // markets from that thin snapshot would void every scorer bet and
        // settle cards against a phantom 0, paying out the wrong side. So the
        // ESPN cron only settles markets fully determined by the score; the
        // rest stay pending for the admin. Because those bets remain pending,
        // the match is NOT marked settled and admin settlement finishes it.
        var AUTO_SETTLE_TYPES = { match_winner: true, correct_score: true, total_goals_ou: true, clean_sheet: true }
        for (var mi = 0; mi < markets.length; mi++) {
            var market = markets[mi]
            var marketId = market.id
            var marketType = market.getString("market_type") || ""
            var marketMode = market.getString("mode") || "pool"
            var line = getRecordFloat(market, "line")
            if (market.getBool("void")) continue
            if (!AUTO_SETTLE_TYPES[marketType]) continue

            var bets = $app.findRecordsByFilter(
                "fifa_bets",
                "market = {:marketId}",
                "", 0, 0,
                { marketId: marketId }
            )

            var judged = []
            for (var bi = 0; bi < bets.length; bi++) {
                var bet = bets[bi]
                var outcome = _judgeBet(
                    bet.getString("selection"),
                    bet.getString("status"),
                    marketType,
                    line,
                    result,
                    []
                )
                judged.push({ bet: bet, outcome: outcome })
            }

            if (marketMode === "pool" && judged.length > 0) {
                var anyWinner = false
                for (var j = 0; j < judged.length; j++) {
                    if (judged[j].outcome === "won") { anyWinner = true; break }
                }
                if (!anyWinner) {
                    for (var k = 0; k < judged.length; k++) {
                        var b = judged[k].bet
                        if (b.getString("status") !== "pending") continue
                        var refundStake = b.getInt("stake") || 0
                        var refunded = _applyDelta(b.getString("user"), "bet_refund", refundStake, b.id, "Pool voided — refund")
                        if (refunded === null) continue
                        b.set("status", "void")
                        b.set("payout", refundStake)
                        $app.saveNoValidate(b)
                        settledCount++
                    }
                    continue
                }
            }

            var totalPool = 0
            var totalWinningStakes = 0
            for (var j2 = 0; j2 < judged.length; j2++) {
                totalPool += judged[j2].bet.getInt("stake") || 0
                if (judged[j2].outcome === "won") {
                    totalWinningStakes += judged[j2].bet.getInt("stake") || 0
                }
            }

            for (var j3 = 0; j3 < judged.length; j3++) {
                var jb = judged[j3]
                var stake = jb.bet.getInt("stake") || 0
                var mode = jb.bet.getString("mode") || "pool"
                var oddsLocked = getRecordFloat(jb.bet, "odds_locked")
                var wasPending = jb.bet.getString("status") === "pending"
                var payout = _computePayout(stake, mode, oddsLocked, jb.outcome, totalPool, totalWinningStakes, houseCutPercent)

                if (wasPending && payout > 0) {
                    var newBalance = _applyDelta(jb.bet.getString("user"), "bet_payout", payout, jb.bet.id, "Auto-settlement")
                    if (newBalance === null) continue
                }

                jb.bet.set("status", jb.outcome)
                jb.bet.set("payout", payout)
                $app.saveNoValidate(jb.bet)
                settledCount++
            }
        }

        var pendingRemaining = $app.findRecordsByFilter(
            "fifa_bets",
            "match = {:matchId} && status = {:pending}",
            "", 0, 0,
            { matchId: matchId, pending: "pending" }
        )
        if (pendingRemaining.length === 0) {
            matchRec.set("settled", true)
            $app.saveNoValidate(matchRec)
            _emitFeedEvent("settlement", "", matchId, "Match auto-settled — " + settledCount + " bets processed")
            return true
        }
        return false
    }

    var settings = _getFifaSettings()
    if (!settings) { return }

    var nowMs = Date.now()
    var settleDelayMinutes = settings.getInt("settle_delay_minutes")
    if (settleDelayMinutes === null || settleDelayMinutes === undefined || settleDelayMinutes < 0) {
        settleDelayMinutes = 15
    }

    // Auto-settle pass (1st: process matches whose delay has expired)
    var toSettle = []
    try {
        toSettle = $app.findRecordsByFilter(
            "fifa_matches",
            "status = {:finished} && settled = {:false}",
            "kickoff_at",
            500, 0,
            { finished: "finished", false: false }
        )
    } catch (err) {
        console.log("[fifa] espn-sync: auto-settle list failed: " + err)
    }
    for (var ai = 0; ai < toSettle.length; ai++) {
        var candidate = toSettle[ai]
        try {
            if (!_shouldAutoSettle(candidate, settings, nowMs)) { continue }
            _settleMatchFromRecord(candidate, settings)
        } catch (err) {
            console.log("[fifa] espn-sync: auto-settle failed for " + candidate.id + ": " + err)
        }
    }

    var allMatches = []
    try {
        allMatches = $app.findRecordsByFilter(
            "fifa_matches",
            "status != {:void}",
            "kickoff_at",
            500, 0,
            { void: "void" }
        )
    } catch (err) {
        console.log("[fifa] espn-sync: failed to list matches: " + err)
        return
    }

    var pollMatches = []
    var hasUnsettledFinished = false
    for (var mi = 0; mi < allMatches.length; mi++) {
        var m = allMatches[mi]
        if (_shouldPollMatch(m, nowMs)) pollMatches.push(m)
        if ((m.getString("status") || "") === "finished" && !m.getBool("settled")) {
            hasUnsettledFinished = true
        }
    }

    if (pollMatches.length === 0 && !hasUnsettledFinished) { return }

    // Fetch ESPN scoreboard (primary fifa.world, fallback fifa.worldq.uefa).
    var espnEvents = []
    var leagues = ["fifa.world", "fifa.worldq.uefa"]
    for (var li = 0; li < leagues.length; li++) {
        try {
            var resp = $http.send({
                url: "https://site.api.espn.com/apis/site/v2/sports/soccer/" + leagues[li] + "/scoreboard",
                method: "GET",
                headers: { "Accept": "application/json" },
                timeout: 30,
            })
            if (resp.statusCode !== 200) { continue }
            var body = resp.raw
            if (!body) { continue }
            var data = JSON.parse(body)
            var rawEvents = data.events
            if (!rawEvents || typeof rawEvents.length !== "number" || rawEvents.length === 0) { continue }
            for (var ei = 0; ei < rawEvents.length; ei++) {
                var parsed = _parseEspnEvent(rawEvents[ei])
                if (parsed) espnEvents.push(parsed)
            }
            if (espnEvents.length > 0) { break }
        } catch (ex) {
            console.log("[fifa] espn-sync: fetch failed for " + leagues[li] + ": " + ex)
        }
    }

    // Apply ESPN lifecycle transitions for polled matches.
    for (var pi = 0; pi < pollMatches.length; pi++) {
        var match = pollMatches[pi]
        var ev = _findEventForMatch(match, espnEvents)
        if (!ev) { continue }

        var currentStatus = match.getString("status") || "upcoming"
        var mapped = ev.mappedStatus

        if (mapped === "void" && currentStatus !== "void") {
            match.set("status", "void")
            $app.saveNoValidate(match)
            _voidMatchMarketsInline(match.id)
            continue
        }

        if (mapped === "live" && currentStatus !== "live" && currentStatus !== "finished") {
            match.set("status", "live")
            $app.saveNoValidate(match)
            _closeMatchMarkets(match.id)
            continue
        }

        if (mapped === "finished" && currentStatus !== "finished" && currentStatus !== "void") {
            var payload = _buildSettlePayload(match, ev)
            match.set("status", "finished")
            match.set("result_winner", payload.result_winner)
            match.set("result_home_goals", payload.result_home_goals)
            match.set("result_away_goals", payload.result_away_goals)
            match.set("result_scorers", payload.result_scorers)
            match.set("result_yellow_cards", payload.result_yellow_cards)
            match.set("result_red_cards", payload.result_red_cards)
            match.set("result_home_clean_sheet", payload.result_home_clean_sheet)
            match.set("result_away_clean_sheet", payload.result_away_clean_sheet)
            match.set("result_advance", payload.result_advance)
            if (!match.getString("auto_settle_at")) {
                var delayMs = settleDelayMinutes * 60 * 1000
                match.set("auto_settle_at", new Date(nowMs + delayMs).toISOString())
            }
            $app.saveNoValidate(match)
            _closeMatchMarkets(match.id)
        }
    }
})

