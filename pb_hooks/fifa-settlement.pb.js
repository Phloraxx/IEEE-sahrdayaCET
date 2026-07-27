/// <reference path="../pb_data/types.d.ts" />

// Atomic settlement: match result, bet outcomes, payouts, ledgers and market
// state commit together. A failed write leaves the match completely unchanged.
routerAdd("POST", "/api/fifa/settle", function (e) {
  var auth = e.auth
  if (!auth || auth.getString("role") !== "admin") {
    return e.json(auth ? 403 : 401, { error: auth ? "Admin only" : "Authentication required" })
  }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var matchId = String(body.matchId || "")
  if (!matchId) return e.json(400, { error: "matchId is required" })

  var response = null
  try {
    $app.runInTransaction(function (txApp) {
      var match
      try { match = txApp.findRecordById("fifa_matches", matchId) }
      catch (_) { throw new Error("Match not found") }

      if (match.getBool("settled")) {
        response = { success: true, message: "Already settled", matchId: matchId }
        return
      }

      var homeGoals = Number(body.result_home_goals)
      var awayGoals = Number(body.result_away_goals)
      if (!isFinite(homeGoals) || homeGoals < 0 || !isFinite(awayGoals) || awayGoals < 0) {
        throw new Error("Valid non-negative result scores are required")
      }
      var result = {
        result_winner: String(body.result_winner || ""),
        result_home_goals: Math.floor(homeGoals),
        result_away_goals: Math.floor(awayGoals),
        result_scorers: Array.isArray(body.result_scorers) ? body.result_scorers : [],
        result_yellow_cards: Math.max(0, Math.floor(Number(body.result_yellow_cards) || 0)),
        result_red_cards: Math.max(0, Math.floor(Number(body.result_red_cards) || 0)),
        result_advance: String(body.result_advance || ""),
        result_after_extra_time: !!body.result_after_extra_time,
        result_after_penalties: !!body.result_after_penalties,
      }
      if (["home", "away", "draw"].indexOf(result.result_winner) === -1) {
        throw new Error("result_winner must be home, away or draw")
      }
      if (!result.result_advance && result.result_winner !== "draw") {
        result.result_advance = result.result_winner
      }
      if (result.result_advance && ["home", "away"].indexOf(result.result_advance) === -1) {
        throw new Error("result_advance must be home or away")
      }
      var customWinnersMap = body.custom_winners || {}

      var settings = null
      try { settings = txApp.findFirstRecordByFilter("fifa_settings", "1 = 1", {}) } catch (_) {}
      var houseCut = settings ? (settings.getInt("pool_house_cut_percent") || 0) : 0

      var floatField = function (record, field) {
        var value = Number(record.get(field))
        return isFinite(value) ? value : 0
      }
      var judge = function (bet, market, customWinners) {
        var current = bet.getString("status") || "pending"
        if (current !== "pending") return current
        var selection = bet.getString("selection") || ""
        var type = market.getString("market_type") || ""
        var line = floatField(market, "line")
        if (type === "match_winner") {
          var winner = result.result_advance || result.result_winner
          if (!winner || winner === "draw") return "void"
          return selection === winner ? "won" : "lost"
        }
        if (type === "total_goals_ou") {
          var total = result.result_home_goals + result.result_away_goals
          if (selection === "over") return total > line ? "won" : total < line ? "lost" : "void"
          if (selection === "under") return total < line ? "won" : total > line ? "lost" : "void"
          return "lost"
        }
        if (type === "correct_score") {
          return selection === (result.result_home_goals + "-" + result.result_away_goals) ? "won" : "lost"
        }
        if (type === "any_scorer") {
          if (!result.result_scorers.length) return "void"
          return result.result_scorers.indexOf(selection) !== -1 ? "won" : "lost"
        }
        if (type === "cards_ou") {
          var cards = result.result_yellow_cards + result.result_red_cards
          if (selection === "over") return cards > line ? "won" : cards < line ? "lost" : "void"
          if (selection === "under") return cards < line ? "won" : cards > line ? "lost" : "void"
          return "lost"
        }
        if (type === "clean_sheet") {
          if (selection === "home") return result.result_away_goals === 0 ? "won" : "lost"
          if (selection === "away") return result.result_home_goals === 0 ? "won" : "lost"
          return "lost"
        }
        if (type === "custom") {
          if (!customWinners || !customWinners.length) return "void"
          return customWinners.indexOf(selection) !== -1 ? "won" : "lost"
        }
        return "void"
      }
      var credit = function (bet, amount, type, note) {
        if (amount <= 0) return
        var user = txApp.findRecordById("users", bet.getString("user"))
        var newBalance = (user.getInt("balance") || 0) + amount
        user.set("balance", newBalance)
        txApp.saveNoValidate(user)
        var ledger = new Record(txApp.findCollectionByNameOrId("fifa_transactions"), {
          user: user.id,
          type: type,
          amount: amount,
          balance_after: newBalance,
          ref_bet: bet.id,
          note: note,
          timestamp: new Date().toISOString(),
        })
        txApp.saveNoValidate(ledger)
      }

      var markets = txApp.findRecordsByFilter(
        "fifa_bet_markets", "match = {:matchId}", "", 0, 0, { matchId: matchId }
      )
      var settledCount = 0
      var totalPayout = 0
      var marketsProcessed = 0

      for (var mi = 0; mi < markets.length; mi++) {
        var market = markets[mi]
        market.set("is_open", false)
        if (market.getBool("void")) {
          txApp.saveNoValidate(market)
          continue
        }
        marketsProcessed++
        var bets = txApp.findRecordsByFilter(
          "fifa_bets", "market = {:marketId}", "", 0, 0, { marketId: market.id }
        )
        var judged = []
        var anyWinner = false
        for (var bi = 0; bi < bets.length; bi++) {
          var outcome = judge(bets[bi], market, customWinnersMap[market.id] || [])
          judged.push({ bet: bets[bi], outcome: outcome })
          if (outcome === "won") anyWinner = true
        }

        var mode = market.getString("mode") || "pool"
        if (mode === "pool" && judged.length && !anyWinner) {
          for (var ri = 0; ri < judged.length; ri++) {
            var refundBet = judged[ri].bet
            if (refundBet.getString("status") !== "pending") continue
            var refund = refundBet.getInt("stake") || 0
            credit(refundBet, refund, "bet_refund", "Pool voided — refund")
            refundBet.set("status", "void")
            refundBet.set("payout", refund)
            txApp.saveNoValidate(refundBet)
            settledCount++
            totalPayout += refund
          }
          market.set("pool_total", 0)
          market.set("pool_by_option", {})
          txApp.saveNoValidate(market)
          continue
        }

        var totalPool = 0
        var totalWinningStakes = 0
        for (var ji = 0; ji < judged.length; ji++) {
          if (judged[ji].outcome === "void") continue
          var poolStake = judged[ji].bet.getInt("stake") || 0
          totalPool += poolStake
          if (judged[ji].outcome === "won") totalWinningStakes += poolStake
        }

        for (var si = 0; si < judged.length; si++) {
          var item = judged[si]
          var bet = item.bet
          if (bet.getString("status") !== "pending") continue
          var stake = bet.getInt("stake") || 0
          var payout = 0
          if (item.outcome === "void") payout = stake
          else if (item.outcome === "won" && mode === "fixed") payout = Math.round(stake * floatField(bet, "odds_locked"))
          else if (item.outcome === "won" && totalWinningStakes > 0) {
            payout = Math.round((stake / totalWinningStakes) * totalPool * (1 - houseCut / 100))
          }
          if (payout > 0) {
            credit(bet, payout, item.outcome === "void" ? "bet_refund" : "bet_payout", item.outcome === "void" ? "Settlement refund" : "Match settlement")
            totalPayout += payout
          }
          bet.set("status", item.outcome)
          bet.set("payout", payout)
          txApp.saveNoValidate(bet)
          settledCount++
        }

        var liveBets = txApp.findRecordsByFilter(
          "fifa_bets", "market = {:marketId} && status != {:void}", "", 0, 0,
          { marketId: market.id, void: "void" }
        )
        var poolTotal = 0
        var poolByOption = {}
        for (var li = 0; li < liveBets.length; li++) {
          var liveStake = liveBets[li].getInt("stake") || 0
          var selection = liveBets[li].getString("selection") || ""
          poolTotal += liveStake
          poolByOption[selection] = (poolByOption[selection] || 0) + liveStake
        }
        market.set("pool_total", poolTotal)
        market.set("pool_by_option", poolByOption)
        txApp.saveNoValidate(market)
      }

      match.set("result_winner", result.result_winner)
      match.set("result_home_goals", result.result_home_goals)
      match.set("result_away_goals", result.result_away_goals)
      match.set("result_scorers", result.result_scorers)
      match.set("result_yellow_cards", result.result_yellow_cards)
      match.set("result_red_cards", result.result_red_cards)
      match.set("result_home_clean_sheet", result.result_away_goals === 0)
      match.set("result_away_clean_sheet", result.result_home_goals === 0)
      match.set("result_advance", result.result_advance)
      match.set("result_after_extra_time", result.result_after_extra_time)
      match.set("result_after_penalties", result.result_after_penalties)
      match.set("status", "finished")
      match.set("settled", true)
      txApp.saveNoValidate(match)

      response = {
        success: true,
        matchId: matchId,
        settledCount: settledCount,
        totalPayout: totalPayout,
        marketsProcessed: marketsProcessed,
      }
    })
  } catch (err) {
    var message = err && err.message ? String(err.message) : String(err)
    var status = message === "Match not found" ? 404 : 400
    return e.json(status, { error: message })
  }
  return e.json(200, response)
}, $apis.requireAuth("users"))
