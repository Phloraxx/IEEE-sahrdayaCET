/// <reference path="../pb_data/types.d.ts" />

// Atomic bet placement command. Direct fifa_bets creates are locked at the
// collection-rule layer; all economy writes happen in one SQLite transaction.
routerAdd(
  "POST",
  "/api/fifa/bets",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

    var body = {}
    try { body = e.requestInfo().body || {} } catch (_) { body = {} }
    var matchId = String(body.match || "")
    var marketId = String(body.market || "")
    var selection = String(body.selection || "")
    var stake = Number(body.stake || 0)

    if (!matchId || !marketId || !selection || !isFinite(stake) || stake <= 0 || Math.floor(stake) !== stake) {
      return e.json(400, { error: "Invalid bet" })
    }

    var result = null
    try {
      $app.runInTransaction(function (txApp) {
        var parseJson = function(raw) {
          if (!raw) return null
          if (typeof raw === "string") { try { return JSON.parse(raw) } catch (_) { return null } }
          if (typeof raw === "object" && typeof raw.length === "number") {
            if (raw.length > 0 && typeof raw[0] === "number") {
              try {
                var str = ""
                for (var i = 0; i < raw.length; i++) str += String.fromCharCode(raw[i])
                return JSON.parse(str)
              } catch (_) { return null }
            }
            return raw
          }
          if (typeof raw === "object") return raw
          return null
        }

        var settings
        try { settings = txApp.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) }
        catch (_) { throw new BadRequestError("Game not configured") }
        if (!settings.getBool("registration_open")) throw new BadRequestError("Registration is closed")

        var market
        try { market = txApp.findRecordById("fifa_bet_markets", marketId) }
        catch (_) { throw new BadRequestError("Market not found") }
        var match
        try { match = txApp.findRecordById("fifa_matches", matchId) }
        catch (_) { throw new BadRequestError("Match not found") }
        if (market.getString("match") !== matchId) throw new BadRequestError("Market does not belong to this match")
        if (!market.getBool("is_open") || market.getBool("void")) throw new BadRequestError("Market is closed")

        var matchStatus = match.getString("status") || "upcoming"
        if (matchStatus !== "upcoming") throw new BadRequestError("Betting is closed for this match")
        var locksAt = match.getString("betting_locks_at") || match.getString("kickoff_at")
        if (locksAt && new Date(locksAt) <= new Date()) throw new BadRequestError("Betting is closed for this market")

        var options = parseJson(market.get("options")) || []
        var marketType = market.getString("market_type") || ""
        if (marketType !== "custom" && (!options || options.length === 0)) {
          throw new BadRequestError("Market has no valid options configured")
        }
        if (options && options.length > 0) {
          var valid = false
          for (var oi = 0; oi < options.length; oi++) if (String(options[oi]) === selection) valid = true
          if (!valid) throw new BadRequestError("Invalid selection for this market")
        }

        // Re-read the user *inside* the write transaction. This makes balance
        // validation and deduction serialized with every other bet command.
        var user = txApp.findRecordById("users", auth.id)
        var balance = user.getInt("balance") || 0
        if (stake > balance) throw new BadRequestError("Insufficient balance")
        var maxBetPercent = settings.getInt("max_bet_percent") || 25
        var maxStake = Math.floor(balance * maxBetPercent / 100)
        if (balance > 0 && maxStake < 1) maxStake = 1
        if (maxBetPercent > 0 && stake > maxStake) {
          throw new BadRequestError("Stake exceeds " + maxBetPercent + "% of your balance")
        }

        var mode = market.getString("mode") || "pool"
        var oddsLocked = 0
        if (mode === "fixed") {
          var fixedOdds = parseJson(market.get("fixed_odds")) || {}
          oddsLocked = Number(fixedOdds[selection] || 0)
          if (!isFinite(oddsLocked) || oddsLocked <= 0) throw new BadRequestError("No odds set for selection")
        }

        var betCol = txApp.findCollectionByNameOrId("fifa_bets")
        var bet = new Record(betCol, {
          user: user.id,
          match: matchId,
          market: marketId,
          selection: selection,
          stake: stake,
          mode: mode,
          odds_locked: oddsLocked,
          status: "pending",
          payout: 0,
          placed_at: new Date().toISOString(),
        })
        txApp.save(bet)

        var newBalance = balance - stake
        user.set("balance", newBalance)
        txApp.saveNoValidate(user)

        var txCol = txApp.findCollectionByNameOrId("fifa_transactions")
        var ledger = new Record(txCol, {
          user: user.id,
          type: "bet_placed",
          amount: -stake,
          balance_after: newBalance,
          ref_bet: bet.id,
          note: "Bet placed on " + selection,
          timestamp: new Date().toISOString(),
        })
        txApp.saveNoValidate(ledger)

        // Recompute from transaction-visible rows; no eventually-consistent
        // post-commit repair is needed.
        var allBets = txApp.findRecordsByFilter(
          "fifa_bets",
          "market = {:marketId} && status != {:void}",
          "", 0, 0,
          { marketId: marketId, void: "void" }
        )
        var poolTotal = 0
        var poolByOption = {}
        for (var bi = 0; bi < allBets.length; bi++) {
          var b = allBets[bi]
          var amount = b.getInt("stake") || 0
          var option = b.getString("selection") || ""
          poolTotal += amount
          poolByOption[option] = (poolByOption[option] || 0) + amount
        }
        market.set("pool_total", poolTotal)
        market.set("pool_by_option", poolByOption)
        txApp.saveNoValidate(market)

        result = {
          bet: {
            id: bet.id,
            selection: selection,
            stake: stake,
            mode: mode,
            odds_locked: oddsLocked,
            status: "pending",
            payout: 0,
            placed_at: bet.getString("placed_at"),
          },
          balance: newBalance,
        }
      })
    } catch (err) {
      var message = err && err.message ? String(err.message) : String(err)
      return e.json(400, { error: message })
    }

    return e.json(201, result)
  },
  $apis.requireAuth("users")
)
