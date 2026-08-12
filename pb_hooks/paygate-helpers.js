/// <reference path="../pb_data/types.d.ts" />

var PAYGATE_PROVIDER = "paygate"
var EXTERNAL_ID_PREFIX = "ieee-registration:"
var SUPPORTED_STATUSES = {
    pending: true,
    paid: true,
    expired: true,
    cancelled: true,
    late: true,
}

function asObject(value) {
    if (!value) return {}

    // PocketBase JSON fields are stored as types.JSONRaw. Prefer JSONRaw's
    // own UTF-8-safe string() conversion when available; keep a byte-array
    // fallback for plain arrays used by tests/serialization boundaries.
    if (typeof value === "object" && typeof value.string === "function") {
        try { value = JSON.parse(String(value.string() || "{}")) } catch (_) { return {} }
    } else if (Array.isArray(value)) {
        try {
            var jsonText = ""
            for (var bi = 0; bi < value.length; bi++) jsonText += String.fromCharCode(Number(value[bi]) || 0)
            value = JSON.parse(jsonText)
        } catch (_) { return {} }
    } else if (typeof value === "string") {
        try { value = JSON.parse(value) } catch (_) { return {} }
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    var copy = {}
    var keys = Object.keys(value)
    for (var i = 0; i < keys.length; i++) copy[keys[i]] = value[keys[i]]
    return copy
}

function toPositiveInt(value, fallback) {
    var number = Number(value)
    if (!isFinite(number) || Math.floor(number) !== number || number <= 0) return fallback
    return number
}

function getConfig() {
    var url = String($os.getenv("PAYGATE_URL") || "").trim().replace(/\/+$/, "")
    return {
        url: url,
        apiKey: String($os.getenv("PAYGATE_API_KEY") || "").trim(),
        webhookSecret: String($os.getenv("PAYGATE_WEBHOOK_SECRET") || "").trim(),
        registrationGraceSeconds: toPositiveInt($os.getenv("PAYGATE_REGISTRATION_GRACE_SECONDS"), 600),
        webhookToleranceSeconds: toPositiveInt($os.getenv("PAYGATE_WEBHOOK_TOLERANCE_SECONDS"), 300),
    }
}

function paymentConfigured(config) {
    return !!(config && config.url && config.apiKey)
}

function webhookConfigured(config) {
    return !!(config && config.webhookSecret)
}

function externalIdForRegistration(registrationId) {
    return EXTERNAL_ID_PREFIX + String(registrationId || "")
}

function registrationIdFromExternalId(externalId) {
    externalId = String(externalId || "")
    if (externalId.indexOf(EXTERNAL_ID_PREFIX) !== 0) return ""
    return externalId.slice(EXTERNAL_ID_PREFIX.length)
}

function idempotencyKeyForRegistration(registrationId) {
    return "ieee-paygate-" + String(registrationId || "")
}

function expectedRequestedPaise(amountRupees) {
    var amount = Number(amountRupees)
    if (!isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) return 0
    var paise = amount * 100
    if (!Number.isSafeInteger(paise)) return 0
    return paise
}

function validateProviderPayment(raw, expectedAmountRupees, options) {
    options = options || {}
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "PayGate returned an invalid payment response" }
    }

    var id = typeof raw.id === "string" ? raw.id.trim() : ""
    var status = typeof raw.status === "string" ? raw.status.trim() : ""
    var requestedAmountPaise = Number(raw.requestedAmountPaise)
    var payableAmountPaise = Number(raw.payableAmountPaise)
    var expectedPaise = expectedRequestedPaise(expectedAmountRupees)

    if (!id || !SUPPORTED_STATUSES[status] || !expectedPaise) {
        return { ok: false, error: "PayGate returned an invalid payment response" }
    }
    if (!Number.isSafeInteger(requestedAmountPaise) || requestedAmountPaise !== expectedPaise) {
        return { ok: false, error: "PayGate requested amount does not match the registration" }
    }
    if (
        !Number.isSafeInteger(payableAmountPaise) ||
        payableAmountPaise <= requestedAmountPaise ||
        payableAmountPaise > requestedAmountPaise + 99
    ) {
        return { ok: false, error: "PayGate returned an invalid verification amount" }
    }
    if (options.paymentId && id !== options.paymentId) {
        return { ok: false, error: "PayGate payment identity mismatch" }
    }

    var externalId = typeof raw.externalId === "string" ? raw.externalId.trim() : ""
    if (options.externalId && externalId !== options.externalId) {
        return { ok: false, error: "PayGate registration identity mismatch" }
    }

    var upiUri = typeof raw.upiUri === "string" ? raw.upiUri.trim() : ""
    if (options.requireUpiUri && upiUri.indexOf("upi://pay?") !== 0) {
        return { ok: false, error: "PayGate did not provide a usable UPI payment URI" }
    }

    var expiresAt = typeof raw.expiresAt === "string" ? raw.expiresAt.trim() : ""
    if (status === "pending" && !expiresAt) {
        return { ok: false, error: "PayGate did not provide a payment expiry" }
    }

    return {
        ok: true,
        payment: {
            id: id,
            status: status,
            requestedAmountPaise: requestedAmountPaise,
            payableAmountPaise: payableAmountPaise,
            payableAmount: typeof raw.payableAmount === "string"
                ? raw.payableAmount
                : (payableAmountPaise / 100).toFixed(2),
            expiresAt: expiresAt,
            paidAt: typeof raw.paidAt === "string" ? raw.paidAt : "",
            upiUri: upiUri,
            externalId: externalId,
        },
    }
}

