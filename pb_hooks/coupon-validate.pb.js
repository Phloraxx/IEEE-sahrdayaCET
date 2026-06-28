/// <reference path="../pb_data/types.d.ts" />

// ─── Coupon Validation Custom Route ─────────────────────────────────
// Replaces the admin-client coupon read in events.validate-coupon.ts.
// The TanStack route authenticates the user, then calls this PB custom
// route. The route reads the coupon internally (no API rule check for
// internal $app reads) and returns the discount computation.
//
// Requires an authenticated session (e.requestInfo.auth).

routerAdd("POST", "/api/validate-coupon", function (e) {
    // ─── Require authentication ──────────────────────────────────
    var auth = e.requestInfo ? e.requestInfo.auth : null
    if (!auth || !auth.id) {
        return e.json(401, { error: "Authentication required" })
    }

    // ─── Parse body ──────────────────────────────────────────────
    var body = {}
    e.bindBody(body)

    var eventId = body.eventId || ""
    var code = body.code || ""

    if (!eventId || !code) {
        return e.json(400, { error: "eventId and code are required" })
    }

    // ─── Fetch event ─────────────────────────────────────────────
    var event
    try {
        event = $app.findRecordById("events", eventId)
    } catch (err) {
        return e.json(404, { error: "Event not found" })
    }
    if (!event) {
        return e.json(404, { error: "Event not found" })
    }

    var price = event.getInt("price") || 0
    if (price === 0) {
        return e.json(400, { error: "Coupons are only valid for paid events" })
    }

    // ─── Validate coupon ──────────────────────────────────────────
    var coupon
    try {
        coupon = $app.findFirstRecordByFilter(
            "coupons",
            "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
            { code: code, eventId: eventId }
        )
    } catch (err) {
        return e.json(400, { error: "Invalid or expired coupon code" })
    }

    var maxUses = coupon.getInt("maxUses") || 0
    var usedCount = coupon.getInt("usedCount") || 0
    if (maxUses > 0 && usedCount >= maxUses) {
        return e.json(400, { error: "This coupon has reached its maximum uses" })
    }

    // ─── Compute discount ─────────────────────────────────────────
    var discountPercent = coupon.getInt("discountPercent") || 0
    var discountAmount = Math.round(price * discountPercent / 100)
    var finalPrice = Math.max(0, price - discountAmount)

    return e.json(200, {
        valid: true,
        coupon: {
            code: coupon.getString("code"),
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            finalPrice: finalPrice,
        },
    })
})
