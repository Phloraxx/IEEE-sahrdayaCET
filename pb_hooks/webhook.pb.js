/// <reference path="../pb_data/types.d.ts" />

// ─── Legacy Payment Webhook Custom Route ───────────────────────────
// Retained only for registrations created before the native PayGate migration
// (or another explicitly legacy provider). New PayGate-managed registrations
// must be confirmed through /api/webhooks/paygate or provider reconciliation.
//
// Mints ticketId inline before save — onRecordUpdateRequest does NOT run
// for $app.save() / $app.saveNoValidate() (model-hook path only).
// onRecordAfterUpdateSuccess still recomputes event counters.

routerAdd("POST", "/api/webhooks/payment-confirm", function (e) {
    var rh = require(__hooks + "/registration-helpers.js")
    var pg = require(__hooks + "/paygate-helpers.js")

    var webhookSecret = $os.getenv("PAYMENT_WEBHOOK_SECRET")
    if (!webhookSecret) {
        return e.json(503, { error: "Webhook not configured" })
    }

    var headerSecret = e.request.header.get("x-webhook-secret")
    if (!headerSecret) {
        return e.json(401, { error: "Missing webhook secret" })
    }

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

    var body = {}
    var rawBody = toString(e.request.body)
    if (rawBody && rawBody.length > 0) {
        try { body = JSON.parse(rawBody) } catch (_) { body = {} }
    }
    try { e.bindBody(body) } catch (_) {}

    var ticketId = body.ticketId || ""
    var status = body.status || ""
    var transactionId = body.transactionId || ""
    var amount = body.amount

    if (!ticketId || !status) {
        return e.json(400, { error: "ticketId and status are required" })
    }

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

    // Never let the weaker legacy shared-secret callback confirm a registration
    // owned by the native PayGate integration. This prevents an old integration
    // credential from bypassing PayGate's signed event/payment identity checks.
    var paymentData = pg.asObject(reg.get("paymentData"))
    if (paymentData.provider === pg.PAYGATE_PROVIDER) {
        return e.json(409, {
            error: "This registration is managed by PayGate",
            code: "PAYGATE_NATIVE_WEBHOOK_REQUIRED",
        })
    }

    var paymentStatus = reg.getString("paymentStatus")
    var registrationStatus = reg.getString("registrationStatus")

    if (paymentStatus === "paid") {
        return e.json(200, { success: true, message: "Already processed" })
    }

    if (registrationStatus === "cancelled") {
        return e.json(200, { success: true, ignored: true, message: "Registration is cancelled" })
    }

    if (transactionId && paymentData) {
        var priorTx = paymentData.transactionId
        if (typeof priorTx === "string" && priorTx === transactionId) {
            return e.json(200, { success: true, message: "Already processed" })
        }
    }

    var isSuccess = status === "success" || status === "completed" || status === "paid"

    if (isSuccess) {
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
        reg.set("paymentData", { provider: "legacy", transactionId: transactionId, status: status })
        if (!reg.getString("ticketId")) {
            reg.set("ticketId", rh.generateTicketId())
        }
        $app.saveNoValidate(reg)
    } else {
        reg.set("paymentStatus", "failed")
        reg.set("registrationStatus", "cancelled")
        reg.set("paymentData", { provider: "legacy", transactionId: transactionId, status: status })
        $app.save(reg)
    }

    return e.json(200, { success: true })
})
