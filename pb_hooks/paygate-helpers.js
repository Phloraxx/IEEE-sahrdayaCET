/// <reference path="../pb_data/types.d.ts" />

var PAYGATE_PROVIDER = "paygate"
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

function normalizePayGateOrigin(value) {
    var text = String(value || "").trim().replace(/\/+$/, "")
    var match = text.match(/^(https?):\/\/(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::([0-9]{1,5}))?$/i)
    if (!match) return ""
    if (String(match[1]).toLowerCase() === "http") {
        var localHost = String(match[2]).toLowerCase()
        if (localHost !== "localhost" && localHost !== "127.0.0.1" && localHost !== "[::1]" && localHost !== "host.docker.internal") return ""
    }
    if (match[3] && Number(match[3]) > 65535) return ""
    return text
}

function getConfig() {
    return {
        url: normalizePayGateOrigin($os.getenv("PAYGATE_URL")),
        apiKey: String($os.getenv("PAYGATE_API_KEY") || "").trim(),
        webhookSecret: String($os.getenv("PAYGATE_WEBHOOK_SECRET") || "").trim(),
        registrationGraceSeconds: toPositiveInt($os.getenv("PAYGATE_REGISTRATION_GRACE_SECONDS"), 600),
        webhookToleranceSeconds: Math.min(toPositiveInt($os.getenv("PAYGATE_WEBHOOK_TOLERANCE_SECONDS"), 300), 900),
    }
}

function paymentConfigured(config) {
    return !!(config && config.url && config.apiKey.length >= 32)
}

function webhookConfigured(config) {
    return !!(config && config.webhookSecret.length >= 32)
}

function deploymentNamespace() {
    var explicit = String($os.getenv("PAYGATE_CLIENT_NAMESPACE") || "").trim().toLowerCase()
    if (explicit) return explicit.replace(/[^a-z0-9_-]/g, "-").slice(0, 40) || "local"
    var site = String($os.getenv("SITE_URL") || "").trim().toLowerCase()
    if (site.indexOf("staging.ieeesahrdaya.com") !== -1) return "staging"
    if (site.indexOf("ieeesahrdaya.com") !== -1) return "production"
    return "local"
}

function idempotencyKeyForRegistration(registrationId) {
    return "ieee-paygate-" + deploymentNamespace() + "-" + String(registrationId || "")
}

function expectedRequestedPaise(amountRupees) {
    var amount = Number(amountRupees)
    if (!isFinite(amount) || Math.floor(amount) !== amount || amount <= 0) return 0
    var paise = amount * 100
    if (!Number.isSafeInteger(paise)) return 0
    return paise
}

function moneyStringToPaise(value) {
    value = String(value || "").trim()
    if (!/^\d+\.\d{2}$/.test(value)) return 0
    var parts = value.split(".")
    var rupees = Number(parts[0])
    var paise = Number(parts[1])
    if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise) || paise < 0 || paise > 99) return 0
    var total = rupees * 100 + paise
    return Number.isSafeInteger(total) && total > 0 ? total : 0
}

function parseUpiPaymentUri(value) {
    var prefix = "upi://pay?"
    value = String(value || "")
    if (value.indexOf(prefix) !== 0) return null
    var query = value.slice(prefix.length)
    if (!query) return null
    var params = {}
    var parts = query.split("&")
    for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue
        var separator = parts[i].indexOf("=")
        if (separator <= 0) return null
        var key
        var decoded
        try {
            key = decodeURIComponent(parts[i].slice(0, separator).replace(/\+/g, " "))
            decoded = decodeURIComponent(parts[i].slice(separator + 1).replace(/\+/g, " "))
        } catch (_) { return null }
        if (!key || Object.prototype.hasOwnProperty.call(params, key)) return null
        params[key] = decoded
    }
    return params
}

