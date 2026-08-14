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

/** Stable JSON comparison for idempotent registration-command recovery. */
function registrationCanonicalJson(value) {
    if (value === null || value === undefined) return "null"
    if (typeof value === "string") return JSON.stringify(value)
    if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value)
    if (Array.isArray(value)) {
        var items = []
        for (var ai = 0; ai < value.length; ai++) items.push(registrationCanonicalJson(value[ai]))
        return "[" + items.join(",") + "]"
    }
    if (typeof value === "object") {
        var keys = Object.keys(value).sort()
        var fields = []
        for (var oi = 0; oi < keys.length; oi++) {
            var key = keys[oi]
            fields.push(JSON.stringify(key) + ":" + registrationCanonicalJson(value[key]))
        }
        return "{" + fields.join(",") + "}"
    }
    return JSON.stringify(String(value))
}

function registrationJsonObject(value) {
    if (!value) return {}
    // Persisted PocketBase JSON fields can be types.JSONRaw in JSVM.
    if (typeof value === "object" && typeof value.string === "function") {
        try { value = JSON.parse(String(value.string() || "{}")) } catch (_) { return {} }
    } else if (Array.isArray(value)) {
        try {
            var text = ""
            for (var i = 0; i < value.length; i++) text += String.fromCharCode(Number(value[i]) || 0)
            value = JSON.parse(text)
        } catch (_) { return {} }
    } else if (typeof value === "string") {
        try { value = JSON.parse(value) } catch (_) { return {} }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return value
}

/**
 * A retry may omit optional answers, but any answer it does supply must equal
 * the already committed response. This makes lost-response recovery safe
 * without turning a replay into an edit path.
 */
function registrationReplayCompatible(stored, incoming) {
    stored = registrationJsonObject(stored)
    incoming = registrationJsonObject(incoming)
    var keys = Object.keys(incoming)
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i]
        if (registrationCanonicalJson(stored[key]) !== registrationCanonicalJson(incoming[key])) {
            return false
        }
    }
    return true
}


function registrationFinalFeePaise(registration) {
    if (!registration) return 0
    var paise = Number(registration.getInt("finalFeePaise") || 0)
    if (isFinite(paise) && Math.floor(paise) === paise && paise >= 0) {
        if (paise > 0) return paise
        var legacyZero = Number(registration.get("amount") || 0)
        if (!isFinite(legacyZero) || legacyZero <= 0) return 0
    }
    var rupees = Number(registration.get("amount") || 0)
    return isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0
}

function registrationDiscountPaise(registration) {
    if (!registration) return 0
    var paise = Number(registration.getInt("discountPaise") || 0)
    if (isFinite(paise) && Math.floor(paise) === paise && paise > 0) return paise
    var rupees = Number(registration.get("discountAmount") || 0)
    return isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0
}

function registrationAmount(registration) { return registrationFinalFeePaise(registration) / 100 }
function registrationDiscountAmount(registration) { return registrationDiscountPaise(registration) / 100 }

function eventFeePaise(event) {
    if (!event) return 0
    var paise = Number(event.getInt("baseFeePaise") || 0)
    if (isFinite(paise) && Math.floor(paise) === paise && paise > 0) return paise
    var rupees = Number(event.get("price") || 0)
    return isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0
}

function eventPrice(event) { return eventFeePaise(event) / 100 }

module.exports = {
    recomputeEventCounters: recomputeEventCounters,
    recomputeCouponUsedCount: recomputeCouponUsedCount,
    generateTicketId: generateTicketId,
    generatePaymentTicketId: generatePaymentTicketId,
    sortRecordsNewestFirst: sortRecordsNewestFirst,
    registrationCanonicalJson: registrationCanonicalJson,
    registrationJsonObject: registrationJsonObject,
    registrationReplayCompatible: registrationReplayCompatible,
    registrationFinalFeePaise: registrationFinalFeePaise,
    registrationDiscountPaise: registrationDiscountPaise,
    registrationAmount: registrationAmount,
    registrationDiscountAmount: registrationDiscountAmount,
    eventFeePaise: eventFeePaise,
    eventPrice: eventPrice,
}
