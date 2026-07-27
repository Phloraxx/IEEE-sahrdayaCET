/// <reference path="../pb_data/types.d.ts" />

// Request-level defense around the game economy. Internal transactional commands
// use saveNoValidate() and remain the only writers for financial/result fields.
onRecordUpdateRequest(function (e) {
  var old = null
  try { old = $app.findRecordById("fifa_bet_markets", e.record.id) } catch (_) {}
  if (!old) { e.next(); return }

  if (old.getBool("void") !== e.record.getBool("void")) {
    throw e.badRequestError("Use the market void command")
  }
  if (Number(old.get("pool_total") || 0) !== Number(e.record.get("pool_total") || 0) ||
      JSON.stringify(old.get("pool_by_option") || {}) !== JSON.stringify(e.record.get("pool_by_option") || {})) {
    throw e.badRequestError("Market pool totals are managed by the betting engine")
  }

  var bets = $app.findRecordsByFilter("fifa_bets", "market = {:marketId}", "", 1, 0, { marketId: e.record.id })
  if (bets.length > 0) {
    var immutableText = ["match", "market_type", "mode"]
    for (var ti = 0; ti < immutableText.length; ti++) {
      if (old.getString(immutableText[ti]) !== e.record.getString(immutableText[ti])) {
        throw e.badRequestError("Market definition cannot change after bets exist")
      }
    }
    if (Number(old.get("line") || 0) !== Number(e.record.get("line") || 0) ||
        JSON.stringify(old.get("fixed_odds") || null) !== JSON.stringify(e.record.get("fixed_odds") || null) ||
        JSON.stringify(old.get("options") || []) !== JSON.stringify(e.record.get("options") || [])) {
      throw e.badRequestError("Market definition cannot change after bets exist")
    }
  }
  e.next()
}, "fifa_bet_markets")

onRecordDeleteRequest(function (e) {
  var bets = $app.findRecordsByFilter("fifa_bets", "market = {:marketId}", "", 1, 0, { marketId: e.record.id })
  if (bets.length > 0) throw e.badRequestError("Markets with bets cannot be deleted; void them instead")
  e.next()
}, "fifa_bet_markets")

onRecordUpdateRequest(function (e) {
  var old = null
  try { old = $app.findRecordById("fifa_matches", e.record.id) } catch (_) {}
  if (!old) { e.next(); return }

  if (old.getString("status") !== "void" && e.record.getString("status") === "void") {
    throw e.badRequestError("Use the match void command")
  }

  var protectedText = ["result_winner", "result_advance"]
  for (var ti = 0; ti < protectedText.length; ti++) {
    if (old.getString(protectedText[ti]) !== e.record.getString(protectedText[ti])) {
      throw e.badRequestError("Match results are managed by the settlement command")
    }
  }
  var protectedNumbers = ["result_home_goals", "result_away_goals", "result_yellow_cards", "result_red_cards"]
  for (var ni = 0; ni < protectedNumbers.length; ni++) {
    if (Number(old.get(protectedNumbers[ni]) || 0) !== Number(e.record.get(protectedNumbers[ni]) || 0)) {
      throw e.badRequestError("Match results are managed by the settlement command")
    }
  }
  var protectedBools = ["result_home_clean_sheet", "result_away_clean_sheet", "result_after_extra_time", "result_after_penalties", "settled"]
  for (var bi = 0; bi < protectedBools.length; bi++) {
    if (old.getBool(protectedBools[bi]) !== e.record.getBool(protectedBools[bi])) {
      throw e.badRequestError("Match results are managed by the settlement command")
    }
  }
  if (JSON.stringify(old.get("result_scorers") || []) !== JSON.stringify(e.record.get("result_scorers") || [])) {
    throw e.badRequestError("Match results are managed by the settlement command")
  }
  e.next()
}, "fifa_matches")

onRecordDeleteRequest(function (e) {
  var bets = $app.findRecordsByFilter("fifa_bets", "match = {:matchId}", "", 1, 0, { matchId: e.record.id })
  if (bets.length > 0) throw e.badRequestError("Matches with bets cannot be deleted; void them instead")
  e.next()
}, "fifa_matches")

