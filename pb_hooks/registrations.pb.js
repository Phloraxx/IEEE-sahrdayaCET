/// <reference path="../pb_data/types.d.ts" />

// ─── Registration Lifecycle Hooks ──────────────────────────────────
// All registration business logic: capacity, deadline, form validation,
// coupon validation, ticketId/paymentTicketId generation, counter
// maintenance, and chair payment-forgery prevention (H-2).
//
// This replaces the TanStack `registration-service.ts` functions that
// previously ran via createAdminPB(). The hook runs inside PB with direct
// DB access — no admin token, no network round-trip, atomic with the write.

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Re-computes registeredCount and checkedInCount on the event from live
 * DB counts. Self-healing: concurrent callers all write the same value (M-5).
 */
function recomputeEventCounters(eventId) {
    try {
        var confirmed = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus = {:status}",
            "", 0, 0,
            { eventId: eventId, status: "confirmed" }
        )
        var checkedIn = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && checkedIn = {:checked}",
            "", 0, 0,
            { eventId: eventId, checked: true }
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

// ─── Registration Create ────────────────────────────────────────────
// Fires BEFORE the INSERT. Validates all business rules and sets
// server-authoritative fields (paymentStatus, registrationStatus,
// ticketId, paymentTicketId, amount, discountAmount). Throws to abort
// the create on any validation failure.

onRecordCreateRequest(function (e) {
    console.log("=== REG HOOK START ===")
    var reg = e.record

    // ─── Pin user to the authenticated caller ──────────────────
    // The API rule enforces @request.body.user = @request.auth.id,
    // so we trust the user from the request body. e.requestInfo.auth
    // is unavailable in onRecordCreateRequest in PB 0.39.1 (known issue).
    var userId = reg.getString("user")
    if (!userId) {
        throw e.badRequestError("Authentication required")
    }

    // ─── Fetch the event ────────────────────────────────────────
    var eventId = reg.getString("event")
    if (!eventId) {
        throw e.badRequestError("eventId is required")
    }
    var event
    try {
        event = $app.findRecordById("events", eventId)
    } catch (err) {
        throw e.badRequestError("Event not found")
    }
    if (!event) throw e.badRequestError("Event not found")

    // ─── Registration gates ─────────────────────────────────────
    if (event.getBool("isDeleted")) {
        throw e.badRequestError("Event not found")
    }
    if (!event.getBool("registrationOpen")) {
        throw e.badRequestError("Registration is not open for this event")
    }
    var deadline = event.getString("registrationDeadline")
    if (deadline && new Date() > new Date(deadline)) {
        throw e.badRequestError("Registration deadline has passed")
    }

    // ─── Capacity check (live count, not denormalized) ──────────
    var maxCapacity = event.getInt("maxCapacity")
    if (maxCapacity > 0) {
        var existing = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus != {:cancelled}",
            "", maxCapacity, 0,
            { eventId: eventId, cancelled: "cancelled" }
        )
        if (existing.length >= maxCapacity) {
            throw e.badRequestError("Event has reached maximum capacity")
        }
    }

    // ─── Duplicate pending registration check ───────────────────
    var dupUserId = reg.getString("user")
    var dup = $app.findRecordsByFilter(
        "registrations",
        "user = {:userId} && event = {:eventId} && registrationStatus = {:pending}",
        "", 1, 0,
        { userId: dupUserId, eventId: eventId, pending: "pending" }
    )
    if (dup.length > 0) {
        throw e.badRequestError("You already have a pending registration for this event")
    }

    // ─── Form-field validation (required fields) ────────────────
    var formTemplate = event.get("formTemplate")
    if (formTemplate && formTemplate.length > 0) {
        var formResponses = reg.get("formResponses") || {}
        for (var i = 0; i < formTemplate.length; i++) {
            var field = formTemplate[i]
            if (field && field.required) {
                var val = formResponses[field.id]
                if (val === undefined || val === null || val === "") {
                    throw e.badRequestError('"' + (field.label || "A required field") + '" is required')
                }
            }
        }
    }

    // ─── Compute amount + coupon ────────────────────────────────
    var price = event.getInt("price")
    var isFree = price === 0
    var finalAmount = isFree ? 0 : price
    var discountAmount = 0

    var couponCode = reg.getString("couponCode") || ""
    if (couponCode && !isFree) {
        var coupon
        try {
            coupon = $app.findFirstRecordByFilter(
                "coupons",
                "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
                { code: couponCode, eventId: eventId }
            )
        } catch (err) {
            throw e.badRequestError("Invalid or expired coupon code")
        }
        var maxUses = coupon.getInt("maxUses") || 0
        var usedCount = coupon.getInt("usedCount") || 0
        if (maxUses > 0 && usedCount >= maxUses) {
            throw e.badRequestError("This coupon has reached its maximum uses")
        }
        var discountPercent = coupon.getInt("discountPercent") || 0
        discountAmount = Math.round(price * discountPercent / 100)
        finalAmount = Math.max(0, finalAmount - discountAmount)
    }

    // ─── Set server-authoritative fields ────────────────────────
    reg.set("amount", finalAmount)
    reg.set("discountAmount", discountAmount)
    reg.set("paymentStatus", isFree ? "not_required" : "pending")
    reg.set("registrationStatus", isFree ? "confirmed" : "pending")
    reg.set("registrationDate", new Date().toISOString())

    // ─── Persist authoritative fields ──────────────────────────
    // e.next() saves the record but discards reg.set() changes in
    // PB 0.39.1. Use onRecordAfterCreateSuccess for the authoritative
    // field values (it has working reg.set() and $app.save()).
    e.next()
}, "registrations")

