/// <reference path="../pb_data/types.d.ts" />

var EVENT_PROVIDER_KOTAK = "kotak"
var EVENT_PROVIDER_SLICE = "slice"
var EVENT_PROVIDER_RAZORPAY = "razorpay"
var RAZORPAY_PROVIDER = "razorpay_live"
var SUPPORTED_EVENT_PROVIDERS = {
    kotak: true,
    slice: true,
    razorpay: true,
}

function eventProvider(event) {
    var value = event ? String(event.getString("paymentProvider") || "") : ""
    return SUPPORTED_EVENT_PROVIDERS[value] ? value : EVENT_PROVIDER_KOTAK
}

function registrationPaymentData(event) {
    var selected = eventProvider(event)
    if (selected === EVENT_PROVIDER_RAZORPAY) {
        return {
            provider: RAZORPAY_PROVIDER,
            eventPaymentProvider: selected,
            providerStatus: "not_initialized",
            manualReview: false,
        }
    }
    return {
        provider: "paygate",
        eventPaymentProvider: selected,
        paymentAccount: selected,
        providerStatus: "not_initialized",
        manualReview: false,
    }
}

function getRazorpayConfig() {
    return {
        url: String($os.getenv("RAZORPAY_LIVE_URL") || "").trim().replace(/\/+$/, ""),
        apiKey: String($os.getenv("RAZORPAY_LIVE_API_KEY") || "").trim(),
    }
}

function razorpayConfigured(config) {
    return !!(config && config.url && config.apiKey)
}

function razorpayExternalId(registrationId) {
    return "ieee-registration:" + String(registrationId || "")
}

function razorpayIdempotencyKey(registrationId) {
    return "ieee-razorpay-" + String(registrationId || "")
}

function request(config, path, method, body, headers) {
    var requestHeaders = headers || {}
    requestHeaders.Accept = "application/json"
    requestHeaders.Authorization = "Bearer " + config.apiKey
    var options = {
        url: config.url + path,
        method: method || "GET",
        headers: requestHeaders,
        timeout: 8,
    }
    if (body !== undefined && body !== null) {
        options.body = typeof body === "string" ? body : JSON.stringify(body)
        options.headers["Content-Type"] = "application/json"
    }
    return $http.send(options)
}

function expectedPaise(registration) {
    var amount = registration ? Number(registration.getInt("amount") || 0) : 0
    if (!isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) return 0
    var paise = amount * 100
    return Number.isSafeInteger(paise) ? paise : 0
}

function validateOrder(raw, registration, options) {
    options = options || {}
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "Razorpay returned an invalid order response" }
    }
    var id = typeof raw.id === "string" ? raw.id.trim() : ""
    var orderId = typeof raw.razorpayOrderId === "string" ? raw.razorpayOrderId.trim() : ""
    var externalId = typeof raw.externalId === "string" ? raw.externalId.trim() : ""
    var amountPaise = Number(raw.amountPaise)
    var currency = typeof raw.currency === "string" ? raw.currency.trim().toUpperCase() : ""
    var status = typeof raw.status === "string" ? raw.status.trim() : ""
    var allowedStatuses = {
        created: true,
        verification_pending: true,
        authorized: true,
        captured: true,
        failed: true,
        refunded: true,
        partially_refunded: true,
    }
    if (!id || !orderId || !allowedStatuses[status]) {
        return { ok: false, error: "Razorpay returned an invalid order response" }
    }
    if (amountPaise !== expectedPaise(registration) || currency !== "INR") {
        return { ok: false, error: "Razorpay order amount or currency does not match the registration" }
    }
    if (externalId !== razorpayExternalId(registration.id)) {
        return { ok: false, error: "Razorpay order registration identity mismatch" }
    }
    if (options.localOrderId && id !== options.localOrderId) {
        return { ok: false, error: "Razorpay order identity mismatch" }
    }
    if (options.razorpayOrderId && orderId !== options.razorpayOrderId) {
        return { ok: false, error: "Razorpay checkout order identity mismatch" }
    }
    var keyId = typeof raw.keyId === "string" ? raw.keyId.trim() : ""
    if (options.requireCheckout && !keyId) {
        return { ok: false, error: "Razorpay checkout key is unavailable" }
    }
    return {
        ok: true,
        order: {
            id: id,
            status: status,
            amountPaise: amountPaise,
            currency: currency,
            externalId: externalId,
            razorpayOrderId: orderId,
            razorpayPaymentId: typeof raw.razorpayPaymentId === "string" ? raw.razorpayPaymentId.trim() : "",
            providerStatus: typeof raw.providerStatus === "string" ? raw.providerStatus.trim() : "",
            keyId: keyId,
            displayName: typeof raw.displayName === "string" ? raw.displayName.trim() : "Razorpay",
            createdAt: typeof raw.createdAt === "string" ? raw.createdAt.trim() : "",
            capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt.trim() : "",
        },
    }
}

