/// <reference path="../pb_data/types.d.ts" />

// PayGate direct-UPI integration.
//
// Trust boundaries:
// - the browser never receives PAYGATE_API_KEY;
// - IEEE PocketBase determines the registration amount;
// - payment creation uses a deterministic idempotency key per registration;
// - payment confirmation comes from either the signed PayGate webhook or a
//   server-side status reconciliation against the payment ID stored on the
//   registration;
// - cancelled registrations are terminal and are never resurrected.
//
// The older /api/webhooks/payment-confirm compatibility route remains in
// webhook.pb.js while deployments migrate to this native integration.

routerAdd(
  "POST",
  "/api/app/registrations/{id}/payment",
  function (e) {
    var pg = require(__hooks + "/paygate-helpers.js")
    var providers = require(__hooks + "/payment-provider-helpers.js")
    var config = pg.getConfig()
    var razorpayConfig = providers.getRazorpayConfig()

    var id = e.request.pathValue("id") || ""
    var registration
    try {
      registration = $app.findRecordById("registrations", id)
    } catch (_) {
      return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" })
    }

    var auth = e.auth
    var isAdmin = auth && auth.getString("role") === "admin"
    if (!auth || (registration.getString("user") !== auth.id && !isAdmin)) {
      return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
    }

    var registrationStatus = registration.getString("registrationStatus")
    var paymentStatus = registration.getString("paymentStatus")
    var amount = registration.getInt("amount") || 0
    if (paymentStatus === "paid" && registrationStatus === "confirmed") {
      return e.json(200, pg.paymentSession(registration, registration.get("paymentData"), true))
    }
    if (registrationStatus !== "pending" || paymentStatus !== "pending" || amount <= 0) {
      return e.json(409, { code: "PAYMENT_NOT_AVAILABLE", error: "This registration is not awaiting payment" })
    }

    var current = pg.asObject(registration.get("paymentData"))

    if (current.provider === providers.RAZORPAY_PROVIDER) {
      if (!providers.razorpayConfigured(razorpayConfig)) {
        return e.json(503, { code: "RAZORPAY_NOT_CONFIGURED", error: "Razorpay is not configured" })
      }
      if (current.paymentId) {
        return e.json(200, pg.paymentSession(registration, current, true))
      }

      var razorpayResponse
      try {
        razorpayResponse = providers.request(
          razorpayConfig,
          "/api/razorpay/live/orders",
          "POST",
          {
            amountPaise: providers.expectedPaise(registration),
            externalId: providers.razorpayExternalId(registration.id),
          },
          { "Idempotency-Key": providers.razorpayIdempotencyKey(registration.id) }
        )
      } catch (razorpayErr) {
        console.log("[razorpay] order creation request failed:", razorpayErr)
        return e.json(502, { code: "RAZORPAY_UNAVAILABLE", error: "Razorpay is temporarily unavailable" })
      }
      if (razorpayResponse.statusCode !== 200 && razorpayResponse.statusCode !== 201) {
        return e.json(502, { code: "RAZORPAY_ORDER_FAILED", error: "Razorpay could not prepare this payment" })
      }
      var validatedOrder = providers.validateOrder(razorpayResponse.json, registration, { requireCheckout: true })
      if (!validatedOrder.ok) {
        console.log("[razorpay] invalid create response:", validatedOrder.error)
        return e.json(502, { code: "RAZORPAY_INVALID_RESPONSE", error: validatedOrder.error })
      }
      var razorpayData = providers.updateOrderData(registration, validatedOrder.order, {
        manualReview: false,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      registration.set("paymentData", razorpayData)
      $app.saveNoValidate(registration)
      return e.json(razorpayResponse.statusCode === 201 ? 201 : 200, pg.paymentSession(registration, razorpayData, true))
    }

    if (current.provider && current.provider !== pg.PAYGATE_PROVIDER) {
      return e.json(409, { code: "PAYMENT_PROVIDER_CONFLICT", error: "This registration uses a different payment provider" })
    }
    if (!pg.paymentConfigured(config)) {
      return e.json(503, { code: "PAYGATE_NOT_CONFIGURED", error: "Online payment is not configured" })
    }

    // A previously created session is immutable for this registration. Reusing
    // it avoids allocating another paise fingerprint on refresh/retry.
    if (current.paymentId) {
      return e.json(200, pg.paymentSession(registration, current, true))
    }

    var externalId = pg.externalIdForRegistration(registration.id)
    var payload = {
      amount: amount,
      externalId: externalId,
      paymentAccount: current.paymentAccount || current.eventPaymentProvider || "kotak",
      metadata: {
        registrationId: registration.id,
        eventId: registration.getString("event") || "",
        paymentTicketId: registration.getString("paymentTicketId") || "",
      },
    }

    var response
    try {
      response = pg.payGateRequest(
        config,
        "/api/payments",
        "POST",
        payload,
        {
          Authorization: "Bearer " + config.apiKey,
          "Idempotency-Key": pg.idempotencyKeyForRegistration(registration.id),
        }
      )
    } catch (err) {
      console.log("[paygate] payment creation request failed:", err)
      return e.json(502, { code: "PAYGATE_UNAVAILABLE", error: "Payment service is temporarily unavailable" })
    }

    if (response.statusCode !== 200 && response.statusCode !== 201) {
      var upstream = pg.safeProviderError(response)
      return e.json(upstream.status, { code: upstream.code, error: upstream.message })
    }

    var validated = pg.validateProviderPayment(response.json, amount, {
      requireUpiUri: true,
      externalId: externalId,
    })
    if (!validated.ok) {
      console.log("[paygate] invalid create response:", validated.error)
      return e.json(502, { code: "PAYGATE_INVALID_RESPONSE", error: "Payment service returned an invalid response" })
    }

    var payment = validated.payment
    var nextData = pg.updateProviderData(registration, payment, {
      provider: pg.PAYGATE_PROVIDER,
      createdAt: new Date().toISOString(),
      manualReview: false,
    })
    registration.set("paymentData", nextData)
    $app.saveNoValidate(registration)

    return e.json(response.statusCode === 201 ? 201 : 200, pg.paymentSession(registration, nextData, true))
  },
  $apis.requireAuth("users")
)

routerAdd(
  "GET",
  "/api/app/registrations/{id}/payment",
  function (e) {
    var pg = require(__hooks + "/paygate-helpers.js")
    var guard = require(__hooks + "/paygate-registration-guard.js")
    var providers = require(__hooks + "/payment-provider-helpers.js")
    var config = pg.getConfig()
    var razorpayConfig = providers.getRazorpayConfig()

    var id = e.request.pathValue("id") || ""
    var registration
    try {
      registration = $app.findRecordById("registrations", id)
    } catch (_) {
      return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" })
    }

    var auth = e.auth
    var isAdmin = auth && auth.getString("role") === "admin"
    if (!auth || (registration.getString("user") !== auth.id && !isAdmin)) {
      return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
    }

    var data = pg.asObject(registration.get("paymentData"))
    if (data.provider === providers.RAZORPAY_PROVIDER) {
      if (!data.paymentId) {
        return e.json(200, pg.paymentSession(registration, data, providers.razorpayConfigured(razorpayConfig)))
      }
      if (!providers.razorpayConfigured(razorpayConfig)) {
        return e.json(200, pg.paymentSession(registration, data, false))
      }
      var razorpayResponse
      try {
        razorpayResponse = providers.request(
          razorpayConfig,
          "/api/razorpay/live/orders/" + encodeURIComponent(String(data.paymentId)),
          "GET",
          null,
          {}
        )
      } catch (razorpayErr) {
        console.log("[razorpay] order status request failed:", razorpayErr)
        return e.json(200, pg.paymentSession(registration, data, false))
      }
      if (razorpayResponse.statusCode !== 200) {
        return e.json(200, pg.paymentSession(registration, data, false))
      }
      var validatedOrder = providers.validateOrder(razorpayResponse.json, registration, {
        localOrderId: String(data.paymentId),
        razorpayOrderId: String(data.razorpayOrderId || ""),
      })
      if (!validatedOrder.ok) {
        console.log("[razorpay] invalid status response:", validatedOrder.error)
        return e.json(200, pg.paymentSession(registration, data, false))
      }
      providers.applyOrderState(registration, validatedOrder.order)
      try { registration = $app.findRecordById("registrations", id) } catch (_) {}
      return e.json(200, pg.paymentSession(registration, registration.get("paymentData"), true))
    }
    if (data.provider !== pg.PAYGATE_PROVIDER) {
      return e.json(404, { code: "PAYMENT_NOT_INITIALIZED", error: "Payment has not been initialized" })
    }
    if (!data.paymentId) {
      return e.json(200, pg.paymentSession(registration, data, pg.paymentConfigured(config)))
    }
    if (!pg.paymentConfigured(config)) {
      return e.json(200, pg.paymentSession(registration, data, false))
    }

    var response
    try {
      response = pg.payGateRequest(
        config,
        "/api/payments/" + encodeURIComponent(String(data.paymentId)),
        "GET",
        null,
        {}
      )
    } catch (err) {
      console.log("[paygate] status request failed:", err)
      return e.json(200, pg.paymentSession(registration, data, false))
    }

    if (response.statusCode !== 200) {
      return e.json(200, pg.paymentSession(registration, data, false))
    }

    var validated = pg.validateProviderPayment(response.json, registration.getInt("amount") || 0, {
      paymentId: String(data.paymentId),
    })
    if (!validated.ok) {
      console.log("[paygate] invalid status response:", validated.error)
      return e.json(200, pg.paymentSession(registration, data, false))
    }

    var payment = validated.payment
    if (payment.status === "paid") {
      var disposition = guard.paymentConfirmationDisposition(registration)
      if (disposition.blocked) {
        guard.recordPaidManualReview(registration, payment, "", disposition.reason)
        try { registration = $app.findRecordById("registrations", id) } catch (_) {}
        return e.json(200, pg.paymentSession(registration, registration.get("paymentData"), true))
      }
    }

    var eventType = "payment." + payment.status
    var result = pg.applyProviderState(registration, payment, eventType, "")
    if (result.action === "error") {
      console.log("[paygate] status reconciliation refused:", result.error)
      return e.json(409, { code: "PAYMENT_RECONCILIATION_REFUSED", error: result.error })
    }

    // applyProviderState may have saved a newer registration state.
    try { registration = $app.findRecordById("registrations", id) } catch (_) {}
    return e.json(200, pg.paymentSession(registration, registration.get("paymentData"), true))
  },
  $apis.requireAuth("users")
)

routerAdd(
  "POST",
  "/api/app/registrations/{id}/payment/razorpay-verify",
  function (e) {
    var pg = require(__hooks + "/paygate-helpers.js")
    var providers = require(__hooks + "/payment-provider-helpers.js")
    var config = providers.getRazorpayConfig()
    if (!providers.razorpayConfigured(config)) {
      return e.json(503, { code: "RAZORPAY_NOT_CONFIGURED", error: "Razorpay is not configured" })
    }

    var id = e.request.pathValue("id") || ""
    var registration
    try { registration = $app.findRecordById("registrations", id) }
    catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }

    var auth = e.auth
    var isAdmin = auth && auth.getString("role") === "admin"
    if (!auth || (registration.getString("user") !== auth.id && !isAdmin)) {
      return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
    }

    var data = pg.asObject(registration.get("paymentData"))
    if (data.provider !== providers.RAZORPAY_PROVIDER || !data.paymentId || !data.razorpayOrderId) {
      return e.json(409, { code: "RAZORPAY_ORDER_NOT_INITIALIZED", error: "Razorpay payment has not been initialized" })
    }

    var body = {}
    try { body = e.requestInfo().body || {} } catch (_) { body = {} }
    var orderId = String(body.razorpay_order_id || "").trim()
    var paymentId = String(body.razorpay_payment_id || "").trim()
    var signature = String(body.razorpay_signature || "").trim()
    if (orderId !== String(data.razorpayOrderId) || paymentId.indexOf("pay_") !== 0 || !signature) {
      return e.json(400, { code: "RAZORPAY_CALLBACK_INVALID", error: "Razorpay checkout response is invalid" })
    }

    var response
    try {
      response = providers.request(
        config,
        "/api/razorpay/live/orders/" + encodeURIComponent(String(data.paymentId)) + "/verify",
        "POST",
        {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        },
        {}
      )
    } catch (err) {
      console.log("[razorpay] checkout verification request failed:", err)
      return e.json(502, { code: "RAZORPAY_UNAVAILABLE", error: "Razorpay verification is temporarily unavailable" })
    }
    if (response.statusCode !== 200) {
      return e.json(response.statusCode >= 400 && response.statusCode < 500 ? 400 : 502, {
        code: "RAZORPAY_VERIFICATION_FAILED",
        error: "Razorpay could not verify this payment",
      })
    }

    var validatedOrder = providers.validateOrder(response.json, registration, {
      localOrderId: String(data.paymentId),
      razorpayOrderId: String(data.razorpayOrderId),
    })
    if (!validatedOrder.ok) {
      console.log("[razorpay] invalid verification response:", validatedOrder.error)
      return e.json(502, { code: "RAZORPAY_INVALID_RESPONSE", error: validatedOrder.error })
    }
    providers.applyOrderState(registration, validatedOrder.order)
    try { registration = $app.findRecordById("registrations", id) } catch (_) {}
    return e.json(200, pg.paymentSession(registration, registration.get("paymentData"), true))
  },
  $apis.requireAuth("users")
)

routerAdd("POST", "/api/webhooks/paygate", function (e) {
  var pg = require(__hooks + "/paygate-helpers.js")
  var guard = require(__hooks + "/paygate-registration-guard.js")
  var config = pg.getConfig()
  if (!pg.webhookConfigured(config)) {
    return e.json(503, { code: "PAYGATE_WEBHOOK_NOT_CONFIGURED", error: "PayGate webhook is not configured" })
  }

  var eventId = String(e.request.header.get("X-PayGate-Event-Id") || "").trim()
  var timestamp = String(e.request.header.get("X-PayGate-Timestamp") || "").trim()
  var signatureHeader = String(e.request.header.get("X-PayGate-Signature") || "").trim()
  if (!eventId || !timestamp || !signatureHeader) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_MISSING", error: "Missing PayGate signature headers" })
  }

  var timestampNumber = Number(timestamp)
  var nowSeconds = Math.floor(Date.now() / 1000)
  if (
    !isFinite(timestampNumber) ||
    Math.floor(timestampNumber) !== timestampNumber ||
    Math.abs(nowSeconds - timestampNumber) > config.webhookToleranceSeconds
  ) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_STALE", error: "PayGate webhook timestamp is outside the accepted window" })
  }

  var rawBody = toString(e.request.body)
  var providedSignature = signatureHeader.indexOf("v1=") === 0 ? signatureHeader.slice(3) : ""
  var expectedSignature = $security.hs256(timestamp + "." + rawBody, config.webhookSecret)
  if (!providedSignature || !$security.equal(expectedSignature, providedSignature)) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_INVALID", error: "Invalid PayGate webhook signature" })
  }

  var body
  try {
    body = JSON.parse(rawBody || "{}")
  } catch (_) {
    return e.json(400, { code: "INVALID_JSON", error: "Invalid webhook body" })
  }

  if (!body || typeof body !== "object" || body.id !== eventId || typeof body.type !== "string") {
    return e.json(400, { code: "INVALID_PAYGATE_EVENT", error: "Invalid PayGate event envelope" })
  }

  // A PayGate destination can receive refund and future lifecycle events too.
  // Authenticate the envelope first, then acknowledge event families IEEE does
  // not consume so PayGate doesn't retry a valid-but-irrelevant notification.
  var handledEventTypes = {
    "payment.paid": true,
    "payment.expired": true,
    "payment.cancelled": true,
    "payment.late": true,
  }
  if (!handledEventTypes[body.type]) {
    return e.json(200, { success: true, ignored: true, type: body.type })
  }

  var rawPayment = body.data && body.data.payment
  var externalId = rawPayment && rawPayment.externalId
  var registrationId = pg.registrationIdFromExternalId(externalId)
  if (!registrationId) {
    // The configured PayGate may serve more than IEEE. A valid event for
    // another application is acknowledged without exposing it to retries.
    return e.json(200, { success: true, ignored: true })
  }

  // Serialize the final registration transition with expiry/cancellation jobs.
  // The webhook body/signature is validated above, but the registration itself
  // is re-read under the SQLite writer transaction so stale in-memory state can
  // never resurrect a seat that an expiry transaction already released.
  var outcome = { action: "noop", duplicate: false }
  var transitionFailure = null
  try {
    $app.runInTransaction(function (txApp) {
      var registration
      try {
        registration = txApp.findRecordById("registrations", registrationId)
      } catch (_) {
        transitionFailure = { status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }
        return
      }

      var current = pg.asObject(registration.get("paymentData"))
      if (pg.hasEventId(current, eventId)) {
        outcome.duplicate = true
        return
      }

      var validated = pg.validateProviderPayment(rawPayment, registration.getInt("amount") || 0, {
        paymentId: current.paymentId ? String(current.paymentId) : "",
        externalId: pg.externalIdForRegistration(registration.id),
      })
      if (!validated.ok) {
        transitionFailure = { status: 400, code: "PAYGATE_EVENT_MISMATCH", error: validated.error }
        return
      }

      if (validated.payment.status === "paid") {
        var disposition = guard.paymentConfirmationDisposition(registration, txApp)
        if (disposition.blocked) {
          guard.recordPaidManualReview(
            registration, validated.payment, eventId, disposition.reason, txApp
          )
          outcome.action = "paid_manual_review"
          return
        }
      }

      var result = pg.applyProviderState(
        registration, validated.payment, body.type, eventId, txApp
      )
      if (result.action === "error") {
        transitionFailure = { status: 400, code: "PAYGATE_EVENT_MISMATCH", error: result.error }
        return
      }
      outcome.action = result.action
    })
  } catch (transitionErr) {
    console.log("[paygate] webhook transition failed:", transitionErr)
    return e.json(500, { code: "PAYGATE_TRANSITION_FAILED", error: "Could not apply PayGate event" })
  }

  if (transitionFailure) {
    console.log("[paygate] webhook refused:", transitionFailure.error)
    return e.json(transitionFailure.status, { code: transitionFailure.code, error: transitionFailure.error })
  }
  if (outcome.duplicate) {
    return e.json(200, { success: true, message: "Already processed" })
  }
  return e.json(200, { success: true, action: outcome.action })
})

