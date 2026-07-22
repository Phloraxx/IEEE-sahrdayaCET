/// <reference path="../pb_data/types.d.ts" />

// ─── FIFA WC Predict '26 — game logic hooks ─────────────────────────
// All balance-affecting logic runs server-side here, never trusting client-
// submitted values for stake validation, payout, or balance. Mirrors the
// pattern in registrations.pb.js: hooks enforce invariants at the DB layer
// with direct $app access; browser clients use PocketBase rules and the
// dedicated command routes below for sensitive mutations.
//
// Sections (added incrementally per phase):
//   Phase 2 — starting grant on user create + settings singleton guard
//   Phase 4 — bet create (validate, deduct, transaction, pool bump)
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
// Sets display_name from the Google profile at first sign-in (or backfills if
// still empty on a later OAuth login). Names are not user-editable afterward.

onRecordAuthWithOAuth2Request(function (e) {
    var name = ""
    if (e.oAuth2User) {
        name = e.oAuth2User.name || (e.oAuth2User.rawUser && e.oAuth2User.rawUser.name) || ""
    }
    if (!name) { e.next(); return }

    // e.record is null on first OAuth signup — use createData instead.
    // Always mirror Google name into display_name so both fields stay aligned.
    if (e.record) {
        e.record.set("display_name", name)
    } else if (e.createData) {
        e.createData.display_name = name
    }
    e.next()
}, "users")

// Block self-service display_name changes — names come from Google OAuth only.
onRecordUpdateRequest(function (e) {
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (ex) { auth = null }
    var role = ""
    if (auth) {
        try {
            if (auth.isSuperuser && auth.isSuperuser()) {
                role = "admin"
            } else {
                role = auth.getString("role") || ""
            }
        } catch (ex) { role = "" }
    }
    if (role === "admin") { e.next(); return }
    var oldRec = $app.findRecordById("users", e.record.id)
    var oldDisplay = oldRec.getString("display_name") || ""
    var newDisplay = e.record.getString("display_name") || ""
    if (oldDisplay !== newDisplay) {
        throw e.badRequestError("Display name cannot be changed")
    }
    var oldGoogle = oldRec.getString("name") || ""
    var newGoogle = e.record.getString("name") || ""
    if (oldGoogle !== newGoogle) {
        throw e.badRequestError("Name cannot be changed")
    }
    e.next()
}, "users")

// ─── Phase 2: Starting grant on user create ─────────────────────────
// Fires AFTER a new user is committed. Reads starting_balance from settings,
// sets the user's balance, and writes a starting_grant transaction. Skips
// silently if settings is not seeded yet.

onRecordAfterCreateSuccess(function (e) {
    // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
    var getFifaSettings = function() {
        try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
    }

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
        // Settings not seeded yet; user balance remains unchanged.
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

    e.next()
}, "users")

// ─── Phase 2: Settings singleton guard ──────────────────────────────
// Rejects creation of a second fifa_settings row. The baseline migration
// creates the singleton; admins edit that record.

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

// Raffle evidence is written only by the raffle command. Ordinary settings
// edits may change configuration, but cannot rewrite the recorded draw.
onRecordUpdateRequest(function (e) {
    var old = $app.findRecordById("fifa_settings", e.record.id)
    var auditFields = ["raffle_drawn_at", "raffle_winner", "raffle_seed", "raffle_entries_snapshot"]
    for (var i = 0; i < auditFields.length; i++) {
        var field = auditFields[i]
        if (JSON.stringify(old.get(field) || null) !== JSON.stringify(e.record.get(field) || null)) {
            throw e.badRequestError("Raffle audit fields are managed by the raffle command")
        }
    }
    e.next()
}, "fifa_settings")

// ─── Phase 4: Bet placement ──────────────────────────────────────────
// Bet creation moved to POST /api/fifa/bets in fifa-bets.pb.js.
// The command performs bet + balance + ledger + pool writes atomically.
// Direct collection creates are locked by migration rules.

// ─── Phase 4c: Financial void commands ──────────────────────────────
// Market and match void/refund operations are atomic custom commands in
// fifa-void.pb.js. Ordinary CRUD never owns wallet mutations.

// ─── Phase 5: Public custom routes ──────────────────────────────────
// Leaderboard/stats routes. These bypass collection API rules (users.listRule
// is self+admin, so a public leaderboard can't read users via REST) using
// internal $app access — same bypass pattern as coupons.pb.js.