function normalizeProviderPayment(raw, options) {
    options = options || {}
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    var hasRetiredCamelCaseFields =
        Object.prototype.hasOwnProperty.call(raw, "requestedAmountPaise") ||
        Object.prototype.hasOwnProperty.call(raw, "payableAmountPaise") ||
        Object.prototype.hasOwnProperty.call(raw, "upiUri")
    var objectlessWebhook = options.allowWebhookShape === true &&
        !hasRetiredCamelCaseFields &&
        raw.object === undefined &&
        typeof raw.id === "string" &&
        typeof raw.status === "string" &&
        typeof raw.requested_amount === "string" &&
        typeof raw.payable_amount === "string" &&
        Object.prototype.hasOwnProperty.call(raw, "metadata")
    if (raw.object !== "payment" && !objectlessWebhook) return null
    var requestedAmountPaise = moneyStringToPaise(raw.requested_amount)
    var payableAmountPaise = moneyStringToPaise(raw.payable_amount)
    var payer = asObject(raw.payer)
    return {
        apiVersion: "v4",
        id: typeof raw.id === "string" ? raw.id.trim() : "",
        name: typeof raw.name === "string" ? raw.name.trim() : "",
        status: typeof raw.status === "string" ? raw.status.trim() : "",
        requestedAmountPaise: requestedAmountPaise,
        payableAmountPaise: payableAmountPaise,
        payableAmount: String(raw.payable_amount || ""),
        expiresAt: String(raw.expires_at || ""),
        graceUntil: String(raw.grace_until || ""),
        paidAt: String(raw.paid_at || ""),
        upiUri: String(raw.upi_uri || ""),
        hasUpiUri: Object.prototype.hasOwnProperty.call(raw, "upi_uri"),
        transactionNote: String(raw.transaction_note || ""),
        hasTransactionNote: Object.prototype.hasOwnProperty.call(raw, "transaction_note"),
        externalId: String(raw.external_id || "").trim(),
        metadata: asObject(raw.metadata),
        payerName: String(payer.name || ""),
        upiId: String(payer.upi_id || ""),
    }
}

function registrationIdFromProviderPayment(raw, options) {
    var payment = normalizeProviderPayment(raw, options)
    if (!payment) return ""
    var environment = String(payment.metadata.environment || "").trim()
    if (environment !== deploymentNamespace()) return ""
    return String(payment.metadata.registration_id || "").trim()
}

function providerPersonName(registration) {
    var responses = asObject(registration && registration.get ? registration.get("formResponses") : null)
    var name = String(responses.name || (registration && registration.getString ? registration.getString("userName") : "") || "").trim()
    if (!name && registration && registration.getString) name = String(registration.getString("userEmail") || "").trim()
    if (!name && registration && registration.id) name = "Registration " + String(registration.id)
    return name.slice(0, 120)
}