function updateOrderData(registration, order, extra) {
    var pg = require(__hooks + "/paygate-helpers.js")
    var current = pg.asObject(registration.get("paymentData"))
    var patch = {
        provider: RAZORPAY_PROVIDER,
        eventPaymentProvider: EVENT_PROVIDER_RAZORPAY,
        providerStatus: order.status,
        paymentId: order.id,
        requestedAmountPaise: order.amountPaise,
        payableAmountPaise: order.amountPaise,
        payableAmount: (order.amountPaise / 100).toFixed(2),
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: order.razorpayPaymentId || current.razorpayPaymentId || "",
        razorpayKeyId: order.keyId || current.razorpayKeyId || "",
        providerDisplayName: order.displayName || current.providerDisplayName || "Razorpay",
        createdAt: current.createdAt || order.createdAt || new Date().toISOString(),
        paidAt: order.capturedAt || current.paidAt || "",
        lastSyncedAt: new Date().toISOString(),
    }
    var keys = Object.keys(extra || {})
    for (var i = 0; i < keys.length; i++) patch[keys[i]] = extra[keys[i]]
    return pg.mergePaymentData(current, patch)
}

function applyOrderState(registration, order) {
    var rh = require(__hooks + "/registration-helpers.js")
    var guard = require(__hooks + "/paygate-registration-guard.js")
    var currentRegistrationStatus = registration.getString("registrationStatus")
    var currentPaymentStatus = registration.getString("paymentStatus")

    if (order.status === "captured") {
        if (currentRegistrationStatus === "confirmed" && currentPaymentStatus === "paid") {
            registration.set("paymentData", updateOrderData(registration, order, { manualReview: false }))
            $app.saveNoValidate(registration)
            return { action: "noop" }
        }
        var disposition = guard.paymentConfirmationDisposition(registration)
        if (disposition.blocked) {
            registration.set("registrationStatus", "cancelled")
            registration.set("paymentStatus", "paid")
            registration.set("paymentData", updateOrderData(registration, order, {
                manualReview: true,
                reviewReason: disposition.reason,
            }))
            $app.saveNoValidate(registration)
            return { action: "paid_manual_review" }
        }
        registration.set("registrationStatus", "confirmed")
        registration.set("paymentStatus", "paid")
        registration.set("paymentData", updateOrderData(registration, order, { manualReview: false }))
        if (!registration.getString("ticketId")) registration.set("ticketId", rh.generateTicketId())
        $app.saveNoValidate(registration)
        return { action: "confirmed" }
    }

    if (order.status === "failed") {
        if (currentPaymentStatus === "paid" || currentRegistrationStatus === "cancelled") return { action: "noop" }
        registration.set("registrationStatus", "cancelled")
        registration.set("paymentStatus", "failed")
        registration.set("paymentData", updateOrderData(registration, order, {
            manualReview: false,
            releaseReason: "Razorpay payment failed",
        }))
        $app.save(registration)
        return { action: "cancelled" }
    }

    registration.set("paymentData", updateOrderData(registration, order, {}))
    $app.saveNoValidate(registration)
    return { action: "updated" }
}

module.exports = {
    EVENT_PROVIDER_KOTAK: EVENT_PROVIDER_KOTAK,
    EVENT_PROVIDER_SLICE: EVENT_PROVIDER_SLICE,
    EVENT_PROVIDER_RAZORPAY: EVENT_PROVIDER_RAZORPAY,
    RAZORPAY_PROVIDER: RAZORPAY_PROVIDER,
    eventProvider: eventProvider,
    registrationPaymentData: registrationPaymentData,
    getRazorpayConfig: getRazorpayConfig,
    razorpayConfigured: razorpayConfigured,
    razorpayExternalId: razorpayExternalId,
    razorpayIdempotencyKey: razorpayIdempotencyKey,
    request: request,
    expectedPaise: expectedPaise,
    validateOrder: validateOrder,
    updateOrderData: updateOrderData,
    applyOrderState: applyOrderState,
}
