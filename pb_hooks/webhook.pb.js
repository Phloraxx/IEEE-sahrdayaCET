/// <reference path="../pb_data/types.d.ts" />

// ─── Payment Webhook Custom Route ──────────────────────────────────
// Replaces src/routes/api/orders/webhook.ts. The payment gateway calls
// this route directly on PocketBase. Verifies a shared secret, looks up
// the registration by paymentTicketId, and confirms it atomically.
//
// The onRecordUpdateRequest hook handles the counter bump and ticketId
// minting when the registration transitions pending → confirmed.
// This route only sets paymentStatus, registrationStatus, and paymentData.
//
// Idempotency: a registration already paid/confirmed is a no-op (200).

routerAdd("POST", "/api/webhooks/payment-confirm", function (e) {
    // ─── Verify shared secret ────────────────────────────────────
    var webhookSecret = $os.getenv("PAYMENT_WEBHOOK_SECRET")
    if (!webhookSecret) {
        return e.json(500, { error: "Webhook not configured" })
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
    e.bindBody(body)

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
    if (!reg) {
        return e.json(404, { error: "Registration not found" })
    }
    } catch (err) {
        return e.json(404, { error: "Registration not found" })
    }

    // ─── Idempotency: already processed ──────────────────────────
    var paymentStatus = reg.getString("paymentStatus")

    if (paymentStatus === "paid" || paymentStatus === "failed") {
        return e.json(200, { success: true, message: "Already processed" })
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
        // Verify amount matches (M-3)
        var expectedAmount = reg.getInt("amount") || 0
        if (typeof amount === "number" && Math.abs(amount - expectedAmount) > 0.01) {
            return e.json(400, { error: "Amount mismatch" })
        }

        // Confirm the registration. The onRecordUpdateRequest hook will:
        // - Detect pending → confirmed transition
        // - Mint ticketId if missing
        // - Bump registeredCount (after e.next())
        reg.set("registrationStatus", "confirmed")
        reg.set("paymentStatus", "paid")
        reg.set("paymentData", body)
        $app.save(reg)
        // Coupon usedCount is maintained by the registration hooks
        // (onRecordAfterUpdateSuccess re-computes it from active registrations).
    } else {
        // Payment failed — record the failure without changing registration status
        var existingPaymentData = reg.get("paymentData") || {}
        reg.set("paymentStatus", "failed")
        reg.set("paymentData", {
            existing: existingPaymentData,
            incoming: body,
            transactionId: transactionId || existingPaymentData.transactionId
        })
        $app.save(reg)
    }

    return e.json(200, { success: true })
})