function validateProviderPayment(raw, expectedAmountRupees, options) {
    options = options || {}
    var payment = normalizeProviderPayment(raw, options)
    if (!payment) return { ok: false, error: "PayGate returned an invalid payment response" }
    var expectedPaise = expectedRequestedPaise(expectedAmountRupees)
    if (!payment.id || !SUPPORTED_STATUSES[payment.status] || !expectedPaise) {
        return { ok: false, error: "PayGate returned an invalid payment response" }
    }
    if (!Number.isSafeInteger(payment.requestedAmountPaise) || payment.requestedAmountPaise !== expectedPaise) {
        return { ok: false, error: "PayGate requested amount does not match the registration" }
    }
    var delta = payment.payableAmountPaise - payment.requestedAmountPaise
    var validFingerprint = (delta >= 1 && delta <= 99) || (delta >= 101 && delta <= 199)
    if (!Number.isSafeInteger(payment.payableAmountPaise) || !validFingerprint) {
        return { ok: false, error: "PayGate returned an invalid verification amount" }
    }
    if (options.paymentId && payment.id !== options.paymentId) {
        return { ok: false, error: "PayGate payment identity mismatch" }
    }
    var acceptedExternalIds = []
    if (options.externalId) acceptedExternalIds.push(String(options.externalId))
    if (Array.isArray(options.externalIds)) {
        for (var ei = 0; ei < options.externalIds.length; ei++) if (options.externalIds[ei]) acceptedExternalIds.push(String(options.externalIds[ei]))
    }
    if (acceptedExternalIds.length && acceptedExternalIds.indexOf(payment.externalId) === -1) {
        return { ok: false, error: "PayGate registration identity mismatch" }
    }
    if (options.registrationId) {
        var metadataRegistrationId = String(payment.metadata.registration_id || "").trim()
        if (metadataRegistrationId !== String(options.registrationId)) return { ok: false, error: "PayGate registration identity mismatch" }
    }
    if (options.environment && String(payment.metadata.environment || "").trim() !== String(options.environment)) {
        return { ok: false, error: "PayGate environment identity mismatch" }
    }
    if (payment.transactionNote && payment.transactionNote !== "PayGate " + payment.id) {
        return { ok: false, error: "PayGate transaction reference does not match the payment" }
    }
    if (options.requireTransactionNote && !payment.transactionNote) {
        return { ok: false, error: "PayGate did not provide a transaction reference" }
    }
    var upi = payment.upiUri ? parseUpiPaymentUri(payment.upiUri) : null
    if (options.requireUpiUri && !upi) return { ok: false, error: "PayGate did not provide a usable UPI payment URI" }
    if (upi) {
        var payee = String(upi.pa || "").trim()
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}@[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(payee) ||
            String(upi.cu || "").toUpperCase() !== "INR") {
            return { ok: false, error: "PayGate returned invalid UPI payment instructions" }
        }
        if (moneyStringToPaise(upi.am) !== payment.payableAmountPaise) {
            return { ok: false, error: "PayGate UPI amount does not match the verification amount" }
        }
        if (!payment.transactionNote || String(upi.tn || "") !== payment.transactionNote) {
            return { ok: false, error: "PayGate UPI transaction reference does not match the payment" }
        }
    }
    if (payment.status === "pending" && !payment.expiresAt) return { ok: false, error: "PayGate did not provide a payment expiry" }
    return { ok: true, payment: payment }
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
        var errorBody = response.json.error && typeof response.json.error === "object" ? response.json.error : response.json
        code = typeof errorBody.code === "string" ? errorBody.code : ""
        message = typeof errorBody.message === "string" ? errorBody.message : ""
    }
    if (code === "AMOUNT_CAPACITY_EXHAUSTED" || code === "payment_capacity_unavailable") {
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
            if (banner) try { bannerUrl = $app.filesystem().fileUrl(event, banner) } catch (_) {}
            eventPayload = {
                id: event.id,
                title: event.getString("title") || "",
                date: event.getString("date") || "",
                endDate: event.getString("endDate") || "",
                timeTbc: event.getBool("timeTbc"),
                venue: event.getString("venue") || "",
                bannerUrl: bannerUrl,
            }
        } catch (_) {}
    }
    return {
        registrationId: registration.id,
        registrationStatus: registration.getString("registrationStatus") || "",
        paymentStatus: registration.getString("paymentStatus") || "",
        amount: require(__hooks + "/registration-helpers.js").registrationAmount(registration),
        ticketId: registration.getString("ticketId") || "",
        paymentTicketId: registration.getString("paymentTicketId") || "",
        provider: PAYGATE_PROVIDER,
        providerStatus: data.providerStatus || "not_initialized",
        paymentId: data.paymentId || "",
        requestedAmountPaise: Number(data.requestedAmountPaise) || 0,
        payableAmountPaise: Number(data.payableAmountPaise) || 0,
        payableAmount: data.payableAmount || "",
        createdAt: data.createdAt || registration.getString("registrationDate") || "",
        expiresAt: data.expiresAt || "",
        paidAt: data.paidAt || "",
        upiUri: data.upiUri || "",
        transactionNote: data.transactionNote || "",
        providerDisplayName: "PayGate",
        manualReview: data.manualReview === true,
        reviewReason: data.reviewReason || "",
        providerReachable: providerReachable !== false,
        lastSyncedAt: data.lastSyncedAt || "",
        attendeeEmail: registration.getString("userEmail") || "",
        attendeePhone: registration.getString("userPhone") || "",
        event: eventPayload,
    }
}

