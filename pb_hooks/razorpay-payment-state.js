/// <reference path="../pb_data/types.d.ts" />

function registrationFees(registration) {
  var finalPaise = Number(registration.getInt("finalFeePaise") || 0)
  var discountPaise = Number(registration.getInt("discountPaise") || 0)
  var basePaise = Number(registration.getInt("baseFeePaise") || 0)
  if (!finalPaise) finalPaise = Math.max(0, Number(registration.getInt("amount") || 0)) * 100
  if (!discountPaise) discountPaise = Math.max(0, Number(registration.getInt("discountAmount") || 0)) * 100
  if (!basePaise) basePaise = finalPaise + discountPaise
  return { basePaise: basePaise, discountPaise: discountPaise, finalPaise: finalPaise }
}

function orderLedgerStatus(order) {
  if (order.status === "paid") return "pending"
  return "pending"
}

function findLedger(app, registrationId) {
  try {
    var rows = app.findRecordsByFilter("payments", "registration = {:registration}", "-created", 1, 0, { registration: registrationId })
    return rows.length ? rows[0] : null
  } catch (_) { return null }
}

function findLedgerByOrder(app, orderId) {
  try { return app.findFirstRecordByFilter("payments", "providerOrderId = {:orderId}", { orderId: orderId }) }
  catch (_) { return null }
}

function saveCompatibility(registration, payment, helpers, app) {
  registration.set("paymentData", helpers.compatibilityData(registration, payment, {}))
  app.saveNoValidate(registration)
}
function finalizeOrderCreation(app, registrationId, rawOrder, config) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var result = { ok: false, status: 500, code: "RAZORPAY_ORDER_FINALIZE_FAILED", error: "Could not finalize Razorpay order", reused: false }
  app.runInTransaction(function(txApp) {
    var registration
    try { registration = txApp.findRecordById("registrations", registrationId) }
    catch (_) { result = { ok: false, status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }; return }
    var validation = helpers.validateOrder(rawOrder, registration)
    if (!validation.ok) { result = { ok: false, status: 502, code: "RAZORPAY_ORDER_INVALID", error: validation.error }; return }
    var order = validation.order
    var payment = findLedger(txApp, registrationId)
    if (payment && payment.getString("provider") !== "razorpay") payment = null
    if (payment && payment.getString("providerOrderId") && payment.getString("providerOrderId") !== order.id) {
      result = { ok: false, status: 409, code: "RAZORPAY_ORDER_CONFLICT", error: "Registration is already bound to another Razorpay order" }
      return
    }
    if (!payment) {
      var fees = registrationFees(registration)
      var collection = txApp.findCollectionByNameOrId("payments")
      payment = new Record(collection, {
        registration: registration.id,
        event: registration.getString("event") || "",
        provider: "razorpay",
        providerOrderId: order.id,
        receipt: order.receipt,
        status: orderLedgerStatus(order),
        baseFeePaise: fees.basePaise,
        discountPaise: fees.discountPaise,
        finalFeePaise: fees.finalPaise,
        collectedPaise: 0,
        refundedPaise: 0,
        currency: "INR",
        confirmationSource: "razorpay",
        holdExpiresAt: helpers.holdExpiresAt(config),
        lastSyncedAt: new Date().toISOString(),
        manualReview: false,
      })
      txApp.saveNoValidate(payment)
    } else {
      payment.set("providerOrderId", order.id)
      payment.set("receipt", order.receipt)
      payment.set("lastSyncedAt", new Date().toISOString())
      if (!payment.getString("holdExpiresAt")) payment.set("holdExpiresAt", helpers.holdExpiresAt(config))
      txApp.saveNoValidate(payment)
      result.reused = true
    }
    saveCompatibility(registration, payment, helpers, txApp)
    if (registration.getString("registrationStatus") !== "pending" || registration.getString("paymentStatus") !== "pending") {
      result = { ok: false, status: 409, code: "PAYMENT_NO_LONGER_AVAILABLE", error: "This registration is no longer awaiting payment", reused: result.reused }
      return
    }
    result = { ok: true, status: result.reused ? 200 : 201, paymentId: payment.id, orderId: order.id, reused: result.reused }
  })
  return result
}

