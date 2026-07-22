/// <reference path="../pb_data/types.d.ts" />


// ─── Registration Lifecycle Hooks ──────────────────────────────────
// Registration creation is a dedicated transactional command. This file owns
// update invariants, ticket transitions, counter maintenance, chair payment
// forgery prevention, and the public ticket lookup route.

// Helpers live in registration-helpers.js — require() inside each handler
// because PB 0.39 runs hook callbacks in isolated scopes.

// Registration creation is owned by POST /api/app/events/{id}/register in
// registration-create.pb.js. Direct collection creates are locked by schema
// rules, so duplicating create validation/repair hooks here would create two
// sources of truth. This file only owns update invariants and ticket lookup.

// ─── Registration Update ───────────────────────────────────────────
// Fires BEFORE the UPDATE. Reads old state from DB to detect transitions.
// - Blocks chairs from forging paymentStatus or amount (H-2).
// - Mints ticketId on manual confirm (pending → confirmed).
// - Bumps/decrements counters after the update is applied.

onRecordUpdateRequest(function (e) {
    var rh = require(__hooks + "/registration-helpers.js")
    var newReg = e.record
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (err) { auth = null }
    // Fetch the OLD state from the DB (before the update applies)
    var oldReg = $app.findRecordById("registrations", newReg.id)
    var oldStatus = oldReg.getString("registrationStatus")
    var newStatusCheck = newReg.getString("registrationStatus")

    // ─── NEW-9: Prevent cancelled→confirmed (regardless of role) ──
    if (oldStatus === "cancelled" && newStatusCheck === "confirmed") {
        throw e.badRequestError("Cannot re-confirm a cancelled registration")
    }

    // ─── H-2: Chairs cannot forge payment status or amount ──────
    if (auth && auth.id) {
        var role = auth.getString("role") || ""
        if (role === "chair") {
            var info = null
            try { info = e.requestInfo ? e.requestInfo() : null } catch (_) { info = null }
            var body = info && info.body && typeof info.body === "object" ? info.body : {}
            var allowedChairFields = { checkedIn: true, registrationStatus: true }
            var keys = Object.keys(body)
            for (var ki = 0; ki < keys.length; ki++) {
                if (!allowedChairFields[keys[ki]]) {
                    throw e.badRequestError("Chairs may only check in or cancel registrations")
                }
            }
            if (Object.prototype.hasOwnProperty.call(body, "registrationStatus") && newStatusCheck !== oldStatus && newStatusCheck !== "cancelled") {
                throw e.badRequestError("Chairs may only cancel registrations")
            }

            var oldPayment = oldReg.getString("paymentStatus")
            var newPayment = newReg.getString("paymentStatus")
            if (oldPayment !== newPayment) {
                throw e.badRequestError("Payment status can only be changed by the payment webhook or an admin")
            }
            var oldAmount = oldReg.getInt("amount")
            var newAmount = newReg.getInt("amount")
            if (oldAmount !== newAmount) {
                throw e.badRequestError("Amount can only be changed by an admin")
            }
            // H-2 completion: chairs cannot flip registrationStatus to "confirmed"
            if (oldStatus !== "confirmed" && newStatusCheck === "confirmed") {
                throw e.badRequestError("Only admins can confirm registrations")
            }
        }
    }

    // ─── Mint ticketId on manual confirm ────────────────────────
    if (oldStatus === "pending" && newStatusCheck === "confirmed") {
        if (!newReg.getString("ticketId")) {
            newReg.set("ticketId", rh.generateTicketId())
        }
    }

    e.next()
}, "registrations")

// ─── Registration Update: After commit ─────────────────────────────
// Re-computes event counters and coupon usedCount from live DB state.
// Self-healing: concurrent updates all write the same absolute values,
// so no double-bump / double-decrement is possible (M-5).

onRecordAfterUpdateSuccess(function (e) {
    var rh = require(__hooks + "/registration-helpers.js")
    var reg = e.record
    var eventId = reg.getString("event")

    // Re-compute event counters (registeredCount + checkedInCount)
    rh.recomputeEventCounters(eventId)

    // Re-compute coupon usedCount (releases the slot on cancel)
    var couponCode = reg.getString("couponCode") || ""
    if (couponCode) {
        rh.recomputeCouponUsedCount(couponCode, eventId)
    }

    e.next()
}, "registrations")

// ─── Public Ticket Lookup ────────────────────────────────────────────
// Bypasses registrations listRule so unauthenticated clients (QR scans,
// shared ticket links) can resolve a ticketId or paymentTicketId without
// exposing PII. The TanStack /api/ticket route proxies here for public
// fields; authenticated clients can fetch their permitted registration record directly.

routerAdd("GET", "/api/tickets/lookup", function (e) {
    var ticketId = e.request.url.query().get("ticketId") || ""
    if (!ticketId) {
        return e.json(400, { error: "ticketId query parameter is required" })
    }

    var reg
    try {
        reg = $app.findFirstRecordByFilter(
            "registrations",
            "ticketId = {:tid} || paymentTicketId = {:tid}",
            { tid: ticketId }
        )
    } catch (err) {
        return e.json(200, { found: false })
    }
    if (!reg) {
        return e.json(200, { found: false })
    }

    var eventId = reg.getString("event") || ""
    var eventPayload = null
    if (eventId) {
        try {
            var evt = $app.findRecordById("events", eventId)
            var banner = evt.getString("banner") || ""
            var bannerUrl = ""
            if (banner) {
                bannerUrl = $app.filesystem().fileUrl(evt, banner)
            }
            eventPayload = {
                id: evt.id,
                title: evt.getString("title") || "",
                date: evt.getString("date") || "",
                venue: evt.getString("venue") || "",
                time: evt.getString("time") || "",
                bannerUrl: bannerUrl,
            }
        } catch (err) {}
    }

    var response = {
        found: true,
        ticket: {
            id: reg.getString("ticketId") || ticketId,
            paymentStatus: reg.getString("paymentStatus") || "",
            registrationStatus: reg.getString("registrationStatus") || "",
            createdAt: reg.getString("created") || reg.getString("registrationDate") || "",
        },
        event: eventPayload,
    }

    var auth = null
    try { auth = e.auth || null } catch (_) { auth = null }
    var mayReadRegistration = false
    if (auth && auth.id) {
        var isAdmin = false
        try { isAdmin = auth.getString("role") === "admin" } catch (_) {}
        try {
            if (typeof auth.isSuperuser === "function" && auth.isSuperuser()) isAdmin = true
        } catch (_) {}
        mayReadRegistration = isAdmin || auth.id === reg.getString("user")
    }
    if (mayReadRegistration) response.registrationId = reg.id

    return e.json(200, response)
})