function syncPaymentLedger(registration, payment, options, app) {
    options = options || {}
    app = app || $app
    if (!registration || !payment || !payment.id) return null
    try {
        var collection = app.findCollectionByNameOrId("payments")
        var ledger = null
        try {
            ledger = app.findFirstRecordByFilter(
                "payments",
                "providerOrderId = {:providerOrderId}",
                { providerOrderId: String(payment.id) }
            )
        } catch (_) {}
        if (!ledger) {
            try {
                var rows = app.findRecordsByFilter(
                    "payments",
                    "registration = {:registration} && provider = {:provider}",
                    "-created", 1, 0,
                )
                if (rows.length) ledger = rows[0]
            } catch (_) {}
        }

        var rh = require(__hooks + "/registration-helpers.js")
        var finalPaise = rh.registrationFinalFeePaise(registration)
        var discountPaise = Number(registration.getInt("discountPaise") || 0)
        var basePaise = Number(registration.getInt("baseFeePaise") || 0) || (finalPaise + discountPaise)
        var providerStatus = String(payment.status || "pending")
        var manualReview = options.manualReview === true
        var collectedPaise = (providerStatus === "paid" || providerStatus === "late")
            ? Number(payment.payableAmountPaise || 0)
            : 0
        var ledgerStatus = manualReview
            ? "manual_review"
            : providerStatus === "paid"
                ? "captured"
                : providerStatus === "cancelled"
                    ? "cancelled"
                    : providerStatus === "expired"
                        ? "failed"
                        : providerStatus === "late"
                            ? "manual_review"
                            : "pending"
        if (!ledger) {
            ledger = new Record(collection, {
                registration: registration.id,
                event: registration.getString("event") || "",
                provider: PAYGATE_PROVIDER,
                providerOrderId: String(payment.id),
                receipt: ("paygate_" + registration.id).slice(0, 120),
                status: ledgerStatus,
                baseFeePaise: basePaise,
                discountPaise: discountPaise,
                finalFeePaise: finalPaise,
                collectedPaise: collectedPaise,
                refundedPaise: 0,
                currency: "INR",
                paymentMethod: "upi",
                confirmationSource: PAYGATE_PROVIDER,
                capturedAt: providerStatus === "paid" ? (payment.paidAt || new Date().toISOString()) : "",
                lastSyncedAt: new Date().toISOString(),
                manualReview: manualReview || providerStatus === "late",
                reviewReason: String(options.reviewReason || ""),
            })
        } else {
            ledger.set("providerOrderId", String(payment.id))
            ledger.set("status", ledgerStatus)
            ledger.set("baseFeePaise", basePaise)
            ledger.set("discountPaise", discountPaise)
            ledger.set("finalFeePaise", finalPaise)
            ledger.set("collectedPaise", Math.max(Number(ledger.getInt("collectedPaise") || 0), collectedPaise))
            ledger.set("currency", "INR")
            ledger.set("paymentMethod", "upi")
            ledger.set("confirmationSource", PAYGATE_PROVIDER)
            ledger.set("lastSyncedAt", new Date().toISOString())
            ledger.set("manualReview", manualReview || providerStatus === "late")
            ledger.set("reviewReason", String(options.reviewReason || ""))
            if (providerStatus === "paid" && !ledger.getString("capturedAt")) {
                ledger.set("capturedAt", payment.paidAt || new Date().toISOString())
            }
        }
        app.saveNoValidate(ledger)
        return ledger
    } catch (err) {
        console.log("[paygate] payment ledger sync failed:", err)
        if (options.atomic === true) throw err
        return null
    }
}

function mayAccessRegistration(auth, registration) {
    if (!auth || !auth.id || !registration) return false
    if (auth.getString("role") === "admin") return true
    return registration.getString("user") === auth.id
}