function ensureAttempt(app, payment, providerPayment) {
  var attempt = null
  try { attempt = app.findFirstRecordByFilter("payment_attempts", "providerPaymentId = {:id}", { id: providerPayment.id }) } catch (_) {}
  if (!attempt) {
    var collection = app.findCollectionByNameOrId("payment_attempts")
    attempt = new Record(collection, {
      payment: payment.id,
      providerPaymentId: providerPayment.id,
      status: providerPayment.status,
      amountPaise: providerPayment.amountPaise,
      method: providerPayment.method || "",
      providerCreatedAt: providerPayment.createdAt || "",
      capturedAt: providerPayment.captured ? new Date().toISOString() : "",
    })
  } else {
    attempt.set("status", providerPayment.status)
    attempt.set("amountPaise", providerPayment.amountPaise)
    attempt.set("method", providerPayment.method || "")
    if (providerPayment.captured && !attempt.getString("capturedAt")) attempt.set("capturedAt", new Date().toISOString())
  }
  app.saveNoValidate(attempt)
  return attempt
}

function refundKey(paymentId, amountPaise, source) {
  return ("ieee_refund_" + paymentId + "_" + amountPaise + "_" + String(source || "system")).slice(0, 160)
}
function ensureRefund(app, payment, amountPaise, source, reason, requestedBy) {
  var key = refundKey(payment.id, amountPaise, source)
  var refund = null
  try { refund = app.findFirstRecordByFilter("payment_refunds", "idempotencyKey = {:key}", { key: key }) } catch (_) {}
  if (refund) return refund
  var collection = app.findCollectionByNameOrId("payment_refunds")
  refund = new Record(collection, {
    payment: payment.id,
    idempotencyKey: key,
    amountPaise: amountPaise,
    status: "queued",
    reason: String(reason || "").slice(0, 4000),
    source: source || "reconciliation",
    requestedBy: requestedBy || "",
    requestedAt: new Date().toISOString(),
  })
  app.saveNoValidate(refund)
  return refund
}

function paymentStatusRank(status) {
  var ranks = { pending: 0, authorized: 1, captured: 2, partially_refunded: 3, refunded: 4 }
  return Object.prototype.hasOwnProperty.call(ranks, status) ? ranks[status] : 0
}

function aggregateStatus(providerPayment) {
  if (providerPayment.status === "refunded" || providerPayment.amountRefundedPaise >= providerPayment.amountPaise) return "refunded"
  if (providerPayment.amountRefundedPaise > 0) return "partially_refunded"
  if (providerPayment.status === "captured") return "captured"
  if (providerPayment.status === "authorized") return "authorized"
  return "pending"
}