function mergePaymentData(current, patch) {
    var result = asObject(current)
    var keys = Object.keys(patch || {})
    for (var i = 0; i < keys.length; i++) result[keys[i]] = patch[keys[i]]
    return result
}

function appendEventId(data, eventId) {
    var result = asObject(data)
    var current = Array.isArray(result.paygateEventIds) ? result.paygateEventIds.slice() : []
    if (eventId && current.indexOf(eventId) === -1) current.push(eventId)
    if (current.length > 12) current = current.slice(current.length - 12)
    result.paygateEventIds = current
    return result
}

function hasEventId(data, eventId) {
    if (!eventId) return false
    data = asObject(data)
    return Array.isArray(data.paygateEventIds) && data.paygateEventIds.indexOf(eventId) !== -1
}

function resolveProviderTransition(input) {
    var eventType = String(input.eventType || "")
    var registrationStatus = String(input.registrationStatus || "")
    var paymentStatus = String(input.paymentStatus || "")

    if (input.amountMatches === false) return { action: "error", error: "Amount mismatch" }
    if (input.paymentIdMatches === false) return { action: "error", error: "Payment identity mismatch" }

    if (eventType === "payment.paid") {
        if (paymentStatus === "paid" && registrationStatus === "confirmed") return { action: "noop" }
        if (registrationStatus === "cancelled") return { action: "manual_review" }
        return { action: "confirm" }
    }

    if (eventType === "payment.expired") {
        if (registrationStatus === "cancelled" || paymentStatus === "paid") return { action: "noop" }
        return { action: "mark_expired" }
    }

    if (eventType === "payment.cancelled") {
        if (paymentStatus === "paid") return { action: "noop" }
        if (registrationStatus === "cancelled") return { action: "noop" }
        return { action: "cancel" }
    }

    if (eventType === "payment.late") {
        if (paymentStatus === "paid" && registrationStatus === "confirmed") return { action: "noop" }
        return { action: "manual_review" }
    }

    return { action: "noop" }
}

function payGateRequest(config, path, method, body, headers) {
    var requestHeaders = headers || {}
    requestHeaders.Accept = "application/json"
    var request = {
        url: config.url + path,
        method: method || "GET",
        headers: requestHeaders,
        timeout: 8,
    }
    if (body !== undefined && body !== null) {
        request.body = typeof body === "string" ? body : JSON.stringify(body)
        request.headers["Content-Type"] = "application/json"
    }
    return $http.send(request)
}

function safeProviderError(response) {
    var code = ""
    var message = ""
    if (response && response.json && typeof response.json === "object") {
        code = typeof response.json.code === "string" ? response.json.code : ""
        message = typeof response.json.message === "string" ? response.json.message : ""
    }
    if (code === "AMOUNT_CAPACITY_EXHAUSTED") {
        return {
            status: 409,
            code: code,
            message: "Payment capacity is temporarily full for this event price. Please try again later.",
        }
    }
    if (response && response.statusCode === 429) {
        return { status: 429, code: "PAYGATE_RATE_LIMITED", message: "Too many payment requests. Please try again shortly." }
    }
    if (response && response.statusCode >= 400 && response.statusCode < 500 && response.statusCode !== 401 && response.statusCode !== 403) {
        return {
            status: response.statusCode,
            code: code || "PAYGATE_REQUEST_FAILED",
            message: message || "Payment request was rejected.",
        }
    }
    return { status: 502, code: "PAYGATE_UNAVAILABLE", message: "Payment service is temporarily unavailable." }
}

