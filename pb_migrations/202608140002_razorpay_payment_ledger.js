/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var events = app.findCollectionByNameOrId("events")
  if (!events.fields.getByName("baseFeePaise")) {
    events.fields.add(new NumberField({ name: "baseFeePaise", min: 0 }))
    app.save(events)
  }

  var registrations = app.findCollectionByNameOrId("registrations")
  if (!registrations.fields.getByName("baseFeePaise")) {
    registrations.fields.add(new NumberField({ name: "baseFeePaise", min: 0 }))
    registrations.fields.add(new NumberField({ name: "discountPaise", min: 0 }))
    registrations.fields.add(new NumberField({ name: "finalFeePaise", min: 0 }))
    app.save(registrations)
  }

  var users = app.findCollectionByNameOrId("users")
  var payments = new Collection({
    type: "base",
    name: "payments",
    listRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
    viewRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "registration", collectionId: registrations.id, maxSelect: 1, required: true },
      { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true },
      { type: "select", name: "provider", values: ["razorpay", "manual", "legacy_paygate"], maxSelect: 1, required: true },
      { type: "text", name: "providerOrderId", max: 120 },
      { type: "text", name: "receipt", max: 120 },
      { type: "select", name: "status", values: ["created", "pending", "authorized", "captured", "failed", "cancelled", "refunded", "partially_refunded", "manual_review"], maxSelect: 1, required: true },
      { type: "number", name: "baseFeePaise", min: 0 },
      { type: "number", name: "discountPaise", min: 0 },
      { type: "number", name: "finalFeePaise", min: 0 },
      { type: "number", name: "collectedPaise", min: 0 },
      { type: "number", name: "refundedPaise", min: 0 },
      { type: "select", name: "currency", values: ["INR"], maxSelect: 1, required: true },
      { type: "text", name: "capturedPaymentId", max: 120 },
      { type: "text", name: "paymentMethod", max: 80 },
      { type: "select", name: "confirmationSource", values: ["razorpay", "admin", "legacy"], maxSelect: 1, required: true },
      { type: "date", name: "capturedAt" },
      { type: "date", name: "holdExpiresAt" },
      { type: "date", name: "lastSyncedAt" },
      { type: "bool", name: "manualReview" },
      { type: "text", name: "reviewReason", max: 4000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_payments_registration_created ON payments (registration, created)',
      "CREATE UNIQUE INDEX idx_payments_provider_order ON payments (providerOrderId) WHERE providerOrderId != ''",
      "CREATE UNIQUE INDEX idx_payments_receipt ON payments (receipt) WHERE receipt != ''",
      "CREATE UNIQUE INDEX idx_payments_captured_payment ON payments (capturedPaymentId) WHERE capturedPaymentId != ''",
      'CREATE INDEX idx_payments_event_status ON payments (event, status)',
      'CREATE INDEX idx_payments_review ON payments (manualReview, status)',
    ],
  })
  app.save(payments)

  var attempts = new Collection({
    type: "base",
    name: "payment_attempts",
    listRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && payment.event.society.chairs.id ?= @request.auth.id)',
    viewRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && payment.event.society.chairs.id ?= @request.auth.id)',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "payment", collectionId: payments.id, maxSelect: 1, required: true },
      { type: "text", name: "providerPaymentId", required: true, max: 120 },
      { type: "select", name: "status", values: ["created", "authorized", "captured", "failed", "refunded"], maxSelect: 1, required: true },
      { type: "number", name: "amountPaise", min: 0 },
      { type: "text", name: "method", max: 80 },
      { type: "text", name: "errorCode", max: 160 },
      { type: "text", name: "errorDescription", max: 4000 },
      { type: "date", name: "providerCreatedAt" },
      { type: "date", name: "capturedAt" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_payment_attempt_provider_id ON payment_attempts (providerPaymentId)',
      'CREATE INDEX idx_payment_attempt_payment_created ON payment_attempts (payment, created)',
      'CREATE INDEX idx_payment_attempt_status ON payment_attempts (status)',
    ],
  })
  app.save(attempts)

  var refunds = new Collection({
    type: "base",
    name: "payment_refunds",
    listRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && payment.event.society.chairs.id ?= @request.auth.id)',
    viewRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && payment.event.society.chairs.id ?= @request.auth.id)',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "payment", collectionId: payments.id, maxSelect: 1, required: true },
      { type: "text", name: "providerRefundId", max: 120 },
      { type: "text", name: "idempotencyKey", required: true, max: 160 },
      { type: "number", name: "amountPaise", min: 0 },
      { type: "select", name: "status", values: ["queued", "submitted", "processed", "failed", "cancelled"], maxSelect: 1, required: true },
      { type: "text", name: "reason", max: 4000 },
      { type: "select", name: "source", values: ["event_cancel", "admin", "late_capture", "dispute", "reconciliation"], maxSelect: 1, required: true },
      { type: "relation", name: "requestedBy", collectionId: users.id, maxSelect: 1 },
      { type: "date", name: "requestedAt" },
      { type: "date", name: "processedAt" },
      { type: "date", name: "failedAt" },
      { type: "number", name: "attempts", min: 0 },
      { type: "date", name: "lastAttemptAt" },
      { type: "text", name: "failureReason", max: 4000 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_payment_refund_provider_id ON payment_refunds (providerRefundId) WHERE providerRefundId != ''",
      'CREATE UNIQUE INDEX idx_payment_refund_idempotency ON payment_refunds (idempotencyKey)',
      'CREATE INDEX idx_payment_refund_payment_status ON payment_refunds (payment, status)',
    ],
  })
  app.save(refunds)

  var webhookEvents = new Collection({
    type: "base",
    name: "payment_webhook_events",
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "eventId", required: true, max: 160 },
      { type: "text", name: "eventType", required: true, max: 160 },
      { type: "text", name: "entityType", max: 80 },
      { type: "text", name: "entityId", max: 160 },
      { type: "text", name: "payloadHash", required: true, max: 128 },
      { type: "select", name: "status", values: ["pending", "processing", "processed", "failed", "ignored"], maxSelect: 1, required: true },
      { type: "number", name: "attempts", min: 0 },
      { type: "text", name: "lastError", max: 4000 },
      { type: "date", name: "providerCreatedAt" },
      { type: "date", name: "processedAt" },
      { type: "autodate", name: "receivedAt", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_payment_webhook_event_id ON payment_webhook_events (eventId)',
      'CREATE INDEX idx_payment_webhook_status_received ON payment_webhook_events (status, receivedAt)',
      'CREATE INDEX idx_payment_webhook_entity ON payment_webhook_events (entityType, entityId)',
    ],
  })
  app.save(webhookEvents)

  var eventRows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (var ei = 0; ei < eventRows.length; ei++) {
    var eventPrice = Math.max(0, Number(eventRows[ei].get("price") || 0))
    eventRows[ei].set("baseFeePaise", Math.round(eventPrice * 100))
    app.saveNoValidate(eventRows[ei])
  }

  var registrationRows = app.findRecordsByFilter("registrations", "1 = 1", "", 0, 0)
  for (var ri = 0; ri < registrationRows.length; ri++) {
    var registration = registrationRows[ri]
    var finalRupees = Math.max(0, Number(registration.get("amount") || 0))
    var discountRupees = Math.max(0, Number(registration.get("discountAmount") || 0))
    var finalPaise = Math.round(finalRupees * 100)
    var discountPaise = Math.round(discountRupees * 100)
    registration.set("baseFeePaise", finalPaise + discountPaise)
    registration.set("discountPaise", discountPaise)
    registration.set("finalFeePaise", finalPaise)
    app.saveNoValidate(registration)

    var paymentStatus = registration.getString("paymentStatus") || ""
    if (paymentStatus !== "paid" && paymentStatus !== "refunded") continue
    var rawData = registration.get("paymentData")
    var data = {}
    try {
      if (rawData && typeof rawData.string === "function") data = JSON.parse(String(rawData.string() || "{}"))
      else if (typeof rawData === "string") data = JSON.parse(rawData || "{}")
      else if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) data = rawData
    } catch (_) { data = {} }
    var rawProvider = String(data.provider || "")
    var provider = (data.manualConfirmation || rawProvider === "manual") ? "manual" :
      ((rawProvider === "razorpay" || rawProvider === "razorpay_live") ? "razorpay" : "legacy_paygate")
    var collectedPaise = Number(data.payableAmountPaise)
    if (!isFinite(collectedPaise) || Math.floor(collectedPaise) !== collectedPaise || collectedPaise < 0) {
      var payableRupees = Number(data.payableAmount)
      collectedPaise = isFinite(payableRupees) && payableRupees >= 0 ? Math.round(payableRupees * 100) : finalPaise
    }
    var refundedPaise = Number(data.amountRefundedPaise)
    if (!isFinite(refundedPaise) || Math.floor(refundedPaise) !== refundedPaise || refundedPaise < 0) refundedPaise = paymentStatus === "refunded" ? collectedPaise : 0
    refundedPaise = Math.min(collectedPaise, refundedPaise)
    var ledgerStatus = paymentStatus === "refunded" || (collectedPaise > 0 && refundedPaise >= collectedPaise) ? "refunded" : (refundedPaise > 0 ? "partially_refunded" : "captured")
    var historical = new Record(payments, {
      registration: registration.id, event: registration.getString("event") || "", provider: provider,
      providerOrderId: provider === "razorpay" ? String(data.razorpayOrderId || "") : "",
      receipt: ("legacy_" + registration.id).slice(0, 120), status: ledgerStatus,
      baseFeePaise: finalPaise + discountPaise, discountPaise: discountPaise, finalFeePaise: finalPaise,
      collectedPaise: collectedPaise, refundedPaise: refundedPaise, currency: "INR",
      capturedPaymentId: provider === "razorpay" ? String(data.razorpayPaymentId || "") : "",
      paymentMethod: String(data.paymentMethod || ""), confirmationSource: provider === "manual" ? "admin" : (provider === "razorpay" ? "razorpay" : "legacy"),
      capturedAt: String(data.paidAt || registration.getString("registrationDate") || ""),
      lastSyncedAt: String(data.lastSyncedAt || ""), manualReview: data.manualReview === true, reviewReason: String(data.reviewReason || ""),
    })
    app.saveNoValidate(historical)
  }
}, (app) => {
  var collections = ["payment_webhook_events", "payment_refunds", "payment_attempts", "payments"]
  for (var ci = 0; ci < collections.length; ci++) {
    try { app.delete(app.findCollectionByNameOrId(collections[ci])) } catch (_) {}
  }

  var registrations = app.findCollectionByNameOrId("registrations")
  var registrationFields = ["finalFeePaise", "discountPaise", "baseFeePaise"]
  for (var ri = 0; ri < registrationFields.length; ri++) {
    var registrationField = registrations.fields.getByName(registrationFields[ri])
    if (registrationField) registrations.fields.removeById(registrationField.id)
  }
  app.save(registrations)
  var events = app.findCollectionByNameOrId("events")
  var eventField = events.fields.getByName("baseFeePaise")
  if (eventField) events.fields.removeById(eventField.id)
  app.save(events)
})
