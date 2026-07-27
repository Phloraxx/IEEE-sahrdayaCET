/// <reference path="../pb_data/types.d.ts" />

/**
 * Shared registration helpers. Loaded via require() inside each hook handler
 * because PB 0.39 serializes handlers into isolated scopes (top-level vars are
 * not visible inside onRecord* callbacks).
 */

/**
 * Re-computes registeredCount and checkedInCount on the event from live
 * DB counts. Self-healing: concurrent callers all write the same value (M-5).
 */
function recomputeEventCounters(eventId) {
    try {
        var confirmed = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus != {:status}",
            "", 0, 0,
            { eventId: eventId, status: "cancelled" }
        )
        var checkedIn = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus = {:status} && checkedIn = {:checked}",
            "", 0, 0,
            { eventId: eventId, status: "confirmed", checked: true }
        )
        var event = $app.findRecordById("events", eventId)
        event.set("registeredCount", confirmed.length)
        event.set("checkedInCount", checkedIn.length)
        $app.saveNoValidate(event)
    } catch (err) {
        console.log("[hook] failed to recompute counters for " + eventId + ":", err)
    }
}

/**
 * Re-computes coupon usedCount from active (non-cancelled) registrations.
 * Self-healing: called after create (reserve) and after cancel (release) (M-1).
 */
function recomputeCouponUsedCount(couponCode, eventId) {
    if (!couponCode) return
    try {
        var active = $app.findRecordsByFilter(
            "registrations",
            "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
            "", 0, 0,
            { code: couponCode, eventId: eventId, cancelled: "cancelled" }
        )
        var coupon = $app.findFirstRecordByFilter(
            "coupons",
            "code = {:code} && event = {:eventId}",
            { code: couponCode, eventId: eventId }
        )
        coupon.set("usedCount", active.length)
        $app.saveNoValidate(coupon)
    } catch (err) {
        console.log("[hook] failed to recompute coupon usedCount for " + couponCode + ":", err)
    }
}

/** Generates a user-facing ticket ID: TKT-<16 random chars>. */
function generateTicketId() {
    return "TKT-" + $security.randomString(16)
}

/** Generates a payment webhook lookup key (UUID-like). */
function generatePaymentTicketId() {
    return $security.randomString(32)
}

/** Sort hook-fetched records newest-first (findRecordsByFilter sort is unreliable). */
function sortRecordsNewestFirst(records) {
    records.sort(function (a, b) {
        var ac = a.getString("created") || ""
        var bc = b.getString("created") || ""
        if (ac > bc) return -1
        if (ac < bc) return 1
        if (a.id > b.id) return -1
        if (a.id < b.id) return 1
        return 0
    })
    return records
}

module.exports = {
    recomputeEventCounters: recomputeEventCounters,
    recomputeCouponUsedCount: recomputeCouponUsedCount,
    generateTicketId: generateTicketId,
    generatePaymentTicketId: generatePaymentTicketId,
    sortRecordsNewestFirst: sortRecordsNewestFirst,
}