function enqueueRegistrationNotifications(registrationId) {
    try {
        var registration = $app.findRecordById("registrations", registrationId)
        require(__hooks + "/notification-helpers.js").enqueueForRegistration(registration)
    } catch (err) {
        console.log("[paygate] notification enqueue failed:", err)
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
        upiUri: payment.hasUpiUri ? payment.upiUri : (current.upiUri || ""),
        transactionNote: payment.hasTransactionNote ? payment.transactionNote : (current.transactionNote || ""),
        lastSyncedAt: new Date().toISOString(),
    }
    var keys = Object.keys(extra || {})
    for (var i = 0; i < keys.length; i++) patch[keys[i]] = extra[keys[i]]
    var result = mergePaymentData(current, patch)
    delete result.paygateApiVersion
    delete result.eventPaymentProvider
    delete result.paymentAccount
    return result
}

function confirmRegistration(registration, payment, eventId, app) {
    app = app || $app
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
    app.saveNoValidate(registration)
    syncPaymentLedger(registration, payment, { manualReview: false, reviewReason: "", atomic: true }, app)
    return data
}

function cancelRegistration(registration, payment, eventId, reason, manualReview, app) {
    app = app || $app
    var data = updateProviderData(registration, payment, {
        manualReview: manualReview === true,
        reviewReason: reason || "",
    })
    if (eventId) data = appendEventId(data, eventId)
    registration.set("registrationStatus", "cancelled")
    registration.set("paymentStatus", "failed")
    registration.set("paymentData", data)
    app.save(registration)
    syncPaymentLedger(registration, payment, { manualReview: manualReview === true, reviewReason: reason || "", atomic: true }, app)
    return data
}

function applyProviderState(registration, payment, eventType, eventId, app) {
    app = app || $app
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

    // A noop is intentionally non-mutating for provider state. This prevents
    // a stale/out-of-order terminal event from regressing a confirmed payment.
    // We still remember a webhook event ID so valid retries remain idempotent.
    if (transition.action === "noop") {
        if (eventId) {
            var noopData = appendEventId(data, eventId)
            registration.set("paymentData", noopData)
            app.saveNoValidate(registration)
        }
        // Replays also repair a missing normalized ledger row. Registration
        // confirmation and financial reporting therefore converge even if an
        // earlier ledger write was interrupted after the bank truth was saved.
        syncPaymentLedger(registration, payment, {
            manualReview: data.manualReview === true,
            reviewReason: String(data.reviewReason || ""),
            atomic: true,
        }, app)
        return transition
    }

    if (transition.action === "confirm") {
        confirmRegistration(registration, payment, eventId, app)
        return transition
    }

    if (transition.action === "cancel") {
        cancelRegistration(registration, payment, eventId, "PayGate payment was cancelled", false, app)
        return transition
    }

    if (transition.action === "mark_expired") {
        var expiredData = updateProviderData(registration, payment, {
            providerStatus: "expired",
            manualReview: false,
        })
        if (eventId) expiredData = appendEventId(expiredData, eventId)
        registration.set("paymentData", expiredData)
        app.saveNoValidate(registration)
        syncPaymentLedger(registration, payment, { manualReview: false, reviewReason: "", atomic: true }, app)
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
            app.saveNoValidate(registration)
            syncPaymentLedger(registration, payment, { manualReview: true, reviewReason: reviewReason, atomic: true }, app)
        } else {
            cancelRegistration(registration, payment, eventId, reviewReason, true, app)
        }
        return transition
    }

    var nextData = updateProviderData(registration, payment, {})
    if (eventId) nextData = appendEventId(nextData, eventId)
    registration.set("paymentData", nextData)
    app.saveNoValidate(registration)
    return transition
}

