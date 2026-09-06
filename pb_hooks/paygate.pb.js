/// <reference path="../pb_data/types.d.ts" />

// PayGate v4 provider integration. The signed webhook is an optimization;
// reconciliation remains an independent correctness path for pending payments.
routerAdd("POST", "/api/webhooks/paygate", function (e) {
  var pg = require(__hooks + "/paygate-helpers.js")
  var guard = require(__hooks + "/paygate-registration-guard.js")
  var config = pg.getConfig()
  if (!pg.webhookConfigured(config)) {
    return e.json(503, { code: "PAYGATE_WEBHOOK_NOT_CONFIGURED", error: "PayGate webhook is not configured" })
  }

  var eventId = String(e.request.header.get("X-PayGate-Event-Id") || e.request.header.get("PayGate-Event-Id") || "").trim()
  var timestamp = String(e.request.header.get("X-PayGate-Timestamp") || e.request.header.get("PayGate-Timestamp") || "").trim()
  var signatureHeader = String(e.request.header.get("X-PayGate-Signature") || e.request.header.get("PayGate-Signature") || "").trim()
  if (!eventId || !timestamp || !signatureHeader) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_MISSING", error: "Missing PayGate signature headers" })
  }
  var timestampNumber = Number(timestamp)
  var nowSeconds = Math.floor(Date.now() / 1000)
  if (!isFinite(timestampNumber) || Math.floor(timestampNumber) !== timestampNumber || Math.abs(nowSeconds - timestampNumber) > config.webhookToleranceSeconds) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_STALE", error: "PayGate webhook timestamp is outside the accepted window" })
  }

  var rawBody = toString(e.request.body)
  var providedSignature = signatureHeader.indexOf("v1=") === 0 ? signatureHeader.slice(3) : ""
  var expectedSignature = $security.hs256(timestamp + "." + rawBody, config.webhookSecret)
  if (!providedSignature || !$security.equal(expectedSignature, providedSignature)) {
    return e.json(401, { code: "PAYGATE_SIGNATURE_INVALID", error: "Invalid PayGate webhook signature" })
  }

  var body
  try { body = JSON.parse(rawBody || "{}") }
  catch (_) { return e.json(400, { code: "INVALID_JSON", error: "Invalid webhook body" }) }
  if (!body || typeof body !== "object" || body.id !== eventId || typeof body.type !== "string") {
    return e.json(400, { code: "INVALID_PAYGATE_EVENT", error: "Invalid PayGate event envelope" })
  }
  var handled = { "payment.paid": true, "payment.expired": true, "payment.cancelled": true, "payment.late": true }
  if (!handled[body.type]) return e.json(200, { success: true, ignored: true, type: body.type })

  var rawPayment = body.data && body.data.payment
  var registrationId = pg.registrationIdFromProviderPayment(rawPayment, { allowWebhookShape: true })
  if (!registrationId) return e.json(200, { success: true, ignored: true })
  var responseStatus = 200
  var responseBody = { success: true, ignored: true }
  var shouldNotify = false
  try {
    $app.runInTransaction(function (txApp) {
      var registration
      try { registration = txApp.findRecordById("registrations", registrationId) }
      catch (_) {
        responseStatus = 404
        responseBody = { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }
        return
      }

      var current = pg.asObject(registration.get("paymentData"))
      if (current.provider !== pg.PAYGATE_PROVIDER) {
        responseStatus = 409
        responseBody = { code: "PAYMENT_PROVIDER_CONFLICT", error: "Registration is not assigned to PayGate" }
        return
      }
      if (pg.hasEventId(current, eventId)) {
        pg.syncPaymentLedger(registration, {
          id: String(current.paymentId || ""),
          status: String(current.providerStatus || (registration.getString("paymentStatus") === "paid" ? "paid" : "pending")),
          requestedAmountPaise: Number(current.requestedAmountPaise) || 0,
          payableAmountPaise: Number(current.payableAmountPaise) || 0,
          payableAmount: Number(current.payableAmount) || 0,
          paidAt: String(current.paidAt || ""),
        }, {
          manualReview: current.manualReview === true,
          reviewReason: String(current.reviewReason || ""),
          atomic: true,
        }, txApp)
        responseBody = { success: true, message: "Already processed" }
        return
      }

      var finalPaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration)
      if (finalPaise <= 0 || finalPaise % 100 !== 0) {
        responseStatus = 400
        responseBody = { code: "PAYGATE_EVENT_MISMATCH", error: "Registration amount is not compatible with PayGate" }
        return
      }
      var validated = pg.validateProviderPayment(rawPayment, finalPaise / 100, {
        paymentId: current.paymentId ? String(current.paymentId) : "",
        externalId: registration.getString("event") || "",
        registrationId: registration.id,
        environment: pg.deploymentNamespace(),
        allowWebhookShape: true,
      })
      if (!validated.ok) {
        console.log("[paygate] webhook refused:", validated.error)
        responseStatus = 400
        responseBody = { code: "PAYGATE_EVENT_MISMATCH", error: validated.error }
        return
      }

      if (validated.payment.status === "paid") {
        var disposition = guard.paymentConfirmationDisposition(registration, txApp)
        if (disposition.blocked) {
          guard.recordPaidManualReview(registration, validated.payment, eventId, disposition.reason, txApp)
          responseBody = { success: true, action: "paid_manual_review" }
          return
        }
      }

      var result = pg.applyProviderState(registration, validated.payment, body.type, eventId, txApp)
      if (result.action === "error") {
        responseStatus = 400
        responseBody = { code: "PAYGATE_EVENT_MISMATCH", error: result.error }
        return
      }
      shouldNotify = result.action === "confirm" || result.action === "noop"
      responseBody = { success: true, action: result.action }
    })
  } catch (err) {
    console.log("[paygate] webhook transaction failed:", err)
    return e.json(500, { code: "PAYGATE_WEBHOOK_FAILED", error: "Could not persist PayGate webhook state" })
  }
  if (shouldNotify) pg.enqueueRegistrationNotifications(registrationId)
  return e.json(responseStatus, responseBody)
})