// GET /api/fifa/leaderboard — ranked list of players by balance desc.
// Returns [{rank, id, display_name, balance, bets_count}]. No PII (no email).
// Polled by the client every ~15s (SSE can't fire on a custom route).
routerAdd("GET", "/api/fifa/leaderboard", function (e) {
    try {
        // ─── Inlined helpers (PB 0.39 goja doesn't share top-level scope with callbacks) ───
        var _getFifaSettings = function() {
            try { return $app.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (ex) { return null }
        }
        var _displayName = function(user) {
            var google = user.getString("name")
            if (google) return google
            var legacy = user.getString("display_name")
            if (legacy) return legacy
            var shortId = user.id.length >= 4 ? user.id.slice(-4) : user.id
            return "Player " + shortId
        }
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
            var dName = _displayName(u)
            // Count the user's non-void bets (voided/refunded bets don't count
            // toward raffle eligibility — matches the dashboard's progress
            // math). limit=0 means no limit in PB's findRecordsByFilter, so
            // .length is the true count. At ~100 players this is fine; would
            // denormalize into a counter at scale.
            var betCount = 0
            try {
                var allUserBets = $app.findRecordsByFilter(
                    "fifa_bets",
                    "user = {:uid} && status != {:void}",
                    "", 0, 0,
                    { uid: u.id, void: "void" }
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
        var settings = _getFifaSettings()
        // Defaults only apply when no fifa_settings record exists at all —
        // once a record exists, trust its stored values verbatim (0 is a
        // valid, intentional config, e.g. no minimum-bets requirement).
        // min_bets default of 5 matches the documented design value
        // (FIFA-GAME.md §2.4, seeded by scripts/migrate-game-backfill.ts) —
        // keep it in sync with the /api/fifa/raffle draw route's own
        // no-settings behavior below.
        var minBets = 5
        if (settings) {
            var minBetsRaw = settings.get("raffle_active_participant_min_bets")
            if (minBetsRaw != null && minBetsRaw !== "") {
                var parsed = settings.getInt("raffle_active_participant_min_bets")
                if (parsed > 0) minBets = parsed
            }
        }
        return e.json(200, {
            leaderboard: ranked,
            settings: {
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


// ─── Phase 7: Settlement ────────────────────────────────────────────
// Implemented atomically in fifa-settlement.pb.js.

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
        var nextBalance = null
        try {
            $app.runInTransaction(function (txApp) {
                var u = txApp.findRecordById("users", userId)
                var newBal = (u.getInt("balance") || 0) + delta
                if (newBal < 0) throw new Error("Negative balance")
                u.set("balance", newBal)
                txApp.saveNoValidate(u)
                var tx = new Record(txApp.findCollectionByNameOrId("fifa_transactions"), {
                    user: userId, type: type, amount: delta, balance_after: newBal,
                    ref_bet: refBetId || "", note: note || "", timestamp: new Date().toISOString()
                })
                txApp.saveNoValidate(tx)
                nextBalance = newBal
            })
        } catch (err) { console.log("[fifa] applyDelta failed: " + err); return null }
        return nextBalance
    }
    var _emitFeedEvent = function(type, userId, matchId, message) {
        // Activity emission is intentionally disabled for this path.
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

        // Idempotency: skip if already topped up today. Sort by the hook-set
        // `timestamp` field — PB record ids are random, NOT monotonic, so
        // "-id" would return an arbitrary top-up row, not the latest one.
        try {
            var todays = $app.findRecordsByFilter(
                "fifa_transactions",
                "user = {:uid} && type = {:type}",
                "-timestamp",
                1, 0,
                { uid: userId, type: "daily_topup" }
            )
            if (todays.length > 0) {
                var last = todays[0]
                var lastStamp = last.getString("timestamp") || last.getString("created") || ""
                if (lastStamp.indexOf(todayPrefix) === 0) { continue }
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
        console.log("[fifa] daily topup: " + toppedUp + " users topped up to " + target)
    }
})

// Automatic financial voiding intentionally disabled.
// Live scores are read from /api/fifa/live-scores. Refunds only happen via
// the atomic admin market/match void commands in fifa-void.pb.js.

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
    var _displayName = function(user) {
        var google = user.getString("name")
        if (google) return google
        var legacy = user.getString("display_name")
        if (legacy) return legacy
        var shortId = user.id.length >= 4 ? user.id.slice(-4) : user.id
        return "Player " + shortId
    }
    var candidates = []
    for (var i = 0; i < users.length; i++) {
        var u = users[i]
        // Non-void bets only — mirrors the leaderboard route so raffle
        // eligibility (min_bets) matches what players see.
        var betCount = 0
        try {
            var bets = $app.findRecordsByFilter(
                "fifa_bets",
                "user = {:uid} && status != {:void}",
                "", 0, 0,
                { uid: u.id, void: "void" }
            )
            betCount = bets.length
        } catch (err) { betCount = 0 }
        candidates.push({
            id: u.id,
            display_name: _displayName(u),
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
    // PocketBase's security RNG supplies the entropy. Fold the random token
    // into the ticket range and persist it with the snapshot for audit.
    var seed = $security.randomString(32)
    var pick = 0
    for (var si = 0; si < seed.length; si++) {
        pick = (pick * 131 + seed.charCodeAt(si)) % totalTickets
    }
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
                bets_count: winner.bets_count,
            },
            totalTickets: totalTickets,
            totalEntries: entries.length,
            seed: seed,
            drawn_at: settings.getString("raffle_drawn_at"),
            entries_snapshot: snapshot,
        })
    } catch (err) {
        console.log("[fifa] raffle draw failed: " + err)
        return e.json(500, { error: "Failed to store raffle draw" })
    }
})

// ESPN database synchronization and auto-settlement were removed.
// /api/fifa/live-scores provides live display data; financial settlement is
// always the explicit atomic /api/fifa/settle command.