function createPaymentForRegistration(registration) {
    var config = getConfig()
    var registrationStatus = registration.getString("registrationStatus")
    var paymentStatus = registration.getString("paymentStatus")
    var amountPaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration)
    if (paymentStatus === "paid" && registrationStatus === "confirmed") return { status: 200, body: paymentSession(registration, registration.get("paymentData"), paymentConfigured(config)) }
    if (registrationStatus !== "pending" || paymentStatus !== "pending" || amountPaise <= 0) return { status: 409, body: { code: "PAYMENT_NOT_AVAILABLE", error: "This registration is not awaiting payment" } }
    if (amountPaise % 100 !== 0) return { status: 409, body: { code: "PAYGATE_WHOLE_RUPEE_REQUIRED", error: "PayGate requires a whole-rupee registration fee. Please contact the organizer." } }

    var current = asObject(registration.get("paymentData"))
    if (current.provider !== PAYGATE_PROVIDER) return { status: 409, body: { code: "PAYMENT_PROVIDER_RETIRED", error: "This historical registration is not on the current PayGate payment flow" } }
    if (current.paymentId) return { status: 200, body: paymentSession(registration, current, paymentConfigured(config)) }
    if (!paymentConfigured(config)) return { status: 503, body: { code: "PAYGATE_NOT_CONFIGURED", error: "PayGate is temporarily unavailable" } }

    var eventId = registration.getString("event") || ""
    var amount = amountPaise / 100
    var headers = { Authorization: "Bearer " + config.apiKey, "Idempotency-Key": idempotencyKeyForRegistration(registration.id) }
    var response
    try {
        response = payGateRequest(config, "/v1/payments", "POST", {
            amount: amount,
            name: providerPersonName(registration),
            external_id: eventId,
            metadata: {
                registration_id: registration.id,
                event_id: eventId,
                payment_ticket_id: registration.getString("paymentTicketId") || "",
                source: "ieee-sahrdaya",
                environment: deploymentNamespace(),
            },
        }, headers)
    } catch (err) {
        console.log("[paygate] payment creation request failed:", err)
        return { status: 502, body: { code: "PAYGATE_UNAVAILABLE", error: "PayGate is temporarily unavailable" } }
    }
    if (response.statusCode !== 200 && response.statusCode !== 201) {
        var upstream = safeProviderError(response)
        return { status: upstream.status, body: { code: upstream.code, error: upstream.message } }
    }
    var validated = validateProviderPayment(response.json, amount, {
        requireUpiUri: true,
        requireTransactionNote: true,
        externalId: eventId,
        registrationId: registration.id,
        environment: deploymentNamespace(),
    })
    if (!validated.ok) {
        console.log("[paygate] invalid create response:", validated.error)
        return { status: 502, body: { code: "PAYGATE_INVALID_RESPONSE", error: "PayGate returned an invalid response" } }
    }
    var persisted = null
    var conflict = false
    try {
        $app.runInTransaction(function (txApp) {
            var live = txApp.findRecordById("registrations", registration.id)
            if (live.getString("registrationStatus") !== "pending" || live.getString("paymentStatus") !== "pending") {
                conflict = true
                return
            }
            var liveCurrent = asObject(live.get("paymentData"))
            if (liveCurrent.provider !== PAYGATE_PROVIDER) {
                conflict = true
                return
            }
            if (liveCurrent.paymentId) {
                persisted = { registration: live, data: liveCurrent, existing: true }
                return
            }
            var liveAmountPaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(live)
            var liveEventId = live.getString("event") || ""
            var liveValidated = validateProviderPayment(response.json, liveAmountPaise / 100, {
                requireUpiUri: true,
                requireTransactionNote: true,
                externalId: liveEventId,
                registrationId: live.id,
                environment: deploymentNamespace(),
            })
            if (!liveValidated.ok) {
                conflict = true
                return
            }
            var nextData = updateProviderData(live, liveValidated.payment, {
                provider: PAYGATE_PROVIDER,
                createdAt: liveCurrent.createdAt || new Date().toISOString(),
                manualReview: false,
            })
            live.set("paymentData", nextData)
            txApp.saveNoValidate(live)
            syncPaymentLedger(live, liveValidated.payment, { manualReview: false, reviewReason: "", atomic: true }, txApp)
            persisted = { registration: live, data: nextData, existing: false }
        })
    } catch (err) {
        console.log("[paygate] payment persistence transaction failed:", err)
        return { status: 502, body: { code: "PAYGATE_UNAVAILABLE", error: "PayGate is temporarily unavailable" } }
    }
    if (conflict) {
        return { status: 409, body: { code: "PAYMENT_STATE_CHANGED", error: "This registration changed while payment was being prepared. Refresh and try again." } }
    }
    if (!persisted) {
        return { status: 502, body: { code: "PAYGATE_INVALID_RESPONSE", error: "PayGate returned an invalid response" } }
    }
    if (persisted.existing) {
        return { status: 200, body: paymentSession(persisted.registration, persisted.data, true) }
    }
    return { status: response.statusCode === 201 ? 201 : 200, body: paymentSession(persisted.registration, persisted.data, true) }
}

