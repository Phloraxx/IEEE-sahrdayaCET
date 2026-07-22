/// <reference path="../pb_data/types.d.ts" />

// Direct REST writes may edit ordinary market/match fields, but financial voids
// must use the transactional commands below so refunds cannot be skipped.
onRecordUpdateRequest(function (e) {
  var old = null
  try { old = $app.findRecordById("fifa_bet_markets", e.record.id) } catch (_) {}
  if (old && !old.getBool("void") && e.record.getBool("void")) {
    throw e.badRequestError("Use the market void command")
  }
  e.next()
}, "fifa_bet_markets")

onRecordUpdateRequest(function (e) {
  var old = null
  try { old = $app.findRecordById("fifa_matches", e.record.id) } catch (_) {}
  if (old && old.getString("status") !== "void" && e.record.getString("status") === "void") {
    throw e.badRequestError("Use the match void command")
  }
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