cronAdd("paygate-registration-expiry", "* * * * *", function () {
  var pg = require(__hooks + "/paygate-helpers.js")
  var config = pg.getConfig()
  var records = []
  try {
    records = $app.findRecordsByFilter(
      "registrations",
      "registrationStatus = {:registrationStatus} && paymentStatus = {:paymentStatus}",
      "registrationDate",
      0,
      0,
      { registrationStatus: "pending", paymentStatus: "pending" }
    )
  } catch (err) {
    console.log("[paygate] failed to scan pending registrations:", err)
    return
  }

  var nowMs = Date.now()
  for (var i = 0; i < records.length; i++) {
    var registration = records[i]
    if (!pg.shouldReleasePendingRegistration(registration, nowMs, config.registrationGraceSeconds)) continue
    var data = pg.asObject(registration.get("paymentData"))
    data.releaseReason = data.providerStatus === "expired"
      ? "PayGate payment expired and the IEEE grace window elapsed"
      : data.providerStatus === "not_initialized"
        ? "PayGate payment was never initialized before the IEEE grace window elapsed"
        : "PayGate payment could not complete"
    try {
      registration.set("paymentStatus", "failed")
      registration.set("registrationStatus", "cancelled")
      registration.set("paymentData", data)
      $app.save(registration)
    } catch (err) {
      console.log("[paygate] failed to release registration " + registration.id + ":", err)
    }
  }
})