function reconcilePaymentForRegistration(registration) {
    var guard = require(__hooks + "/paygate-registration-guard.js")
    var config = getConfig()
    try {
        registration = $app.findRecordById("registrations", registration.id)
    } catch (_) {
        return { status: 404, body: { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" } }
    }
    var data = asObject(registration.get("paymentData"))
    if (data.provider !== PAYGATE_PROVIDER) {
        return { status: 409, body: { code: "PAYMENT_PROVIDER_CONFLICT", error: "This registration uses a different payment provider" } }
    }
    if (!data.paymentId || registration.getString("paymentStatus") === "paid") {
        if (data.paymentId) {
            var ledgerConflict = false
            try {
                $app.runInTransaction(function (txApp) {
                    var live = txApp.findRecordById("registrations", registration.id)
                    var liveData = asObject(live.get("paymentData"))
                    if (liveData.provider !== PAYGATE_PROVIDER || String(liveData.paymentId || "") !== String(data.paymentId)) {
                        ledgerConflict = true
                        return
                    }
                    syncPaymentLedger(live, {
                        id: String(liveData.paymentId),
                        status: String(liveData.providerStatus || (live.getString("paymentStatus") === "paid" ? "paid" : "pending")),
                        requestedAmountPaise: Number(liveData.requestedAmountPaise) || 0,
                        payableAmountPaise: Number(liveData.payableAmountPaise) || 0,
                        payableAmount: Number(liveData.payableAmount) || 0,
                        paidAt: String(liveData.paidAt || ""),
                    }, {
                        manualReview: liveData.manualReview === true,
                        reviewReason: String(liveData.reviewReason || ""),
                        atomic: true,
                    }, txApp)
                })
            } catch (err) {
                console.log("[paygate] ledger repair transaction failed:", err)
                return { status: 503, body: { code: "PAYGATE_RECONCILIATION_FAILED", error: "PayGate payment state could not be persisted safely" } }
            }
            if (ledgerConflict) {
                return { status: 409, body: { code: "PAYMENT_RECONCILIATION_REFUSED", error: "PayGate payment state changed while it was being reconciled" } }
            }
            registration = $app.findRecordById("registrations", registration.id)
            data = asObject(registration.get("paymentData"))
        }
        return { status: 200, body: paymentSession(registration, data, paymentConfigured(config)) }
    }
    if (!paymentConfigured(config)) {
        return { status: 200, body: paymentSession(registration, data, false) }
    }
    var lastSyncedAt = Date.parse(String(data.lastSyncedAt || ""))
    if (isFinite(lastSyncedAt) && Date.now() - lastSyncedAt < 4000) {
        return { status: 200, body: paymentSession(registration, data, true) }
    }

    var response
    try {
        var paymentPath = encodeURIComponent(String(data.paymentId))
        var statusPath = "/v1/payments/" + paymentPath
        response = payGateRequest(config, statusPath, "GET", null, { Authorization: "Bearer " + config.apiKey })
    } catch (err) {
        console.log("[paygate] status request failed:", err)
        return { status: 200, body: paymentSession(registration, data, false) }
    }
    if (response.statusCode === 429) {
        return { status: 429, body: { code: "PAYGATE_RATE_LIMITED", error: "PayGate payment verification asked us to slow down", retryAfterMs: 10000 } }
    }
    if (response.statusCode !== 200) {
        return { status: 200, body: paymentSession(registration, data, false) }
    }
    var amountPaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration)
    if (amountPaise <= 0 || amountPaise % 100 !== 0) {
        return { status: 409, body: { code: "PAYGATE_AMOUNT_INVALID", error: "This PayGate payment amount cannot be reconciled safely" } }
    }
    var validationOptions = {
        requireUpiUri: true,
        requireTransactionNote: true,
        paymentId: String(data.paymentId),
        externalId: registration.getString("event") || "",
        registrationId: registration.id,
        environment: deploymentNamespace(),
    }
    var validated = validateProviderPayment(response.json, amountPaise / 100, validationOptions)
    if (!validated.ok) {
        console.log("[paygate] invalid status response:", validated.error)
        return { status: 409, body: { code: "PAYMENT_RECONCILIATION_REFUSED", error: validated.error } }
    }
    var result = { action: "error", error: "PayGate registration changed while status was being reconciled" }
    try {
        $app.runInTransaction(function (txApp) {
            var live = txApp.findRecordById("registrations", registration.id)
            var liveData = asObject(live.get("paymentData"))
            if (liveData.provider !== PAYGATE_PROVIDER) {
                result = { action: "error", error: "This registration uses a different payment provider" }
                return
            }
            var liveAmountPaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(live)
            if (liveAmountPaise <= 0 || liveAmountPaise % 100 !== 0) {
                result = { action: "error", error: "This PayGate payment amount cannot be reconciled safely" }
                return
            }
            var liveValidated = validateProviderPayment(response.json, liveAmountPaise / 100, {
                requireUpiUri: true,
                requireTransactionNote: true,
                paymentId: String(liveData.paymentId || ""),
                externalId: live.getString("event") || "",
                registrationId: live.id,
                environment: deploymentNamespace(),
            })
            if (!liveValidated.ok) {
                result = { action: "error", error: liveValidated.error }
                return
            }
            var livePayment = liveValidated.payment
            if (livePayment.status === "paid") {
                var disposition = guard.paymentConfirmationDisposition(live, txApp)
                if (disposition.blocked) {
                    guard.recordPaidManualReview(live, livePayment, "", disposition.reason, txApp)
                    result = { action: "manual_review" }
                    return
                }
            }
            result = applyProviderState(live, livePayment, "payment." + livePayment.status, "", txApp)
        })
    } catch (err) {
        console.log("[paygate] status persistence transaction failed:", err)
        return { status: 503, body: { code: "PAYGATE_RECONCILIATION_FAILED", error: "PayGate status could not be persisted safely" } }
    }
    if (result.action === "error") {
        return { status: 409, body: { code: "PAYMENT_RECONCILIATION_REFUSED", error: result.error } }
    }
    registration = $app.findRecordById("registrations", registration.id)
    return { status: 200, body: paymentSession(registration, registration.get("paymentData"), true), notify: result.action === "confirm" }
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
    deploymentNamespace: deploymentNamespace,
    asObject: asObject,
    getConfig: getConfig,
    paymentConfigured: paymentConfigured,
    webhookConfigured: webhookConfigured,
    idempotencyKeyForRegistration: idempotencyKeyForRegistration,
    expectedRequestedPaise: expectedRequestedPaise,
    moneyStringToPaise: moneyStringToPaise,
    normalizeProviderPayment: normalizeProviderPayment,
    registrationIdFromProviderPayment: registrationIdFromProviderPayment,
    providerPersonName: providerPersonName,
    validateProviderPayment: validateProviderPayment,
    mergePaymentData: mergePaymentData,
    appendEventId: appendEventId,
    hasEventId: hasEventId,
    resolveProviderTransition: resolveProviderTransition,
    payGateRequest: payGateRequest,
    safeProviderError: safeProviderError,
    paymentSession: paymentSession,
    mayAccessRegistration: mayAccessRegistration,
    enqueueRegistrationNotifications: enqueueRegistrationNotifications,
    updateProviderData: updateProviderData,
    syncPaymentLedger: syncPaymentLedger,
    applyProviderState: applyProviderState,
    createPaymentForRegistration: createPaymentForRegistration,
    reconcilePaymentForRegistration: reconcilePaymentForRegistration,
    shouldReleasePendingRegistration: shouldReleasePendingRegistration,
}