function paymentSession(registration, data, providerReachable) {
    data = asObject(data)
    var eventPayload = null
    var eventId = registration.getString("event") || ""
    if (eventId) {
        try {
            var event = $app.findRecordById("events", eventId)
            var banner = event.getString("banner") || ""
            var bannerUrl = ""
            if (banner) {
                try { bannerUrl = $app.filesystem().fileUrl(event, banner) } catch (_) {}
            }
            eventPayload = {
                id: event.id,
                title: event.getString("title") || "",
                date: event.getString("date") || "",
                endDate: event.getString("endDate") || "",
                venue: event.getString("venue") || "",
                bannerUrl: bannerUrl,
            }
        } catch (_) {}
    }
    return {
        registrationId: registration.id,
        registrationStatus: registration.getString("registrationStatus") || "",
        paymentStatus: registration.getString("paymentStatus") || "",
        amount: registration.getInt("amount") || 0,
        ticketId: registration.getString("ticketId") || "",
        paymentTicketId: registration.getString("paymentTicketId") || "",
        provider: data.provider || PAYGATE_PROVIDER,
        providerStatus: data.providerStatus || "not_initialized",
        paymentId: data.paymentId || "",
        requestedAmountPaise: Number(data.requestedAmountPaise) || 0,
        payableAmountPaise: Number(data.payableAmountPaise) || 0,
        payableAmount: data.payableAmount || "",
        createdAt: data.createdAt || "",
        expiresAt: data.expiresAt || "",
        paidAt: data.paidAt || "",
        upiUri: data.upiUri || "",
        manualReview: data.manualReview === true,
        reviewReason: data.reviewReason || "",
        providerReachable: providerReachable !== false,
        attendeeEmail: registration.getString("userEmail") || "",
        event: eventPayload,
    }
}

function updateProviderData(registration, payment, extra) {
    var current = asObject(registration.get("paymentData"))
    var patch = {
        provider: PAYGATE_PROVIDER,
        providerStatus: payment.status,
        paymentId: payment.id,
        requestedAmountPaise: payment.requestedAmountPaise,
        payableAmountPaise: payment.payableAmountPaise,
        payableAmount: payment.payableAmount,
        expiresAt: payment.expiresAt || current.expiresAt || "",
        paidAt: payment.paidAt || current.paidAt || "",
        upiUri: payment.upiUri || current.upiUri || "",
        lastSyncedAt: new Date().toISOString(),
    }
    var keys = Object.keys(extra || {})
    for (var i = 0; i < keys.length; i++) patch[keys[i]] = extra[keys[i]]
    return mergePaymentData(current, patch)
}

function confirmRegistration(registration, payment, eventId) {
    var rh = require(__hooks + "/registration-helpers.js")
    var data = updateProviderData(registration, payment, {
        providerStatus: "paid",
        manualReview: false,
    })
    if (eventId) data = appendEventId(data, eventId)
    registration.set("registrationStatus", "confirmed")
    registration.set("paymentStatus", "paid")
    registration.set("paymentData", data)
    if (!registration.getString("ticketId")) registration.set("ticketId", rh.generateTicketId())
    $app.saveNoValidate(registration)
    return data
}

function cancelRegistration(registration, payment, eventId, reason, manualReview) {
    var data = updateProviderData(registration, payment, {
        manualReview: manualReview === true,
        reviewReason: reason || "",
    })
    if (eventId) data = appendEventId(data, eventId)
    registration.set("registrationStatus", "cancelled")
    registration.set("paymentStatus", "failed")
    registration.set("paymentData", data)
    $app.save(registration)
    return data
}

