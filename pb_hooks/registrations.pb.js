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
// PB 0.39 goja does not hoist top-level `function` declarations into hook
// callback scopes (see fifa.pb.js). Use var + function expressions.

/**
 * Re-computes registeredCount and checkedInCount on the event from live
 * DB counts. Self-healing: concurrent callers all write the same value (M-5).
 */
var recomputeEventCounters = function(eventId) {
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
var recomputeCouponUsedCount = function(couponCode, eventId) {
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
var generateTicketId = function() {
    return "TKT-" + $security.randomString(16)
}

/** Generates a payment webhook lookup key (UUID-like). */
var generatePaymentTicketId = function() {
    return $security.randomString(32)
}

// ─── Registration Create ────────────────────────────────────────────
// Fires BEFORE the INSERT. Validates all business rules and sets
// server-authoritative fields (paymentStatus, registrationStatus,
// ticketId, paymentTicketId, amount, discountAmount). Throws to abort
// the create on any validation failure.

onRecordCreateRequest(function (e) {
    var reg = e.record

    // We'll set the correct ticketId after fetching the event below.

    // --- Business rule validation (authority lives here, not in route code) ---
    var eventId = reg.getString("event")
    if (!eventId) {
        throw new errors.BadRequestError("Missing event ID")
    }

    var event
    try {
        event = $app.findRecordById("events", eventId)
    } catch (err) {
        throw new errors.BadRequestError("Event not found")
    }
    // Set the correct ticketId based on event price. For free events, set the
    // user-facing ticketId; for paid events, set the paymentTicketId.
    // The after-create hook will null out the unused one.
    // This avoids a temp-* placeholder that could persist if the after-create
    // hook fails.
    if (!reg.getString("ticketId") && !reg.getString("paymentTicketId")) {
        var eventPrice = event.getInt("price") || 0
        if (eventPrice === 0) {
            reg.set("ticketId", "TKT-" + $security.randomString(16))
        } else {
            reg.set("paymentTicketId", generatePaymentTicketId())
        }
    }

    // 1. Status gate: event must be published
    var eventStatus = event.getString("status")
    if (eventStatus === "draft" || eventStatus === "cancelled") {
        throw new errors.BadRequestError("Event is not available for registration")
    }

    // 2. Registration open gate
    if (!event.getBool("registrationOpen")) {
        throw new errors.BadRequestError("Registration is closed for this event")
    }

    // 3. Deadline gate
    var deadline = event.getString("registrationDeadline")
    if (deadline && deadline !== "") {
        var deadlineDate = new Date(deadline)
        if (deadlineDate < new Date()) {
            throw new errors.BadRequestError("Registration deadline has passed")
        }
    }

    // 4. Form validation
    var formTemplateRaw = event.get("formTemplate")
    var formTemplate = null
    if (typeof formTemplateRaw === "string") {
        try { formTemplate = JSON.parse(formTemplateRaw) } catch (e) {}
    } else if (Array.isArray(formTemplateRaw)) {
        formTemplate = formTemplateRaw
    }
    var formResponsesRaw = reg.get("formResponses")
    var formResponses = {}
    if (typeof formResponsesRaw === "string") {
        try { formResponses = JSON.parse(formResponsesRaw) } catch (e) {}
    } else if (typeof formResponsesRaw === "object" && formResponsesRaw !== null) {
        formResponses = formResponsesRaw
    }
    if (formTemplate && Array.isArray(formTemplate) && formTemplate.length > 0) {
        for (var i = 0; i < formTemplate.length; i++) {
            var field = formTemplate[i]
            if (field.required) {
                var fieldName = field.name || field.id || ""
                var value = formResponses[fieldName] || formResponses[field.id] || ""
                if (!value || (typeof value === "string" && value.trim() === "")) {
                    throw new errors.BadRequestError("Required field '" + (field.label || fieldName) + "' is missing")
                }
            }
        }
    }

    // 5. Capacity check (live query, not stale counter)
    // Count pending + confirmed — paid events create as pending and still hold a seat.
    var maxCapacity = event.getInt("maxCapacity") || 0
    if (maxCapacity > 0) {
        var activeRegs = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus != {:cancelled}",
            "", 0, 0,
            { eventId: eventId, cancelled: "cancelled" }
        )
        if (activeRegs.length >= maxCapacity) {
            throw new errors.BadRequestError("Event is at full capacity")
        }
    }

    // 6. Coupon maxUses check — if the registration carries a coupon code,
    // verify the coupon hasn't exceeded its usage limit. usedCount is
    // recomputed from active registrations (see recomputeCouponUsedCount),
    // so we count live active registrations with this code+event instead
    // of trusting the stored counter (TOCTOU-safe).
    var couponCode = reg.getString("couponCode") || ""
    if (couponCode) {
        var coupon = null
        try {
            coupon = $app.findFirstRecordByFilter(
                "coupons",
                "code = {:code} && event = {:eventId}",
                { code: couponCode, eventId: eventId }
            )
        } catch (err) {
            // Coupon doesn't exist — let the after-create hook handle
            // the invalid-coupon case (discount just won't apply).
        }
        if (coupon) {
            var maxUses = coupon.getInt("maxUses") || 0
            if (maxUses > 0) {
                var activeWithCoupon = $app.findRecordsByFilter(
                    "registrations",
                    "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
                    "", 0, 0,
                    { code: couponCode, eventId: eventId, cancelled: "cancelled" }
                )
                if (activeWithCoupon.length >= maxUses) {
                    throw new errors.BadRequestError("Coupon '" + couponCode + "' has reached its usage limit")
                }
            }
        }
    }

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

    // Re-fetch record from DB (PB 0.23+ — $app.dao() was removed)
    var record = $app.findRecordById("registrations", reg.id)
    if (!record) { e.next(); return }

    record.set("amount", finalAmount)
    record.set("discountAmount", discountAmount)
    record.set("paymentStatus", isFree ? "not_required" : "pending")
    record.set("registrationStatus", isFree ? "confirmed" : "pending")
    record.set("registrationDate", new Date().toISOString())
    if (isFree) {
        record.set("paymentTicketId", "")  // null out the payment ID for free events
    } else {
        record.set("ticketId", "")  // null out the user-facing ID for paid events
    }
    // Safety net: if the pre-commit hook somehow left a temp-* ticketId,
    // generate the real one now. This prevents temp-* placeholders from
    // persisting if the pre-commit hook's event fetch failed silently.
    var existingTicketId = record.getString("ticketId") || ""
    var existingPaymentTicketId = record.getString("paymentTicketId") || ""
    if (existingTicketId.indexOf("temp-") === 0) {
        record.set("ticketId", isFree ? generateTicketId() : "")
    }
    if (existingPaymentTicketId.indexOf("temp-") === 0) {
        record.set("paymentTicketId", isFree ? "" : generatePaymentTicketId())
    }
    // NEW-3: Reset checkedIn/checkedInAt — the createRule only requires
    // user = @request.auth.id, so a direct PB API client could sneak in
    // checkedIn=true. The hook must always clear it.
    record.set("checkedIn", false)
    record.set("checkedInAt", "")

    $app.saveNoValidate(record)

    recomputeEventCounters(eventId)

    // --- Post-commit overflow self-heal (TOCTOU safety net) ---
    var maxCap = event.getInt("maxCapacity") || 0
    if (maxCap > 0) {
        var activeAfter = $app.findRecordsByFilter(
            "registrations",
            "event = {:eventId} && registrationStatus != {:cancelled}",
            "created desc, id desc", 0, 0,
            { eventId: eventId, cancelled: "cancelled" }
        )
        var excess = activeAfter.length - maxCap
        if (excess > 0) {
            for (var j = 0; j < excess; j++) {
                var rec = activeAfter[j]
                rec.set("registrationStatus", "cancelled")
                $app.saveNoValidate(rec)
            }
            recomputeEventCounters(eventId)
        }
    }
    // --- Coupon maxUses post-commit overflow self-heal ---
    // Mirrors the capacity check above. If concurrent registrations with the
    // same coupon code raced past the pre-commit check, cancel the excess.
    if (couponCode) {
        var coupon = null
        try {
            coupon = $app.findFirstRecordByFilter(
                "coupons",
                "code = {:code} && event = {:eventId}",
                { code: couponCode, eventId: eventId }
            )
        } catch (err) {}
        if (coupon) {
            var maxUses = coupon.getInt("maxUses") || 0
            if (maxUses > 0) {
                var activeAfter = $app.findRecordsByFilter(
                    "registrations",
                    "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
                    "created desc, id desc", 0, 0,
                    { code: couponCode, eventId: eventId, cancelled: "cancelled" }
                )
                var couponExcess = activeAfter.length - maxUses
                if (couponExcess > 0) {
                    for (var k = 0; k < couponExcess; k++) {
                        var rec2 = activeAfter[k]
                        rec2.set("registrationStatus", "cancelled")
                        $app.saveNoValidate(rec2)
                    }
                    recomputeEventCounters(eventId)
                    recomputeCouponUsedCount(couponCode, eventId)
                }
            }
        }
    }
    if (couponCode && !couponExcess) { recomputeCouponUsedCount(couponCode, eventId) }
    e.next()
}, "registrations")

// ─── Registration Update ───────────────────────────────────────────
// Fires BEFORE the UPDATE. Reads old state from DB to detect transitions.
// - Blocks chairs from forging paymentStatus or amount (H-2).
// - Mints ticketId on manual confirm (pending → confirmed).
// - Bumps/decrements counters after the update is applied.

onRecordUpdateRequest(function (e) {
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

// ─── Public Ticket Lookup ────────────────────────────────────────────
// Bypasses registrations listRule so unauthenticated clients (QR scans,
// shared ticket links) can resolve a ticketId or paymentTicketId without
// exposing PII. The TanStack /api/ticket route proxies here for public
// fields and adds owner/admin/chair details when authed separately.

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

    return e.json(200, {
        found: true,
        registrationId: reg.id,
        user: reg.getString("user") || "",
        ticket: {
            id: reg.getString("ticketId") || ticketId,
            paymentStatus: reg.getString("paymentStatus") || "",
            registrationStatus: reg.getString("registrationStatus") || "",
            createdAt: reg.getString("created") || reg.getString("registrationDate") || "",
        },
        event: eventPayload,
    })
})
