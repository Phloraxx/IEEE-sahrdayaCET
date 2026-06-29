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
    var reg = e.record

    // Set placeholder ticketId to avoid unique constraint violation.
    // The real ticketId is set in onRecordAfterCreateSuccess.
    if (!reg.getString("ticketId")) {
        reg.set("ticketId", "temp-" + $security.randomString(16))
    }

    // Auth is verified by API rules (createRule).
    // PB 0.39.1 doesn't apply body data before onRecordCreateRequest.
    e.next()
}, "registrations")

// ─── Registration Create: After commit ─────────────────────────────
// Re-computes event counters (self-healing) and reserves the coupon
// (M-1: usedCount is counted from active registrations, so the create
// itself "reserves" the coupon slot immediately, not on webhook confirm).

onRecordAfterCreateSuccess(function (e) {
    var reg = e.record
    var eventId = reg.getString("event")
    if (!eventId) { e.next(); return }

    var event = $app.findRecordById("events", eventId)
    if (!event) { e.next(); return }

    var price = event.getInt("price") || 0
    var isFree = price === 0
    var finalAmount = isFree ? 0 : price
    var couponCode = reg.getString("couponCode") || ""
    var discountAmount = 0
    var discountPercent = 0

    if (couponCode && !isFree) {
        try {
            var coupon = $app.findFirstRecordByFilter(
                "coupons",
                "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
                { code: couponCode, eventId: eventId }
            )
            if (coupon) {
                discountPercent = coupon.getInt("discountPercent") || 0
                discountAmount = Math.round(price * discountPercent / 100)
                finalAmount = Math.max(0, finalAmount - discountAmount)
            }
        } catch (err) {}
    }

    // Re-fetch record from DB and update via dao (bypasses goja's broken set())
    var dao = $app.dao()
    var record = dao.findRecordById("registrations", reg.id)
    if (!record) { e.next(); return }

    record.set("amount", finalAmount)
    record.set("discountAmount", discountAmount)
    record.set("paymentStatus", isFree ? "not_required" : "pending")
    record.set("registrationStatus", isFree ? "confirmed" : "pending")
    record.set("registrationDate", new Date().toISOString())
    if (isFree) {
        record.set("ticketId", generateTicketId())
    } else {
        record.set("paymentTicketId", generatePaymentTicketId())
    }
    // NEW-3: Reset checkedIn/checkedInAt — the createRule only requires
    // user = @request.auth.id, so a direct PB API client could sneak in
    // checkedIn=true. The hook must always clear it.
    record.set("checkedIn", false)
    record.set("checkedInAt", "")

    $app.saveNoValidate(record)

    recomputeEventCounters(eventId)
    if (couponCode) { recomputeCouponUsedCount(couponCode, eventId) }
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
