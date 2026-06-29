/// <reference path="../pb_data/types.d.ts" />

// ─── Coupon Validation Custom Route ────────────────────────────────
// Replaces the user-authed coupon lookup in src/routes/api/events.validate-coupon.ts.
// Runs inside PB with direct DB access (bypasses collection rules).
// Gated by INTERNAL_API_SECRET to prevent brute-force from anonymous clients.

routerAdd("POST", "/api/coupons/validate", function (e) {
    var secret = $os.getenv("INTERNAL_API_SECRET")
    if (!secret) {
        return e.json(500, { error: "Internal API secret not configured" })
    }

    var headerSecret = e.request.header.get("x-internal-secret")
    if (!headerSecret) {
        return e.json(401, { error: "Missing internal secret" })
    }

    // Timing-safe comparison
    if (headerSecret.length !== secret.length) {
        return e.json(401, { error: "Invalid internal secret" })
    }
    var mismatch = 0
    for (var i = 0; i < secret.length; i++) {
        mismatch |= headerSecret.charCodeAt(i) ^ secret.charCodeAt(i)
    }
    if (mismatch !== 0) {
        return e.json(401, { error: "Invalid internal secret" })
    }

    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (e) { body = {} }
    }

    var code = body.code || ""
    var eventId = body.eventId || ""

    if (!code || !eventId) {
        return e.json(400, { error: "code and eventId are required" })
    }

    var coupon
    try {
        coupon = $app.findFirstRecordByFilter(
            "coupons",
            "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
            { code: code, eventId: eventId }
        )
    } catch (err) {
        return e.json(200, { valid: false, error: "Invalid or expired coupon code" })
    }

    if (!coupon) {
        return e.json(200, { valid: false, error: "Invalid or expired coupon code" })
    }

    var event
    try {
        event = $app.findRecordById("events", eventId)
    } catch (err) {
        return e.json(404, { error: "Event not found" })
    }

    var price = event.getInt("price") || 0
    var discountPercent = coupon.getInt("discountPercent") || 0
    var discountAmount = Math.round(price * discountPercent / 100)

    return e.json(200, {
        valid: true,
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        code: coupon.getString("code"),
        description: coupon.getString("description") || "",
    })
})
