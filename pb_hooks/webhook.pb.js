/// <reference path="../pb_data/types.d.ts" />

// ─── Payment Webhook Custom Route ──────────────────────────────────
// Replaces src/routes/api/orders/webhook.ts. The payment gateway calls
// this route directly on PocketBase. Verifies a shared secret, looks up
// the registration by paymentTicketId, and confirms it atomically.
//
// Mints ticketId inline before save — onRecordUpdateRequest does NOT run
// for $app.save() / $app.saveNoValidate() (model-hook path only).
// onRecordAfterUpdateSuccess still recomputes event counters.
//
// Idempotency: a registration already paid/confirmed is a no-op (200).

routerAdd("POST", "/api/webhooks/payment-confirm", function (e) {
    var rh = require(__hooks + "/registration-helpers.js")
    // ─── Verify shared secret ────────────────────────────────────
    var webhookSecret = $os.getenv("PAYMENT_WEBHOOK_SECRET")
    if (!webhookSecret) {
        return e.json(503, { error: "Webhook not configured" })
    }

    var headerSecret = e.request.header.get("x-webhook-secret")
    if (!headerSecret) {
        return e.json(401, { error: "Missing webhook secret" })
    }

    // Timing-safe comparison
    if (headerSecret.length !== webhookSecret.length) {
        return e.json(401, { error: "Invalid webhook secret" })
    }

    var mismatch = 0
    for (var i = 0; i < webhookSecret.length; i++) {
        mismatch |= headerSecret.charCodeAt(i) ^ webhookSecret.charCodeAt(i)
    }
    if (mismatch !== 0) {
        return e.json(401, { error: "Invalid webhook secret" })
    }

    // ─── Parse body ──────────────────────────────────────────────
    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (e) { body = {} }
    }
    // Also bind for form-encoded compatibility (silent fallback)
    try { e.bindBody(body) } catch (e) {}

    var ticketId = body.ticketId || ""
    var status = body.status || ""
    var transactionId = body.transactionId || ""
    var amount = body.amount

    if (!ticketId || !status) {
        return e.json(400, { error: "ticketId and status are required" })
    }

    // ─── Look up registration by paymentTicketId ─────────────────
    var reg
    try {
        reg = $app.findFirstRecordByFilter(
            "registrations",
            "paymentTicketId = {:ticketId}",
            { ticketId: ticketId }
        )
    } catch (err) {
        console.log("[webhook] DB error looking up registration: " + err)
        return e.json(502, { error: "Database error" })
    }
    if (!reg) {
        return e.json(404, { error: "Registration not found" })
    }

    // ─── Idempotency: already processed ──────────────────────────
    var paymentStatus = reg.getString("paymentStatus")
    var registrationStatus = reg.getString("registrationStatus")

    if (paymentStatus === "paid") {
        return e.json(200, { success: true, message: "Already processed" })
    }

    // Cancellation is terminal. A delayed/retried payment callback must never
    // resurrect a seat that has already been released for another attendee.
    if (registrationStatus === "cancelled") {
        return e.json(200, { success: true, ignored: true, message: "Registration is cancelled" })
    }

    // Replay of a specific transaction we already persisted?
    var paymentData = reg.get("paymentData")
    if (transactionId && paymentData && typeof paymentData === "object") {
        var priorTx = paymentData.transactionId
        if (typeof priorTx === "string" && priorTx === transactionId) {
            return e.json(200, { success: true, message: "Already processed" })
        }
    }

    // ─── Process payment ─────────────────────────────────────────
    var isSuccess = status === "success" || status === "completed" || status === "paid"

    if (isSuccess) {
        // Verify amount is provided and matches (M-3)
        var amountNum = Number(amount)
        if (!isFinite(amountNum)) {
            return e.json(400, { error: "amount is required for success" })
        }
        var expectedAmount = reg.getInt("amount") || 0
        if (Math.abs(amountNum - expectedAmount) > 0.01) {
            return e.json(400, { error: "Amount mismatch" })
        }

        reg.set("registrationStatus", "confirmed")
        reg.set("paymentStatus", "paid")
        reg.set("paymentData", { transactionId: transactionId, status: status })
        if (!reg.getString("ticketId")) {
            reg.set("ticketId", rh.generateTicketId())
        }
        $app.saveNoValidate(reg)
        // Coupon usedCount + registeredCount: onRecordAfterUpdateSuccess hook.
    } else {
        // A failed payment releases the reservation immediately. Keeping the
        // registration as pending would continue consuming event capacity and
        // would also block the attendee from retrying registration.
        reg.set("paymentStatus", "failed")
        reg.set("registrationStatus", "cancelled")
        reg.set("paymentData", { transactionId: transactionId, status: status })
        $app.save(reg)
    }

    return e.json(200, { success: true })
})