cronAdd("razorpay-registration-reconciliation", "* * * * *", function () {
  var pg = require(__hooks + "/paygate-helpers.js")
  var providers = require(__hooks + "/payment-provider-helpers.js")
  var config = providers.getRazorpayConfig()
  if (!providers.razorpayConfigured(config)) return

  var records = []
  try {
    records = $app.findRecordsByFilter(
      "registrations",
      "registrationStatus = {:registrationStatus} && paymentStatus = {:paymentStatus}",
      "registrationDate",
      0,
      0,
      { registrationStatus: "pending", paymentStatus: "pending" }
    )
  } catch (err) {
    console.log("[razorpay] failed to scan pending registrations:", err)
    return
  }

  for (var i = 0; i < records.length; i++) {
    var registration = records[i]
    var data = pg.asObject(registration.get("paymentData"))
    if (data.provider !== providers.RAZORPAY_PROVIDER) continue

    if (data.paymentId) {
      try {
        var response = providers.request(
          config,
          "/api/razorpay/live/orders/" + encodeURIComponent(String(data.paymentId)),
          "GET",
          null,
          {}
        )
        if (response.statusCode === 200) {
          var validated = providers.validateOrder(response.json, registration, {
            localOrderId: String(data.paymentId),
            razorpayOrderId: String(data.razorpayOrderId || ""),
          })
          if (validated.ok) providers.applyOrderState(registration, validated.order)
        }
      } catch (statusErr) {
        console.log("[razorpay] reconciliation failed for " + registration.id + ":", statusErr)
        continue
      }
    }

    try { registration = $app.findRecordById("registrations", registration.id) } catch (_) { continue }
    if (registration.getString("registrationStatus") !== "pending") continue
    data = pg.asObject(registration.get("paymentData"))
    var expiresAt = Date.parse(String(data.expiresAt || ""))
    if (!isFinite(expiresAt) || Date.now() <= expiresAt) continue

    data.releaseReason = "Razorpay checkout window ended before a captured payment was confirmed"
    data.providerStatus = data.providerStatus || "expired"
    registration.set("paymentStatus", "failed")
    registration.set("registrationStatus", "cancelled")
    registration.set("paymentData", data)
    try { $app.save(registration) }
    catch (saveErr) { console.log("[razorpay] failed to release registration " + registration.id + ":", saveErr) }
  }
})
