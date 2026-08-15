/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/app/registrations/{id}/payment", function (e) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var config = helpers.getConfig()
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!helpers.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })

  var ledger = helpers.findLedgerPayment($app, id)
  if (registration.getString("paymentStatus") === "paid" && registration.getString("registrationStatus") === "confirmed") {
    return e.json(200, helpers.paymentSession(registration, ledger, config, helpers.apiConfigured(config)))
  }
  if (registration.getString("registrationStatus") !== "pending" || registration.getString("paymentStatus") !== "pending" || helpers.expectedPaise(registration) <= 0) {
    return e.json(409, { code: "PAYMENT_NOT_AVAILABLE", error: "This registration is not awaiting payment" })
  }
  if (!helpers.apiConfigured(config)) return e.json(503, { code: "RAZORPAY_NOT_CONFIGURED", error: "Razorpay is not configured" })
  if (!config.paymentsEnabled && (!ledger || !ledger.getString("providerOrderId"))) {
    return e.json(503, { code: "PAYMENTS_PAUSED", error: "New online payments are temporarily paused" })
  }
  if (ledger && ledger.getString("providerOrderId")) {
    return e.json(200, helpers.paymentSession(registration, ledger, config, true))
  }

  var creation
  try { creation = helpers.createOrRecoverOrder(config, registration) }
  catch (err) {
    console.log("[razorpay] direct order create/recover failed:", err)
    return e.json(502, { code: "RAZORPAY_UNAVAILABLE", error: "Razorpay is temporarily unavailable" })
  }
  if (!creation.ok) {
    console.log("[razorpay] direct order create/recover refused:", creation.error)
    if (creation.statusCode === 429) {
      return e.json(429, { code: "RAZORPAY_RATE_LIMITED", error: "Razorpay asked us to slow down payment setup", retryAfterMs: 10000 })
    }
    return e.json(502, { code: "RAZORPAY_ORDER_FAILED", error: "Razorpay could not prepare this payment" })
  }

  var finalized
  try { finalized = state.finalizeOrderCreation($app, id, creation.raw, config) }
  catch (err) {
    console.log("[razorpay] order finalization failed:", err)
    return e.json(500, { code: "RAZORPAY_TRANSITION_FAILED", error: "Could not finalize Razorpay order" })
  }
  if (!finalized.ok) return e.json(finalized.status, { code: finalized.code, error: finalized.error })
  registration = $app.findRecordById("registrations", id)
  ledger = helpers.findLedgerPayment($app, id)
  return e.json(finalized.reused || creation.recovered ? 200 : 201, helpers.paymentSession(registration, ledger, config, true))
}, $apis.requireAuth("users"))
routerAdd("GET", "/api/app/registrations/{id}/payment", function (e) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var config = helpers.getConfig()
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!helpers.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
  var ledger = helpers.findLedgerPayment($app, id)

  // Local-only status read: safe to poll without creating Razorpay API traffic.
  return e.json(200, helpers.paymentSession(registration, ledger, config, helpers.apiConfigured(config)))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/registrations/{id}/payment/reconcile", function (e) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var config = helpers.getConfig()
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!helpers.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })

  var ledger = helpers.findLedgerPayment($app, id)
  if (!ledger || !ledger.getString("providerOrderId")) {
    return e.json(200, helpers.paymentSession(registration, ledger, config, helpers.apiConfigured(config)))
  }
  if (!helpers.apiConfigured(config)) {
    return e.json(200, helpers.paymentSession(registration, ledger, config, false))
  }
  if (registration.getString("registrationStatus") === "confirmed" && registration.getString("paymentStatus") === "paid") {
    return e.json(200, helpers.paymentSession(registration, ledger, config, true))
  }

  // Protect the shared merchant rate limit from rapid refreshes and multiple tabs.
  var lastSyncedAt = Date.parse(ledger.getString("lastSyncedAt") || "")
  if (isFinite(lastSyncedAt) && Date.now() - lastSyncedAt < 4000) {
    return e.json(200, helpers.paymentSession(registration, ledger, config, true))
  }

  var response
  try {
    response = helpers.apiRequest(config, "/v1/orders/" + encodeURIComponent(ledger.getString("providerOrderId")) + "/payments", "GET", null, {})
  } catch (err) {
    console.log("[razorpay] explicit payment reconciliation failed:", err)
    return e.json(200, helpers.paymentSession(registration, ledger, config, false))
  }
  if (response.statusCode === 429) {
    return e.json(429, {
      code: "RAZORPAY_RATE_LIMITED",
      error: "Razorpay asked us to slow down payment checks",
      retryAfterMs: 10000,
    })
  }
  if (response.statusCode !== 200 || !response.json || !Array.isArray(response.json.items)) {
    return e.json(200, helpers.paymentSession(registration, ledger, config, false))
  }

  var items = response.json.items.slice()
  items.sort(function(a, b) { return Number(a.created_at || 0) - Number(b.created_at || 0) })
  var shouldNotify = false
  for (var i = 0; i < items.length; i++) {
    try {
      var outcome = state.applyProviderPayment($app, id, items[i], ledger.getString("providerOrderId"))
      if (outcome.ok && outcome.notify) shouldNotify = true
    } catch (err) { console.log("[razorpay] explicit reconciliation transition failed:", err) }
  }
  if (shouldNotify) helpers.enqueueRegistrationNotifications(id)

  try {
    $app.runInTransaction(function(txApp) {
      var current = helpers.findLedgerPayment(txApp, id)
      if (!current) return
      current.set("lastSyncedAt", new Date().toISOString())
      txApp.saveNoValidate(current)
    })
  } catch (_) {}

  try { registration = $app.findRecordById("registrations", id) } catch (_) {}
  ledger = helpers.findLedgerPayment($app, id)
  return e.json(200, helpers.paymentSession(registration, ledger, config, true))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/registrations/{id}/payment/razorpay-verify", function (e) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var config = helpers.getConfig()
  if (!helpers.apiConfigured(config)) return e.json(503, { code: "RAZORPAY_NOT_CONFIGURED", error: "Razorpay is not configured" })
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!helpers.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
  var ledger = helpers.findLedgerPayment($app, id)
  if (!ledger || !ledger.getString("providerOrderId")) return e.json(409, { code: "RAZORPAY_ORDER_NOT_INITIALIZED", error: "Razorpay order is not initialized" })

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var orderId = String(body.razorpay_order_id || "").trim()
  var paymentId = String(body.razorpay_payment_id || "").trim()
  var signature = String(body.razorpay_signature || "").trim()
  if (orderId !== ledger.getString("providerOrderId") || paymentId.indexOf("pay_") !== 0 || !signature) {
    return e.json(400, { code: "RAZORPAY_CALLBACK_INVALID", error: "Razorpay checkout response is invalid" })
  }
  if (!helpers.verifyCheckoutSignature(ledger.getString("providerOrderId"), paymentId, signature, config.keySecret)) {
    return e.json(400, { code: "RAZORPAY_SIGNATURE_INVALID", error: "Razorpay checkout signature is invalid" })
  }

  var response
  try { response = helpers.apiRequest(config, "/v1/payments/" + encodeURIComponent(paymentId), "GET", null, {}) }
  catch (err) {
    console.log("[razorpay] payment verification fetch failed:", err)
    return e.json(502, { code: "RAZORPAY_UNAVAILABLE", error: "Razorpay verification is temporarily unavailable" })
  }
  if (response.statusCode === 429) {
    return e.json(429, { code: "RAZORPAY_RATE_LIMITED", error: "Razorpay asked us to slow down verification", retryAfterMs: 10000 })
  }
  if (response.statusCode !== 200) return e.json(502, { code: "RAZORPAY_VERIFICATION_FAILED", error: "Razorpay could not verify this payment" })
  var outcome = state.applyProviderPayment($app, id, response.json, ledger.getString("providerOrderId"))
  if (!outcome.ok) return e.json(outcome.status, { code: outcome.code, error: outcome.error })
  if (outcome.notify) helpers.enqueueRegistrationNotifications(id)
  registration = $app.findRecordById("registrations", id)
  ledger = helpers.findLedgerPayment($app, id)
  return e.json(200, helpers.paymentSession(registration, ledger, config, true))
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/webhooks/razorpay", function (e) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var config = helpers.getConfig()
  if (!helpers.webhookConfigured(config)) return e.json(503, { code: "RAZORPAY_WEBHOOK_NOT_CONFIGURED", error: "Razorpay webhook is not configured" })
  var rawBody = toString(e.request.body)
  var signature = String(e.request.header.get("X-Razorpay-Signature") || "").trim()
  if (!helpers.verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return e.json(401, { code: "RAZORPAY_SIGNATURE_INVALID", error: "Invalid Razorpay webhook signature" })
  }
  var body
  try { body = JSON.parse(rawBody || "{}") }
  catch (_) { return e.json(400, { code: "INVALID_JSON", error: "Invalid webhook body" }) }
  var eventType = String(body && body.event || "").trim()
  if (!eventType) return e.json(400, { code: "INVALID_RAZORPAY_EVENT", error: "Invalid Razorpay event envelope" })
  var handled = {
    "payment.authorized": true, "payment.captured": true, "payment.failed": true, "order.paid": true,
    "refund.created": true, "refund.processed": true, "refund.failed": true,
    "payment.dispute.created": true, "payment.dispute.won": true, "payment.dispute.lost": true,
    "payment.dispute.closed": true, "payment.dispute.under_review": true, "payment.dispute.action_required": true,
  }
  if (!handled[eventType]) return e.json(200, { success: true, ignored: true, type: eventType })

  var payload = body.payload && typeof body.payload === "object" ? body.payload : {}
  var paymentEntity = payload.payment && payload.payment.entity
  var orderEntity = payload.order && payload.order.entity
  var refundEntity = payload.refund && payload.refund.entity
  var entityType = ""
  var entityId = ""
  if (paymentEntity && paymentEntity.id) { entityType = "payment"; entityId = String(paymentEntity.id) }
  else if (refundEntity && refundEntity.payment_id) { entityType = "payment"; entityId = String(refundEntity.payment_id) }
  else if (orderEntity && orderEntity.id) { entityType = "order"; entityId = String(orderEntity.id) }
  if (!entityId) return e.json(200, { success: true, ignored: true, type: eventType })
  var payloadHash = $security.sha256(rawBody)
  var eventId = String(e.request.header.get("X-Razorpay-Event-Id") || "").trim() || ("hash_" + payloadHash)
  try {
    $app.findFirstRecordByFilter("payment_webhook_events", "eventId = {:eventId}", { eventId: eventId })
    return e.json(200, { success: true, duplicate: true })
  } catch (_) {}

  try {
    var collection = $app.findCollectionByNameOrId("payment_webhook_events")
    var record = new Record(collection, {
      eventId: eventId,
      eventType: eventType,
      entityType: entityType,
      entityId: entityId,
      payloadHash: payloadHash,
      status: "pending",
      attempts: 0,
      providerCreatedAt: body.created_at ? new Date(Number(body.created_at) * 1000).toISOString() : "",
    })
    $app.saveNoValidate(record)
  } catch (err) {
    try {
      $app.findFirstRecordByFilter("payment_webhook_events", "eventId = {:eventId}", { eventId: eventId })
      return e.json(200, { success: true, duplicate: true })
    } catch (_) {}
    console.log("[razorpay] webhook inbox write failed:", err)
    return e.json(500, { code: "RAZORPAY_WEBHOOK_INBOX_FAILED", error: "Could not persist Razorpay event" })
  }
  return e.json(200, { success: true, queued: true })
})
cronAdd("razorpay-webhook-inbox", "* * * * *", function () {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var config = helpers.getConfig()
  if (!helpers.apiConfigured(config)) return
  var records = []
  try {
    records = $app.findRecordsByFilter(
      "payment_webhook_events",
      "(status = {:pending} || status = {:failed}) && attempts < 8",
      "receivedAt", 25, 0,
      { pending: "pending", failed: "failed" }
    )
  } catch (err) { console.log("[razorpay] webhook inbox scan failed:", err); return }

  for (var i = 0; i < records.length; i++) {
    var eventId = records[i].id
    var eventType = records[i].getString("eventType") || ""
    var entityType = records[i].getString("entityType") || ""
    var entityId = records[i].getString("entityId") || ""
    try {
      $app.runInTransaction(function(txApp) {
        var current = txApp.findRecordById("payment_webhook_events", eventId)
        if (current.getString("status") === "processed" || current.getString("status") === "ignored") return
        current.set("status", "processing")
        current.set("attempts", (current.getInt("attempts") || 0) + 1)
        current.set("lastError", "")
        txApp.saveNoValidate(current)
      })
      var ledger = null
      var shouldNotify = false
      if (entityType === "payment") {
        var paymentResponse = helpers.apiRequest(config, "/v1/payments/" + encodeURIComponent(entityId), "GET", null, {})
        if (paymentResponse.statusCode !== 200) throw new Error("Razorpay payment fetch returned " + paymentResponse.statusCode)
        var orderId = String(paymentResponse.json && paymentResponse.json.order_id || "")
        ledger = state.findLedgerByOrder($app, orderId)
        if (ledger) {
          var outcome = state.applyProviderPayment($app, ledger.getString("registration"), paymentResponse.json, orderId)
          if (!outcome.ok) throw new Error(outcome.error || "Razorpay payment transition failed")
          shouldNotify = outcome.notify === true
          if (eventType.indexOf("payment.dispute.") === 0) state.markDispute($app, entityId, eventType)
        }
      } else if (entityType === "order") {
        ledger = state.findLedgerByOrder($app, entityId)
        if (ledger) {
          var orderPayments = helpers.apiRequest(config, "/v1/orders/" + encodeURIComponent(entityId) + "/payments", "GET", null, {})
          if (orderPayments.statusCode !== 200 || !orderPayments.json || !Array.isArray(orderPayments.json.items)) {
            throw new Error("Razorpay order payment fetch failed")
          }
          var paymentItems = orderPayments.json.items.slice()
          paymentItems.sort(function(a, b) { return Number(a.created_at || 0) - Number(b.created_at || 0) })
          for (var pi = 0; pi < paymentItems.length; pi++) {
            var orderOutcome = state.applyProviderPayment($app, ledger.getString("registration"), paymentItems[pi], entityId)
            if (!orderOutcome.ok) throw new Error(orderOutcome.error || "Razorpay order transition failed")
            if (orderOutcome.notify) shouldNotify = true
          }
        }
      }
      if (shouldNotify && ledger) helpers.enqueueRegistrationNotifications(ledger.getString("registration"))
      $app.runInTransaction(function(txApp) {
        var current = txApp.findRecordById("payment_webhook_events", eventId)
        current.set("status", ledger ? "processed" : "ignored")
        current.set("processedAt", new Date().toISOString())
        current.set("lastError", "")
        txApp.saveNoValidate(current)
      })
    } catch (err) {
      console.log("[razorpay] webhook worker failed for " + eventId + ":", err)
      try {
        $app.runInTransaction(function(txApp) {
          var failed = txApp.findRecordById("payment_webhook_events", eventId)
          failed.set("status", "failed")
          failed.set("lastError", String(err && err.message || err).slice(0, 4000))
          txApp.saveNoValidate(failed)
        })
      } catch (_) {}
    }
  }
})
cronAdd("razorpay-pending-reconciliation", "* * * * *", function () {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var config = helpers.getConfig()
  if (!helpers.apiConfigured(config)) return
  var rows = []
  try {
    rows = $app.findRecordsByFilter(
      "payments", "status = {:pending} || status = {:authorized}",
      "holdExpiresAt", 100, 0,
      { pending: "pending", authorized: "authorized" }
    )
  } catch (err) { console.log("[razorpay] pending reconciliation scan failed:", err); return }

  for (var i = 0; i < rows.length; i++) {
    var orderId = rows[i].getString("providerOrderId") || ""
    if (!orderId) continue
    try {
      var response = helpers.apiRequest(config, "/v1/orders/" + encodeURIComponent(orderId) + "/payments", "GET", null, {})
      if (response.statusCode !== 200 || !response.json || !Array.isArray(response.json.items)) continue
      var items = response.json.items.slice()
      items.sort(function(a, b) { return Number(a.created_at || 0) - Number(b.created_at || 0) })
      var notify = false
      for (var pi = 0; pi < items.length; pi++) {
        var outcome = state.applyProviderPayment($app, rows[i].getString("registration"), items[pi], orderId)
        if (outcome.ok && outcome.notify) notify = true
      }
      if (notify) helpers.enqueueRegistrationNotifications(rows[i].getString("registration"))
      var release = state.releaseExpiredPayment($app, rows[i].id, new Date().toISOString())
      if (release.released) {
        if (release.eventId) rh.recomputeEventCounters(release.eventId)
        if (release.couponCode && release.eventId) rh.recomputeCouponUsedCount(release.couponCode, release.eventId)
      }
    } catch (err) { console.log("[razorpay] pending reconciliation failed for " + rows[i].id + ":", err) }
  }
})
cronAdd("razorpay-captured-reconciliation", "17 * * * *", function () {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var state = require(__hooks + "/razorpay-payment-state.js")
  var config = helpers.getConfig()
  if (!helpers.apiConfigured(config)) return
  var rows = []
  try {
    rows = $app.findRecordsByFilter(
      "payments", "status = {:captured} || status = {:partial}",
      "-updated", 100, 0,
      { captured: "captured", partial: "partially_refunded" }
    )
  } catch (err) { console.log("[razorpay] captured reconciliation scan failed:", err); return }

  for (var i = 0; i < rows.length; i++) {
    var paymentId = rows[i].getString("capturedPaymentId") || ""
    if (!paymentId) continue
    try {
      var response = helpers.apiRequest(config, "/v1/payments/" + encodeURIComponent(paymentId), "GET", null, {})
      if (response.statusCode !== 200) continue
      var outcome = state.applyProviderPayment(
        $app, rows[i].getString("registration"), response.json, rows[i].getString("providerOrderId")
      )
      if (outcome.ok && outcome.notify) helpers.enqueueRegistrationNotifications(rows[i].getString("registration"))
    } catch (err) { console.log("[razorpay] captured reconciliation failed for " + rows[i].id + ":", err) }
  }
})
