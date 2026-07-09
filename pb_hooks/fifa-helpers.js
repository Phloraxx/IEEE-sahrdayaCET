/// <reference path="../pb_data/types.d.ts" />

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
    try {
        var col = $app.findCollectionByNameOrId("fifa_feed_events")
        var ev = new Record(col, {
            type: type,
            user: userId || "",
            match: matchId || "",
            message: message || "",
        })
        $app.saveNoValidate(ev)
    } catch (err) {
        console.log("[fifa] emitFeedEvent failed: " + err)
    }
}

module.exports = {
    getFifaSettings: getFifaSettings,
    applyTransaction: applyTransaction,
    applyDelta: applyDelta,
    emitFeedEvent: emitFeedEvent,
}