cronAdd("paygate-registration-expiry", "* * * * *", function () {
  var pg = require(__hooks + "/paygate-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var config = pg.getConfig()
  var records = []
  try {
    records = $app.findRecordsByFilter(
      "registrations",
      "registrationStatus = {:registrationStatus} && paymentStatus = {:paymentStatus}",
      "registrationDate", 0, 0,
      { registrationStatus: "pending", paymentStatus: "pending" }
    )
  } catch (err) { console.log("[paygate] failed to scan pending registrations:", err); return }

  var nowMs = Date.now()
  for (var i = 0; i < records.length; i++) {
    var registration = records[i]
    var data = pg.asObject(registration.get("paymentData"))
    if (data.provider !== pg.PAYGATE_PROVIDER) continue

    // Webhook delivery is an optimization, not a correctness dependency. The
    // shared temporary PayGate service has one callback URL, so each IEEE
    // environment also reconciles its own pending PayGate sessions once a minute.
    var providerAuthoritative = !data.paymentId
    if (data.paymentId) {
      try {
        var reconciled = pg.reconcilePaymentForRegistration(registration)
        if (reconciled.notify) pg.enqueueRegistrationNotifications(registration.id)
        providerAuthoritative = reconciled.status === 200 && reconciled.body && reconciled.body.providerReachable !== false
        registration = $app.findRecordById("registrations", registration.id)
        if (registration.getString("registrationStatus") !== "pending" || registration.getString("paymentStatus") !== "pending") continue
        data = pg.asObject(registration.get("paymentData"))
      } catch (reconcileErr) {
        providerAuthoritative = false
        console.log("[paygate] background reconciliation failed for " + registration.id + ":", reconcileErr)
      }
    }

    // Never release a real provider session from stale state. If PayGate is
    // unavailable or asks us to slow down, keep the seat pending and retry on
    // the next cron pass. This avoids losing an on-time bank credit whose SMS
    // arrived near the provider-expiry boundary.
    if (data.paymentId && !providerAuthoritative) continue
    var release = null
    try {
      $app.runInTransaction(function (txApp) {
        var live = txApp.findRecordById("registrations", registration.id)
        var liveData = pg.asObject(live.get("paymentData"))
        if (liveData.provider !== pg.PAYGATE_PROVIDER) return
        if (liveData.paymentId && !providerAuthoritative) return
        if (!pg.shouldReleasePendingRegistration(live, nowMs, config.registrationGraceSeconds)) return
        liveData.releaseReason = liveData.providerStatus === "expired"
          ? "PayGate payment expired and the IEEE grace window elapsed"
          : liveData.providerStatus === "not_initialized"
            ? "PayGate payment was never initialized before the IEEE grace window elapsed"
            : "PayGate payment could not complete"
        live.set("paymentStatus", "failed")
        live.set("registrationStatus", "cancelled")
        live.set("paymentData", liveData)
        txApp.saveNoValidate(live)
        release = {
          eventId: live.getString("event") || "",
          coupon: live.getString("couponCode") || "",
        }
      })
    } catch (err) {
      console.log("[paygate] failed to release registration " + registration.id + ":", err)
      continue
    }
    if (release) {
      if (release.eventId) rh.recomputeEventCounters(release.eventId)
      if (release.eventId && release.coupon) rh.recomputeCouponUsedCount(release.coupon, release.eventId)
    }
  }
})
