/// <reference path="../pb_data/types.d.ts" />

// Event operations endpoints. Financial/registration transitions live behind
// explicit commands so the admin UI can be powerful without allowing arbitrary
// writes to protected payment fields.

function adminOpsBody(e) {
  try { return e.requestInfo().body || {} } catch (_) { return {} }
}

function adminOpsError(e, err) {
  var message = err && err.message ? String(err.message) : String(err || "")
  if (message === "FORBIDDEN_EVENT") {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot manage this event" })
  }
  return e.json(400, { code: "ADMIN_OPERATION_FAILED", error: message || "Operation failed" })
}

function adminOpsEvent(id) {
  try { return $app.findRecordById("events", id) } catch (_) { return null }
}

routerAdd("GET", "/api/admin/events/{id}/operations", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  if (!helpers.mayManageEvent($app, e.auth, event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot manage this event" })
  }
  var records = $app.findRecordsByFilter(
    "registrations", "event = {:eventId}", "-registrationDate", 0, 0,
    { eventId: event.id }
  )
  var summary = helpers.summarizeRegistrations(records)
  var recent = []
  var attention = []
  for (var i = 0; i < records.length; i++) {
    var row = helpers.registrationSnapshot(records[i])
    if (recent.length < 8) recent.push(row)
    var registrationTime = Date.parse(row.registrationDate || "")
    var stalePending = row.registrationStatus === "pending" && row.paymentStatus === "pending" &&
      isFinite(registrationTime) && Date.now() - registrationTime >= 10 * 60 * 1000
    if (row.manualReview ||
        (row.registrationStatus === "cancelled" && row.paymentStatus === "paid") ||
        stalePending) {
      if (attention.length < 30) attention.push(row)
    }
  }

  var coupons = []
  try {
    var couponRecords = $app.findRecordsByFilter(
      "coupons", "event = {:eventId}", "created", 0, 0, { eventId: event.id }
    )
    for (var ci = 0; ci < couponRecords.length; ci++) {
      var coupon = couponRecords[ci]
      coupons.push({
        id: coupon.id,
        code: coupon.getString("code") || "",
        discountPercent: coupon.getInt("discountPercent") || 0,
        maxUses: coupon.getInt("maxUses") || 0,
        usedCount: coupon.getInt("usedCount") || 0,
        expiresAt: coupon.getString("expiresAt") || "",
        isActive: coupon.getBool("isActive"),
      })
    }
  } catch (_) {}

  var audit = []
  try {
    var auditRecords = $app.findRecordsByFilter(
      "admin_audit_log", "event = {:eventId}", "-created", 25, 0,
      { eventId: event.id }
    )
    for (var ai = 0; ai < auditRecords.length; ai++) {
      var item = auditRecords[ai]
      audit.push({
        id: item.id,
        action: item.getString("action") || "",
        note: item.getString("note") || "",
        actor: item.getString("actor") || "",
        registration: item.getString("registration") || "",
        created: item.getString("created") || "",
      })
    }
  } catch (_) {}

  return e.json(200, {
    event: helpers.eventPayload(event),
    summary: summary,
    recent: recent,
    attention: attention,
    coupons: coupons,
    audit: audit,
    financeDisclaimer: "Recorded collections are an application ledger, not a live bank balance.",
  })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/admin/payments/summary", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  if (helpers.role(e.auth) !== "admin") {
    return e.json(403, { code: "FORBIDDEN", error: "Only admins can view the payment desk" })
  }
  var rows = $app.findRecordsByFilter("payments", "1 = 1", "-created", 0, 0)
  var refunds = $app.findRecordsByFilter("payment_refunds", "1 = 1", "-created", 0, 0)
  var summary = {
    paymentCount: rows.length, grossCollectedAmount: 0, refundedAmount: 0, netCollectedAmount: 0,
    razorpayCount: 0, razorpayCollectedAmount: 0, manualCount: 0, manualCollectedAmount: 0,
    legacyCount: 0, legacyCollectedAmount: 0, attentionCount: 0, queuedRefundCount: 0, failedRefundCount: 0,
  }
  for (var i = 0; i < rows.length; i++) {
    var collected = Math.max(0, rows[i].getInt("collectedPaise") || 0) / 100
    var refunded = Math.max(0, rows[i].getInt("refundedPaise") || 0) / 100
    var provider = rows[i].getString("provider") || "unknown"
    summary.grossCollectedAmount += collected
    summary.refundedAmount += refunded
    if (provider === "razorpay") { summary.razorpayCount++; summary.razorpayCollectedAmount += collected }
    else if (provider === "manual") { summary.manualCount++; summary.manualCollectedAmount += collected }
    else { summary.legacyCount++; summary.legacyCollectedAmount += collected }
    if (rows[i].getBool("manualReview") || rows[i].getString("status") === "partially_refunded") summary.attentionCount++
  }
  for (var r = 0; r < refunds.length; r++) {
    var refundStatus = refunds[r].getString("status") || ""
    if (refundStatus === "queued" || refundStatus === "submitted") summary.queuedRefundCount++
    if (refundStatus === "failed") summary.failedRefundCount++
  }
  summary.netCollectedAmount = Math.max(0, summary.grossCollectedAmount - summary.refundedAmount)
  return e.json(200, {
    summary: summary,
    financeDisclaimer: "Gross collection, refunds and net collection are application ledger values reconciled from Razorpay/manual evidence, not a live bank settlement balance.",
  })
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/admin/events/{id}/registrations/manual", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var paymentState = require(__hooks + "/razorpay-payment-state.js")
  var auth = e.auth
  if (helpers.role(auth) !== "admin") {
    return e.json(403, { code: "FORBIDDEN", error: "Only admins can create manual registrations" })
  }
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var name = String(body.name || "").trim()
  var email = String(body.email || "").trim().toLowerCase()
  var phone = String(body.phone || "").trim()
  var phoneKey = phone.replace(/\D/g, "")
  var userId = String(body.userId || "").trim()
  var couponCode = String(body.couponCode || "").trim().toUpperCase()
  var paymentMode = String(body.paymentMode || "pending")
  var paymentMethod = String(body.paymentMethod || (paymentMode === "paid" ? "other" : "")).trim().toLowerCase()
  var note = String(body.note || "").trim()
  var formResponses = body.formResponses || {}
  if (typeof formResponses === "string") {
    try { formResponses = JSON.parse(formResponses) } catch (_) { formResponses = {} }
  }
  if (!formResponses || typeof formResponses !== "object") formResponses = {}
  if (formResponses.name === undefined) formResponses.name = name
  if (formResponses.email === undefined) formResponses.email = email
  if (formResponses.phone === undefined) formResponses.phone = phone
  if (!name || (!email && !phoneKey)) {
    return e.json(400, { code: "INVALID_ATTENDEE", error: "Name and at least an email or phone number are required" })
  }
  if (email && email.indexOf("@") <= 0) {
    return e.json(400, { code: "INVALID_ATTENDEE", error: "Email address is invalid" })
  }
  if (phone && phoneKey.length < 7) {
    return e.json(400, { code: "INVALID_ATTENDEE", error: "Phone number is too short" })
  }
  if (["paid", "pending", "waived"].indexOf(paymentMode) === -1) {
    return e.json(400, { code: "INVALID_PAYMENT_MODE", error: "Payment mode must be paid, pending, or waived" })
  }
  if (paymentMode === "paid" && ["cash", "upi", "bank", "other"].indexOf(paymentMethod) === -1) {
    return e.json(400, { code: "INVALID_PAYMENT_METHOD", error: "Choose cash, UPI, bank, or other for an offline payment" })
  }
  if (body.capacityOverride === true && !note) {
    return e.json(400, { code: "NOTE_REQUIRED", error: "A note is required when overriding capacity" })
  }

  var result = null
  var failure = null
  try {
    $app.runInTransaction(function (txApp) {
      var currentEvent = txApp.findRecordById("events", eventId)
      var active = txApp.findRecordsByFilter(
        "registrations", "event = {:eventId} && registrationStatus != {:cancelled}",
        "", 0, 0, { eventId: eventId, cancelled: "cancelled" }
      )
      var template = currentEvent.get("formTemplate")
      if (typeof template === "string") {
        try { template = JSON.parse(template) } catch (_) { template = [] }
      }
      if (template && typeof template.length === "number") {
        for (var fieldIndex = 0; fieldIndex < template.length; fieldIndex++) {
          var field = template[fieldIndex] || {}
          if (!field.required) continue
          var fieldKey = String(field.name || field.id || "")
          var fieldValue = formResponses[fieldKey]
          if (fieldValue === undefined && field.id) fieldValue = formResponses[field.id]
          if (fieldValue === undefined || fieldValue === null || (typeof fieldValue === "string" && fieldValue.trim() === "")) {
            failure = { status: 400, code: "REQUIRED_FIELD_MISSING", error: "Required field '" + String(field.label || fieldKey) + "' is missing" }
            return
          }
        }
      }

      var maxCapacity = currentEvent.getInt("maxCapacity") || 0
      if (maxCapacity > 0 && active.length >= maxCapacity && body.capacityOverride !== true) {
        failure = { status: 409, code: "EVENT_FULL", error: "Event is at full capacity" }
        return
      }

      if (userId) {
        try { txApp.findRecordById("users", userId) }
        catch (_) {
          failure = { status: 400, code: "USER_NOT_FOUND", error: "Selected user was not found" }
          return
        }
      }
      var duplicateFilter = userId
        ? "user = {:userId} && event = {:eventId} && registrationStatus != {:cancelled}"
        : email
          ? "user = '' && userEmail = {:email} && event = {:eventId} && registrationStatus != {:cancelled}"
          : "user = '' && userPhone = {:phone} && event = {:eventId} && registrationStatus != {:cancelled}"
      var duplicateParams = userId
        ? { userId: userId, eventId: eventId, cancelled: "cancelled" }
        : email
          ? { email: email, eventId: eventId, cancelled: "cancelled" }
          : { phone: phone, eventId: eventId, cancelled: "cancelled" }
      var duplicate = null
      try {
        duplicate = txApp.findFirstRecordByFilter("registrations", duplicateFilter, duplicateParams)
      } catch (_) { duplicate = null }
      if (duplicate) {
        failure = { status: 409, code: "ALREADY_REGISTERED", error: "An active registration already exists for this attendee" }
        return
      }

      var baseFeePaise = rh.eventFeePaise(currentEvent)
      var finalFeePaise = baseFeePaise
      var discountPaise = 0
      var coupon = null
      if (couponCode) {
        try {
          coupon = txApp.findFirstRecordByFilter(
            "coupons",
            "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
            { code: couponCode, eventId: eventId }
          )
        } catch (_) { coupon = null }
        if (!coupon) { failure = { status: 400, code: "INVALID_COUPON", error: "Coupon is invalid or expired" }; return }
        var maxUses = coupon.getInt("maxUses") || 0
        if (maxUses > 0) {
          var used = txApp.findRecordsByFilter(
            "registrations", "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
            "", 0, 0, { code: couponCode, eventId: eventId, cancelled: "cancelled" }
          )
          if (used.length >= maxUses) { failure = { status: 409, code: "COUPON_EXHAUSTED", error: "Coupon usage limit has been reached" }; return }
        }
        var percent = coupon.getInt("discountPercent") || 0
        discountPaise = Math.round(baseFeePaise * percent / 100)
        finalFeePaise = Math.max(0, baseFeePaise - discountPaise)
      }
      if (body.amountOverride !== undefined && body.amountOverride !== null && body.amountOverride !== "") {
        var overrideAmount = Number(body.amountOverride)
        var overridePaise = Math.round(overrideAmount * 100)
        if (!isFinite(overrideAmount) || overrideAmount < 0 || Math.abs(overrideAmount * 100 - overridePaise) > 0.000001) {
          failure = { status: 400, code: "INVALID_AMOUNT", error: "Amount override must be non-negative with at most two decimal places" }
          return
        }
        if (!note) { failure = { status: 400, code: "NOTE_REQUIRED", error: "A note is required when overriding the registration amount" }; return }
        finalFeePaise = overridePaise
      }
      var finalAmount = finalFeePaise / 100
      var discountAmount = discountPaise / 100
      var now = new Date().toISOString()
      var paymentStatus = "pending"
      var registrationStatus = "pending"
      var paymentData = {
        provider: "manual",
        providerStatus: "manual_pending",
        paymentMethod: paymentMode === "paid" ? paymentMethod : "",
        createdAt: now,
        manualReview: false,
      }

      if (finalAmount <= 0 || paymentMode === "waived") {
        if (paymentMode === "waived" && finalAmount > 0) {
          paymentData.waiver = {
            originalAmount: finalAmount,
            waivedAt: now,
            waivedBy: auth.id,
            note: note,
          }
          finalFeePaise = 0
          finalAmount = 0
        }
        paymentStatus = "not_required"
        registrationStatus = "confirmed"
        paymentData.providerStatus = paymentMode === "waived" ? "waived" : "not_required"
      } else if (paymentMode === "paid") {
        paymentStatus = "paid"
        registrationStatus = "confirmed"
        paymentData.providerStatus = "manual_paid"
        paymentData.paidAt = now
        paymentData.manualConfirmation = {
          confirmedAt: now,
          confirmedBy: auth.id,
          source: "admin_manual_registration",
          reference: String(body.paymentReference || "").trim(),
          note: note,
        }
      }

      var collection = txApp.findCollectionByNameOrId("registrations")
      var registration = new Record(collection, {
        user: userId,
        event: eventId,
        userName: name,
        userEmail: email,
        userPhone: phone,
        formResponses: formResponses,
        couponCode: couponCode,
        amount: finalAmount,
        discountAmount: discountAmount,
        baseFeePaise: baseFeePaise,
        discountPaise: discountPaise,
        finalFeePaise: finalFeePaise,
        paymentStatus: paymentStatus,
        registrationStatus: registrationStatus,
        registrationDate: now,
        ticketId: registrationStatus === "confirmed" ? rh.generateTicketId() : "",
        paymentTicketId: registrationStatus === "pending" ? rh.generatePaymentTicketId() : "",
        paymentData: paymentData,
        checkedIn: false,
        checkedInAt: "",
        registrationSource: "admin",
        internalNotes: note,
        createdBy: auth.id,
      })
      txApp.saveNoValidate(registration)
      if (paymentStatus === "paid") {
        var paymentCollection = txApp.findCollectionByNameOrId("payments")
        var manualPayment = new Record(paymentCollection, {
          registration: registration.id, event: eventId, provider: "manual",
          receipt: ("manual_" + registration.id + "_" + Date.now()).slice(0, 120), status: "captured",
          baseFeePaise: baseFeePaise, discountPaise: discountPaise, finalFeePaise: finalFeePaise,
          collectedPaise: finalFeePaise, refundedPaise: 0, currency: "INR", paymentMethod: paymentMethod || "other",
          confirmationSource: "admin", capturedAt: now, lastSyncedAt: now, manualReview: false,
        })
        txApp.saveNoValidate(manualPayment)
      }
      result = helpers.registrationSnapshot(registration)
      helpers.audit(txApp, {
        eventId: eventId,
        actorId: auth.id,
        action: "registration.manual-create",
        note: note,
        before: null,
        after: result,
        entityType: "registration",
        entityId: registration.id,
        outcome: "success",
      })
    })
  } catch (err) {
    console.log("[admin-ops] manual registration failed:", err)
    return e.json(500, { code: "MANUAL_REGISTRATION_FAILED", error: "Could not create manual registration" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })

  rh.recomputeEventCounters(eventId)
  if (couponCode) rh.recomputeCouponUsedCount(couponCode, eventId)
  if (result && result.registrationStatus === "confirmed") {
    try {
      var saved = $app.findRecordById("registrations", result.id)
      require(__hooks + "/notification-helpers.js").enqueueForRegistration(saved)
    } catch (notifyErr) {
      console.log("[mail] manual registration notification queue failed:", notifyErr)
    }
  }
  return e.json(201, { registration: result })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/admin/registrations/{id}/command", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var paymentState = require(__hooks + "/razorpay-payment-state.js")
  var auth = e.auth
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  var event
  try { event = $app.findRecordById("events", registration.getString("event")) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  if (!helpers.mayManageEvent($app, auth, event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot manage this registration" })
  }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var action = String(body.action || "").trim()
  var note = String(body.note || "").trim()
  var adminOnly = {
    "confirm-payment": true,
    "restore": true,
    "mark-refunded": true,
    "reopen-manual-payment": true,
  }
  if (adminOnly[action] && helpers.role(auth) !== "admin") {
    return e.json(403, { code: "FORBIDDEN", error: "Only admins can perform this action" })
  }

  var allowed = {
    "check-in": true,
    "undo-check-in": true,
    "cancel": true,
    "confirm-payment": true,
    "restore": true,
    "mark-refunded": true,
    "reopen-manual-payment": true,
  }
  if (!allowed[action]) {
    return e.json(400, { code: "INVALID_ACTION", error: "Unknown registration action" })
  }
  if ((action === "mark-refunded" || action === "restore" || action === "reopen-manual-payment") && !note) {
    return e.json(400, { code: "NOTE_REQUIRED", error: "A note is required for this financial correction" })
  }

  var eventId = event.id
  var before = helpers.registrationSnapshot(registration)
  var failure = null
  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var reg = txApp.findRecordById("registrations", id)
      var regStatus = reg.getString("registrationStatus") || ""
      var payStatus = reg.getString("paymentStatus") || ""
      var data = helpers.jsonObject(reg.get("paymentData"))
      var now = new Date().toISOString()

      if (action === "check-in") {
        if (regStatus !== "confirmed") {
          failure = { status: 409, code: "NOT_CONFIRMED", error: "Only confirmed attendees can be checked in" }
          return
        }
        if (!reg.getBool("checkedIn")) {
          reg.set("checkedIn", true)
          reg.set("checkedInAt", now)
        }
      } else if (action === "undo-check-in") {
        if (reg.getBool("checkedIn")) {
          reg.set("checkedIn", false)
          reg.set("checkedInAt", "")
        }
      } else if (action === "cancel") {
        if (regStatus !== "cancelled") {
          reg.set("registrationStatus", "cancelled")
          if (payStatus === "pending") reg.set("paymentStatus", "failed")
          data.adminCancellation = {
            cancelledAt: now,
            cancelledBy: auth.id,
            note: note,
          }
          reg.set("paymentData", data)
        }
      } else if (action === "confirm-payment") {
        if (regStatus === "cancelled") {
          failure = { status: 409, code: "CANCELLED_REGISTRATION", error: "Restore the registration before confirming payment" }
          return
        }
        if (regStatus === "confirmed" && payStatus === "paid") {
          // Idempotent no-op.
        } else if (regStatus !== "pending" || payStatus !== "pending" || (reg.getInt("amount") || 0) <= 0) {
          failure = { status: 409, code: "PAYMENT_NOT_PENDING", error: "This registration is not awaiting payment" }
          return
        } else {
          var existingPayment = paymentState.findLedger(txApp, reg.id)
          if (existingPayment && existingPayment.getString("provider") === "razorpay" && existingPayment.getString("providerOrderId")) {
            failure = { status: 409, code: "RAZORPAY_ORDER_EXISTS", error: "A Razorpay order already exists. Reconcile or resolve that online payment instead of manually confirming it." }
            return
          }
          var finalPaise = reg.getInt("finalFeePaise") || ((reg.getInt("amount") || 0) * 100)
          var basePaise = reg.getInt("baseFeePaise") || finalPaise
          var discountPaise = reg.getInt("discountPaise") || 0
          var paymentCollection = txApp.findCollectionByNameOrId("payments")
          var manualPayment = new Record(paymentCollection, {
            registration: reg.id, event: eventId, provider: "manual",
            receipt: ("manual_" + reg.id + "_" + Date.now()).slice(0, 120),
            status: "captured", baseFeePaise: basePaise, discountPaise: discountPaise, finalFeePaise: finalPaise,
            collectedPaise: finalPaise, refundedPaise: 0, currency: "INR",
            paymentMethod: String(body.method || "offline").trim().slice(0, 80),
            confirmationSource: "admin", capturedAt: now, lastSyncedAt: now, manualReview: false,
          })
          txApp.saveNoValidate(manualPayment)
          reg.set("registrationStatus", "confirmed")
          reg.set("paymentStatus", "paid")
          if (!reg.getString("ticketId")) reg.set("ticketId", rh.generateTicketId())
          data.provider = "manual"
          data.providerStatus = "manual_paid"
          data.manualConfirmation = {
            confirmedAt: now, confirmedBy: auth.id, source: "admin",
            reference: String(body.reference || "").trim(), note: note,
          }
          if (!data.paidAt) data.paidAt = now
          reg.set("paymentData", data)
        }
      } else if (action === "restore") {
        if (regStatus !== "cancelled") {
          failure = { status: 409, code: "NOT_CANCELLED", error: "Only cancelled registrations can be restored" }
          return
        }
        var active = txApp.findRecordsByFilter(
          "registrations", "event = {:eventId} && registrationStatus != {:cancelled}",
          "", 0, 0, { eventId: eventId, cancelled: "cancelled" }
        )
        var currentEvent = txApp.findRecordById("events", eventId)
        var maxCapacity = currentEvent.getInt("maxCapacity") || 0
        if (maxCapacity > 0 && active.length >= maxCapacity && body.capacityOverride !== true) {
          failure = { status: 409, code: "EVENT_FULL", error: "Event is full. Use an explicit capacity override to restore this attendee." }
          return
        }
        if (payStatus !== "paid" && payStatus !== "not_required") {
          failure = {
            status: 409,
            code: payStatus === "refunded" ? "REFUNDED_REGISTRATION" : "PAYMENT_REOPEN_REQUIRED",
            error: payStatus === "refunded"
              ? "A refunded registration cannot be restored without a new payment"
              : "Reopen the payment before restoring this registration",
          }
          return
        }
        reg.set("registrationStatus", "confirmed")
        if (!reg.getString("ticketId")) reg.set("ticketId", rh.generateTicketId())
        data.manualReview = false
        data.reviewResolution = {
          action: "restored",
          resolvedAt: now,
          resolvedBy: auth.id,
          note: note,
          capacityOverride: body.capacityOverride === true,
        }
        reg.set("paymentData", data)
      } else if (action === "mark-refunded") {
        if (payStatus !== "paid") {
          failure = { status: 409, code: "PAYMENT_NOT_PAID", error: "Only a paid registration can be refunded" }
          return
        }
        var refundPayment = paymentState.findLedger(txApp, reg.id)
        if (refundPayment && refundPayment.getString("provider") === "razorpay") {
          failure = {
            status: 409,
            code: "RAZORPAY_REFUND_MANUAL_ONLY",
            error: "Refund this payment in the Razorpay Dashboard. IEEE will update automatically after Razorpay confirms the refund.",
          }
          return
        }
        reg.set("registrationStatus", "cancelled")
        reg.set("paymentStatus", "refunded")
        data.manualReview = false
        data.refund = {
          status: "recorded", recordedAt: now, recordedBy: auth.id,
          reference: String(body.reference || "").trim(), note: note,
        }
        data.reviewResolution = { action: "refunded", resolvedAt: now, resolvedBy: auth.id, note: note }
        reg.set("paymentData", data)
        if (refundPayment) {
          refundPayment.set("status", "refunded")
          refundPayment.set("refundedPaise", refundPayment.getInt("collectedPaise") || refundPayment.getInt("finalFeePaise") || 0)
          refundPayment.set("manualReview", false)
          refundPayment.set("reviewReason", "")
          txApp.saveNoValidate(refundPayment)
        }
      } else if (action === "reopen-manual-payment") {
        if (regStatus !== "confirmed" || payStatus !== "paid" || !data.manualConfirmation) {
          failure = { status: 409, code: "NOT_MANUAL_PAYMENT", error: "Only a manually confirmed payment can be reopened" }
          return
        }
        if (reg.getBool("checkedIn")) {
          failure = { status: 409, code: "ALREADY_CHECKED_IN", error: "Undo check-in before reopening this payment" }
          return
        }
        var providerStatus = String(data.providerStatus || "")
        if (providerStatus === "paid" || providerStatus === "captured") {
          failure = { status: 409, code: "PROVIDER_ALREADY_PAID", error: "Provider reports this payment as paid; use refund/review actions instead" }
          return
        }
        data.manualConfirmationReversal = {
          reversedAt: now,
          reversedBy: auth.id,
          note: note,
          previous: data.manualConfirmation,
        }
        var manualLedger = paymentState.findLedger(txApp, reg.id)
        if (manualLedger && manualLedger.getString("provider") === "manual") {
          manualLedger.set("status", "cancelled")
          manualLedger.set("collectedPaise", 0)
          manualLedger.set("manualReview", false)
          txApp.saveNoValidate(manualLedger)
        }
        delete data.manualConfirmation
        reg.set("registrationStatus", "pending")
        reg.set("paymentStatus", "pending")
        reg.set("ticketId", "")
        if (!reg.getString("paymentTicketId")) reg.set("paymentTicketId", rh.generatePaymentTicketId())
        reg.set("paymentData", data)
      }

      txApp.saveNoValidate(reg)
      result = helpers.registrationSnapshot(reg)
      helpers.audit(txApp, {
        eventId: eventId,
        registrationId: id,
        actorId: auth.id,
        action: "registration." + action,
        note: note,
        before: before,
        after: result,
      })
    })
  } catch (err) {
    console.log("[admin-ops] registration command failed:", err)
    return e.json(500, { code: "REGISTRATION_COMMAND_FAILED", error: "Could not apply registration action" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })

  rh.recomputeEventCounters(eventId)
  if (result && result.couponCode) rh.recomputeCouponUsedCount(result.couponCode, eventId)
  if (action === "confirm-payment" || action === "restore") {
    try {
      var saved = $app.findRecordById("registrations", id)
      if (saved.getString("registrationStatus") === "confirmed") {
        require(__hooks + "/notification-helpers.js").enqueueForRegistration(saved)
      }
    } catch (notifyErr) {
      console.log("[mail] admin operation notification queue failed:", notifyErr)
    }
  }
  return e.json(200, { registration: result })
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/admin/events/{id}/recompute", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  if (!helpers.mayManageEvent($app, e.auth, event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot manage this event" })
  }

  rh.recomputeEventCounters(eventId)
  try {
    var coupons = $app.findRecordsByFilter("coupons", "event = {:eventId}", "", 0, 0, { eventId: eventId })
    for (var i = 0; i < coupons.length; i++) {
      rh.recomputeCouponUsedCount(coupons[i].getString("code") || "", eventId)
    }
  } catch (_) {}
  helpers.audit($app, {
    eventId: eventId,
    actorId: e.auth.id,
    action: "event.recompute",
    note: "Recomputed active registration, check-in, and coupon counters",
  })
  try { event = $app.findRecordById("events", eventId) } catch (_) {}
  return e.json(200, { success: true, event: helpers.eventPayload(event) })
}, $apis.requireAuth("users"))