function updatePaymentFinancials(payment, providerPayment) {
  payment.set("lastSyncedAt", new Date().toISOString())
  var currentStatus = payment.getString("status") || "pending"
  var incomingStatus = aggregateStatus(providerPayment)
  var currentRefunded = Number(payment.getInt("refundedPaise") || 0)
  payment.set("refundedPaise", Math.max(currentRefunded, providerPayment.amountRefundedPaise || 0))
  if (providerPayment.status === "captured" || providerPayment.status === "refunded" || providerPayment.amountRefundedPaise > 0 || !payment.getString("paymentMethod")) {
    payment.set("paymentMethod", providerPayment.method || payment.getString("paymentMethod") || "")
  }
  if (paymentStatusRank(incomingStatus) > paymentStatusRank(currentStatus)) payment.set("status", incomingStatus)
  return { currentStatus: currentStatus, incomingStatus: incomingStatus }
}
function applyProviderPayment(app, registrationId, rawPayment, expectedOrderId) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var guard = require(__hooks + "/payment-registration-guard.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var result = { ok: false, status: 500, code: "RAZORPAY_TRANSITION_FAILED", error: "Could not apply Razorpay payment" }
  app.runInTransaction(function(txApp) {
    var registration
    try { registration = txApp.findRecordById("registrations", registrationId) }
    catch (_) { result = { ok: false, status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }; return }
    var payment = findLedger(txApp, registrationId)
    if (!payment || !payment.getString("providerOrderId")) {
      result = { ok: false, status: 409, code: "RAZORPAY_ORDER_NOT_INITIALIZED", error: "Razorpay order is not initialized" }
      return
    }
    var orderId = payment.getString("providerOrderId")
    if (expectedOrderId && orderId !== expectedOrderId) {
      result = { ok: false, status: 409, code: "RAZORPAY_ORDER_CONFLICT", error: "Razorpay order identity mismatch" }
      return
    }
    var validation = helpers.validatePayment(rawPayment, registration, orderId, String(rawPayment && rawPayment.id || ""))
    if (!validation.ok) { result = { ok: false, status: 502, code: "RAZORPAY_PAYMENT_INVALID", error: validation.error }; return }
    var providerPayment = validation.payment
    ensureAttempt(txApp, payment, providerPayment)
    var aggregate = updatePaymentFinancials(payment, providerPayment)
    var terminalStatus = aggregate.currentStatus
    var incomingAggregate = aggregate.incomingStatus
    if (paymentStatusRank(terminalStatus) > paymentStatusRank(incomingAggregate)) {
      txApp.saveNoValidate(payment)
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "stale_attempt_ignored", notify: false, paymentId: payment.id }
      return
    }
    if (providerPayment.status === "refunded" || providerPayment.amountRefundedPaise >= providerPayment.amountPaise) {
      payment.set("capturedPaymentId", providerPayment.id)
      payment.set("collectedPaise", providerPayment.amountPaise)
      payment.set("refundedPaise", providerPayment.amountPaise)
      payment.set("status", "refunded")
      payment.set("manualReview", false)
      payment.set("reviewReason", "")
      registration.set("registrationStatus", "cancelled")
      registration.set("paymentStatus", "refunded")
      txApp.saveNoValidate(payment)
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "refunded", notify: false, paymentId: payment.id }
      return
    }

    if (providerPayment.amountRefundedPaise > 0) {
      payment.set("capturedPaymentId", providerPayment.id)
      payment.set("collectedPaise", providerPayment.amountPaise)
      payment.set("status", "partially_refunded")
      payment.set("manualReview", true)
      payment.set("reviewReason", "Razorpay reports a partial refund; review attendee entitlement")
      txApp.saveNoValidate(payment)
      if (registration.getString("paymentStatus") !== "refunded") registration.set("paymentStatus", "paid")
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "partial_refund_review", notify: false, paymentId: payment.id }
      return
    }

    if (providerPayment.status === "authorized") {
      txApp.saveNoValidate(payment)
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "authorized", notify: false, paymentId: payment.id }
      return
    }
    if (providerPayment.status === "failed") {
      // A Razorpay Order can accept another payment attempt while the local seat
      // hold is valid. Record the failed attempt but do not release the seat here.
      txApp.saveNoValidate(payment)
      registration.set("paymentData", helpers.compatibilityData(registration, payment, { providerStatus: "failed_attempt" }))
      txApp.saveNoValidate(registration)
      result = { ok: true, action: "failed_attempt", notify: false, paymentId: payment.id }
      return
    }

    if (providerPayment.status !== "captured") {
      txApp.saveNoValidate(payment)
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "pending", notify: false, paymentId: payment.id }
      return
    }

    payment.set("status", "captured")
    payment.set("capturedPaymentId", providerPayment.id)
    payment.set("collectedPaise", providerPayment.amountPaise)
    payment.set("capturedAt", payment.getString("capturedAt") || new Date().toISOString())
    payment.set("confirmationSource", "razorpay")
    var disposition = guard.paymentConfirmationDisposition(registration, txApp)
    if (disposition.blocked) {
      registration.set("registrationStatus", "cancelled")
      registration.set("paymentStatus", "paid")
      payment.set("manualReview", true)
      payment.set("reviewReason", disposition.reason)
      ensureRefund(txApp, payment, providerPayment.amountPaise, "late_capture", disposition.reason, "")
      txApp.saveNoValidate(payment)
      saveCompatibility(registration, payment, helpers, txApp)
      result = { ok: true, action: "captured_refund_queued", notify: false, paymentId: payment.id }
      return
    }
    registration.set("registrationStatus", "confirmed")
    registration.set("paymentStatus", "paid")
    if (!registration.getString("ticketId")) registration.set("ticketId", rh.generateTicketId())
    payment.set("manualReview", false)
    payment.set("reviewReason", "")
    txApp.saveNoValidate(payment)
    saveCompatibility(registration, payment, helpers, txApp)
    result = { ok: true, action: "confirmed", notify: true, paymentId: payment.id, registrationId: registration.id }
  })
  return result
}