routerAdd("POST", "/api/fifa/markets/{id}/void", function (e) {
  var auth = e.auth
  if (!auth || auth.getString("role") !== "admin") {
    return e.json(auth ? 403 : 401, { error: auth ? "Admin only" : "Authentication required" })
  }
  var id = e.request.pathValue("id")
  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var market
      try { market = txApp.findRecordById("fifa_bet_markets", id) }
      catch (_) { throw new Error("Market not found") }
      if (market.getBool("void")) {
        result = { success: true, marketId: id, refundedCount: 0, alreadyVoid: true }
        return
      }

      var pending = txApp.findRecordsByFilter(
        "fifa_bets", "market = {:marketId} && status = {:status}", "", 0, 0,
        { marketId: id, status: "pending" }
      )
      for (var i = 0; i < pending.length; i++) {
        var bet = pending[i]
        var stake = bet.getInt("stake") || 0
        var user = txApp.findRecordById("users", bet.getString("user"))
        var balance = (user.getInt("balance") || 0) + stake
        user.set("balance", balance)
        txApp.saveNoValidate(user)
        var ledger = new Record(txApp.findCollectionByNameOrId("fifa_transactions"), {
          user: user.id, type: "bet_refund", amount: stake, balance_after: balance,
          ref_bet: bet.id, note: "Market voided — refund", timestamp: new Date().toISOString(),
        })
        txApp.saveNoValidate(ledger)
        bet.set("status", "void")
        bet.set("payout", stake)
        txApp.saveNoValidate(bet)
      }
      market.set("void", true)
      market.set("is_open", false)
      market.set("pool_total", 0)
      market.set("pool_by_option", {})
      txApp.saveNoValidate(market)
      result = { success: true, marketId: id, refundedCount: pending.length }
    })
  } catch (err) {
    var message = err && err.message ? String(err.message) : String(err)
    return e.json(message === "Market not found" ? 404 : 400, { error: message })
  }
  return e.json(200, result)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/fifa/matches/{id}/void", function (e) {
  var auth = e.auth
  if (!auth || auth.getString("role") !== "admin") {
    return e.json(auth ? 403 : 401, { error: auth ? "Admin only" : "Authentication required" })
  }
  var id = e.request.pathValue("id")
  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var match
      try { match = txApp.findRecordById("fifa_matches", id) }
      catch (_) { throw new Error("Match not found") }
      if (match.getString("status") === "void") {
        result = { success: true, matchId: id, refundedCount: 0, alreadyVoid: true }
        return
      }
      var markets = txApp.findRecordsByFilter(
        "fifa_bet_markets", "match = {:matchId}", "", 0, 0, { matchId: id }
      )
      var refunded = 0
      for (var mi = 0; mi < markets.length; mi++) {
        var market = markets[mi]
        if (market.getBool("void")) continue
        var pending = txApp.findRecordsByFilter(
          "fifa_bets", "market = {:marketId} && status = {:status}", "", 0, 0,
          { marketId: market.id, status: "pending" }
        )
        for (var bi = 0; bi < pending.length; bi++) {
          var bet = pending[bi]
          var stake = bet.getInt("stake") || 0
          var user = txApp.findRecordById("users", bet.getString("user"))
          var balance = (user.getInt("balance") || 0) + stake
          user.set("balance", balance)
          txApp.saveNoValidate(user)
          var ledger = new Record(txApp.findCollectionByNameOrId("fifa_transactions"), {
            user: user.id, type: "bet_refund", amount: stake, balance_after: balance,
            ref_bet: bet.id, note: "Match voided — refund", timestamp: new Date().toISOString(),
          })
          txApp.saveNoValidate(ledger)
          bet.set("status", "void")
          bet.set("payout", stake)
          txApp.saveNoValidate(bet)
          refunded++
        }
        market.set("void", true)
        market.set("is_open", false)
        market.set("pool_total", 0)
        market.set("pool_by_option", {})
        txApp.saveNoValidate(market)
      }
      match.set("status", "void")
      match.set("settled", false)
      txApp.saveNoValidate(match)
      result = { success: true, matchId: id, refundedCount: refunded }
    })
  } catch (err) {
    var message = err && err.message ? String(err.message) : String(err)
    return e.json(message === "Match not found" ? 404 : 400, { error: message })
  }
  return e.json(200, result)
}, $apis.requireAuth("users"))