// ─── Registration Create: After commit ─────────────────────────────
// Re-computes event counters (self-healing) and reserves the coupon
// (M-1: usedCount is counted from active registrations, so the create
// itself "reserves" the coupon slot immediately, not on webhook confirm).

onRecordAfterCreateSuccess(function (e) {
    var reg = e.record
    var eventId = reg.getString("event")

    // ─── Set server-authoritative fields ────────────────────────
    // onRecordCreateRequest cannot persist reg.set() changes in
    // PB 0.39.1 (goja bug), so we set them here where $app.save() works.
    var event = $app.findRecordById("events", eventId)
    var price = event.getInt("price") || 0
    var isFree = price === 0
    var couponCode = reg.getString("couponCode") || ""
    var discountAmount = 0
    var finalAmount = isFree ? 0 : price

    if (couponCode && !isFree) {
        var coupon = $app.findFirstRecordByFilter(
            "coupons",
            "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
            { code: couponCode, eventId: eventId }
        )
        if (coupon) {
            var discountPercent = coupon.getInt("discountPercent") || 0
            discountAmount = Math.round(price * discountPercent / 100)
            finalAmount = Math.max(0, finalAmount - discountAmount)
        }
    }

    reg.set("amount", finalAmount)
    reg.set("discountAmount", discountAmount)
    reg.set("paymentStatus", isFree ? "not_required" : "pending")
    reg.set("registrationStatus", isFree ? "confirmed" : "pending")
    reg.set("registrationDate", new Date().toISOString())

    if (isFree) {
        reg.set("ticketId", generateTicketId())
    } else {
        reg.set("paymentTicketId", generatePaymentTicketId())
    }

    $app.save(reg)

    // Re-compute event counters
    recomputeEventCounters(eventId)

    // Reserve coupon
    if (couponCode) {
        recomputeCouponUsedCount(couponCode, eventId)
    }

    e.next()
}, "registrations")

// ─── Registration Update ───────────────────────────────────────────
// Fires BEFORE the UPDATE. Reads old state from DB to detect transitions.
// - Blocks chairs from forging paymentStatus or amount (H-2).
// - Mints ticketId on manual confirm (pending → confirmed).
// - Bumps/decrements counters after the update is applied.

onRecordUpdateRequest(function (e) {
    var newReg = e.record
    var auth = e.requestInfo ? e.requestInfo.auth : null

    // Fetch the OLD state from the DB (before the update applies)
    var oldReg = $app.findRecordById("registrations", newReg.id)

    // ─── H-2: Chairs cannot forge payment status or amount ──────
    if (auth && auth.id) {
        var role = auth.getString("role") || ""
        if (role === "chair") {
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
            // (would grant free entry to a paid event without payment).
            var oldStatus = oldReg.getString("registrationStatus")
            var newStatusCheck = newReg.getString("registrationStatus")
            if (oldStatus !== "confirmed" && newStatusCheck === "confirmed") {
                throw e.badRequestError("Only admins can confirm registrations")
            }
        }
    }

    // ─── Mint ticketId on manual confirm ────────────────────────
    var oldStatus = oldReg.getString("registrationStatus")
    var newStatus = newReg.getString("registrationStatus")
    if (oldStatus === "pending" && newStatus === "confirmed") {
        if (!newReg.getString("ticketId")) {
            newReg.set("ticketId", generateTicketId())
        }
    }

    e.next()
}, "registrations")

// ─── Registration Update: After commit ─────────────────────────────
// Re-computes event counters and coupon usedCount from live DB state.
// Self-healing: concurrent updates all write the same absolute values,
// so no double-bump / double-decrement is possible (M-5).

onRecordAfterUpdateSuccess(function (e) {
    var reg = e.record
    var eventId = reg.getString("event")

    // Re-compute event counters (registeredCount + checkedInCount)
    recomputeEventCounters(eventId)

    // Re-compute coupon usedCount (releases the slot on cancel)
    var couponCode = reg.getString("couponCode") || ""
    if (couponCode) {
        recomputeCouponUsedCount(couponCode, eventId)
    }

    e.next()
}, "registrations")