function releaseExpiredPayment(app, paymentId, nowIso) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var result = { released: false, eventId: "", couponCode: "" }
  app.runInTransaction(function(txApp) {
    var payment = txApp.findRecordById("payments", paymentId)
    var status = payment.getString("status") || ""
    if (status !== "pending" && status !== "authorized") return
    var hold = payment.getString("holdExpiresAt") || ""
    if (!hold || Date.parse(hold) > Date.parse(nowIso)) return
    var registration = txApp.findRecordById("registrations", payment.getString("registration"))
    if (registration.getString("registrationStatus") !== "pending" || registration.getString("paymentStatus") !== "pending") return
    registration.set("registrationStatus", "cancelled")
    registration.set("paymentStatus", "failed")
    payment.set("status", "cancelled")
    payment.set("manualReview", false)
    payment.set("reviewReason", "")
    txApp.saveNoValidate(payment)
    registration.set("paymentData", helpers.compatibilityData(registration, payment, { releaseReason: "Razorpay checkout hold expired without a captured payment" }))
    txApp.saveNoValidate(registration)
    result = { released: true, eventId: registration.getString("event") || "", couponCode: registration.getString("couponCode") || "" }
  })
  return result
}

function applyRefundResponse(app, refundId, rawRefund) {
  var helpers = require(__hooks + "/razorpay-direct-helpers.js")
  var result = { ok: false, status: 500, error: "Could not apply Razorpay refund" }
  app.runInTransaction(function(txApp) {
    var refund = txApp.findRecordById("payment_refunds", refundId)
    var payment = txApp.findRecordById("payments", refund.getString("payment"))
    var validated = helpers.validateRefund(rawRefund, payment, refund)
    if (!validated.ok) { result = { ok: false, status: 502, error: validated.error }; return }
    var providerRefund = validated.refund
    refund.set("providerRefundId", providerRefund.id)
    refund.set("failureReason", "")
    if (providerRefund.status === "processed") {
      refund.set("status", "processed")
      refund.set("processedAt", new Date().toISOString())
    } else if (providerRefund.status === "failed") {
      refund.set("status", "failed")
      refund.set("failedAt", new Date().toISOString())
      refund.set("failureReason", "Razorpay reported that the refund failed")
      payment.set("manualReview", true)
      payment.set("reviewReason", "Razorpay refund failed and requires manual resolution")
      txApp.saveNoValidate(payment)
    } else {
      refund.set("status", "submitted")
    }
    txApp.saveNoValidate(refund)
    result = { ok: true, status: 200, providerStatus: providerRefund.status, paymentId: payment.id, capturedPaymentId: payment.getString("capturedPaymentId") }
  })
  return result
}

function markDispute(app, paymentId, eventType) {
  var attempt = null
  try { attempt = app.findFirstRecordByFilter("payment_attempts", "providerPaymentId = {:id}", { id: paymentId }) } catch (_) {}
  if (!attempt) return false
  var payment = app.findRecordById("payments", attempt.getString("payment"))
  var resolved = eventType === "payment.dispute.won" || eventType === "payment.dispute.closed"
  var currentReason = payment.getString("reviewReason") || ""
  if (resolved && currentReason.indexOf("Razorpay dispute") === 0) {
    payment.set("manualReview", false)
    payment.set("reviewReason", "")
  } else if (!resolved) {
    payment.set("manualReview", true)
    payment.set("reviewReason", "Razorpay dispute requires attention: " + eventType)
  }
  app.saveNoValidate(payment)
  return true
}

function moduleExports() {
  return {
    registrationFees: registrationFees,
    finalizeOrderCreation: finalizeOrderCreation,
    ensureAttempt: ensureAttempt,
    ensureRefund: ensureRefund,
    refundKey: refundKey,
    applyProviderPayment: applyProviderPayment,
    findLedger: findLedger,
    findLedgerByOrder: findLedgerByOrder,
    markDispute: markDispute,
    applyRefundResponse: applyRefundResponse,
    releaseExpiredPayment: releaseExpiredPayment,
  }
}

module.exports = moduleExports()