function applyProviderState(registration, payment, eventType, eventId) {
    var data = asObject(registration.get("paymentData"))
    var expectedPaise = expectedRequestedPaise(registration.getInt("amount") || 0)
    if (eventType !== "payment." + String(payment.status || "")) {
        return { action: "error", error: "PayGate event type does not match payment status" }
    }
    var transition = resolveProviderTransition({
        eventType: eventType,
        registrationStatus: registration.getString("registrationStatus"),
        paymentStatus: registration.getString("paymentStatus"),
        amountMatches: payment.requestedAmountPaise === expectedPaise,
        paymentIdMatches: !data.paymentId || String(data.paymentId) === payment.id,
    })

    if (transition.action === "error") return transition

    // A noop is intentionally non-mutating for provider state. This prevents a
    // stale/out-of-order terminal event from regressing a confirmed payment.
    // We still remember a webhook event ID so valid retries remain idempotent.
    if (transition.action === "noop") {
        if (eventId) {
            var noopData = appendEventId(data, eventId)
            registration.set("paymentData", noopData)
            $app.saveNoValidate(registration)
        }
        return transition
    }

    if (transition.action === "confirm") {
        confirmRegistration(registration, payment, eventId)
        return transition
    }

    if (transition.action === "cancel") {
        cancelRegistration(registration, payment, eventId, "PayGate payment was cancelled", false)
        return transition
    }

    if (transition.action === "mark_expired") {
        var expiredData = updateProviderData(registration, payment, {
            providerStatus: "expired",
            manualReview: false,
        })
        if (eventId) expiredData = appendEventId(expiredData, eventId)
        registration.set("paymentData", expiredData)
        $app.saveNoValidate(registration)
        return transition
    }

    if (transition.action === "manual_review") {
        var cancelled = registration.getString("registrationStatus") === "cancelled"
        var reviewReason = eventType === "payment.late"
            ? "PayGate detected a payment after the accepted payment window"
            : "PayGate reported payment after the registration seat was released"
        if (cancelled) {
            var reviewData = updateProviderData(registration, payment, {
                providerStatus: payment.status,
                manualReview: true,
                reviewReason: reviewReason,
            })
            if (eventId) reviewData = appendEventId(reviewData, eventId)
            registration.set("paymentData", reviewData)
            $app.saveNoValidate(registration)
        } else {
            cancelRegistration(registration, payment, eventId, reviewReason, true)
        }
        return transition
    }

    var nextData = updateProviderData(registration, payment, {})
    if (eventId) nextData = appendEventId(nextData, eventId)
    registration.set("paymentData", nextData)
    $app.saveNoValidate(registration)
    return transition
}

function shouldReleasePendingRegistration(registration, nowMs, graceSeconds) {
    if (registration.getString("registrationStatus") !== "pending") return false
    if (registration.getString("paymentStatus") !== "pending") return false
    var data = asObject(registration.get("paymentData"))
    if (data.provider !== PAYGATE_PROVIDER) return false

    var status = String(data.providerStatus || "not_initialized")
    var graceMs = toPositiveInt(graceSeconds, 600) * 1000

    if (status === "cancelled" || status === "late") return true

    if (status === "expired") {
        var expiresAt = Date.parse(String(data.expiresAt || ""))
        return isFinite(expiresAt) && nowMs > expiresAt + graceMs
    }

    if (status === "not_initialized") {
        var createdAt = Date.parse(registration.getString("registrationDate") || registration.getString("created") || "")
        return isFinite(createdAt) && nowMs > createdAt + graceMs
    }

    return false
}

module.exports = {
    PAYGATE_PROVIDER: PAYGATE_PROVIDER,
    EXTERNAL_ID_PREFIX: EXTERNAL_ID_PREFIX,
    asObject: asObject,
    getConfig: getConfig,
    paymentConfigured: paymentConfigured,
    webhookConfigured: webhookConfigured,
    externalIdForRegistration: externalIdForRegistration,
    registrationIdFromExternalId: registrationIdFromExternalId,
    idempotencyKeyForRegistration: idempotencyKeyForRegistration,
    expectedRequestedPaise: expectedRequestedPaise,
    validateProviderPayment: validateProviderPayment,
    mergePaymentData: mergePaymentData,
    appendEventId: appendEventId,
    hasEventId: hasEventId,
    resolveProviderTransition: resolveProviderTransition,
    payGateRequest: payGateRequest,
    safeProviderError: safeProviderError,
    paymentSession: paymentSession,
    updateProviderData: updateProviderData,
    applyProviderState: applyProviderState,
    shouldReleasePendingRegistration: shouldReleasePendingRegistration,
}
