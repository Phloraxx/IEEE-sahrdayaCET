/// <reference path="../pb_data/types.d.ts" />

// Registration is a command, not ordinary collection CRUD. Capacity, coupon
// reservation, registration creation, ticket/payment state and counters are
// committed in a single SQLite transaction.
//
// A non-conflicting retry of an active registration is replayed idempotently.
// Any value the retry supplies must match the stored record; omitted optional
// answers do not overwrite anything. Changed answers or coupon choices remain
// rejected for an already-registered user.

function registrationCanonicalJson(value) {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value)
  if (Array.isArray(value)) {
    var items = []
    for (var ai = 0; ai < value.length; ai++) items.push(registrationCanonicalJson(value[ai]))
    return "[" + items.join(",") + "]"
  }
  if (typeof value === "object") {
    var keys = Object.keys(value).sort()
    var fields = []
    for (var oi = 0; oi < keys.length; oi++) {
      var key = keys[oi]
      fields.push(JSON.stringify(key) + ":" + registrationCanonicalJson(value[key]))
    }
    return "{" + fields.join(",") + "}"
  }
  return JSON.stringify(String(value))
}

function registrationJsonObject(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value
}

function registrationReplayCompatible(stored, incoming) {
  stored = registrationJsonObject(stored)
  incoming = registrationJsonObject(incoming)
  var keys = Object.keys(incoming)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    if (registrationCanonicalJson(stored[key]) !== registrationCanonicalJson(incoming[key])) {
      return false
    }
  }
  return true
}

routerAdd(
  "POST",
  "/api/app/events/{id}/register",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

    var pg = require(__hooks + "/paygate-helpers.js")
    var payGateConfig = pg.getConfig()
    var eventId = e.request.pathValue("id")
    var body = {}
    try { body = e.requestInfo().body || {} } catch (_) { body = {} }
    var responses = body.formResponses || {}
    if (typeof responses === "string") {
      try { responses = JSON.parse(responses) } catch (_) { responses = {} }
    }
    if (!responses || typeof responses !== "object") responses = {}
    var couponCode = String(body.couponCode || "").trim()

    var payload = null
    var responseStatus = 201
    var paymentUnavailable = false

    try {
      $app.runInTransaction(function (txApp) {
        var event
        try { event = txApp.findRecordById("events", eventId) }
        catch (_) { throw new BadRequestError("Event not found") }

        if (event.getBool("isDeleted") || event.getString("status") !== "published") {
          throw new BadRequestError("Event is not available for registration")
        }

        // Retry recovery intentionally runs before registration-window checks:
        // a compatible retry may recover its previously committed response even
        // if the event closes between the first response and the retry.
        var duplicates = txApp.findRecordsByFilter(
          "registrations",
          "user = {:userId} && event = {:eventId} && registrationStatus != {:cancelled}",
          "", 1, 0,
          { userId: auth.id, eventId: eventId, cancelled: "cancelled" }
        )
        if (duplicates.length) {
          var existing = duplicates[0]
          var sameCoupon = (existing.getString("couponCode") || "") === couponCode
          var compatibleResponses = registrationReplayCompatible(existing.get("formResponses"), responses)
          if (!sameCoupon || !compatibleResponses) {
            throw new BadRequestError("You are already registered for this event")
          }

          var existingNeedsPayment =
            existing.getString("registrationStatus") === "pending" &&
            existing.getString("paymentStatus") === "pending" &&
            (existing.getInt("amount") || 0) > 0

          payload = {
            registrationId: existing.id,
            ticketId: existingNeedsPayment
              ? existing.getString("paymentTicketId")
              : existing.getString("ticketId"),
            paymentRequired: existingNeedsPayment,
            amount: existing.getInt("amount") || 0,
            registrationStatus: existing.getString("registrationStatus"),
            paymentStatus: existing.getString("paymentStatus"),
            reused: true,
          }
          responseStatus = 200
          return
        }

        if (!event.getBool("registrationOpen")) {
          throw new BadRequestError("Registration is closed for this event")
        }

        var now = new Date()
        var endValue = event.getString("endDate") || event.getString("date")
        if (endValue) {
          var endDate = new Date(endValue)
          if (!isNaN(endDate.getTime()) && endDate <= now) {
            throw new BadRequestError("This event has already ended")
          }
        }
        var registrationStart = event.getString("registrationStart")
        if (registrationStart) {
          var startDate = new Date(registrationStart)
          if (!isNaN(startDate.getTime()) && startDate > now) {
            throw new BadRequestError("Registration has not opened yet")
          }
        }
        var registrationDeadline = event.getString("registrationDeadline")
        if (registrationDeadline) {
          var deadlineDate = new Date(registrationDeadline)
          if (!isNaN(deadlineDate.getTime()) && deadlineDate < now) {
            throw new BadRequestError("Registration deadline has passed")
          }
        }

        // Validate required dynamic form fields against the event's schema.
        var formTemplate = event.get("formTemplate")
        if (typeof formTemplate === "string") {
          try { formTemplate = JSON.parse(formTemplate) } catch (_) { formTemplate = [] }
        }
        if (formTemplate && typeof formTemplate.length === "number") {
          for (var i = 0; i < formTemplate.length; i++) {
            var field = formTemplate[i] || {}
            if (!field.required) continue
            var key = String(field.name || field.id || "")
            var value = responses[key]
            if (value === undefined && field.id) value = responses[field.id]
            if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
              throw new BadRequestError("Required field '" + String(field.label || key) + "' is missing")
            }
          }
        }

        var activeRegs = txApp.findRecordsByFilter(
          "registrations",
          "event = {:eventId} && registrationStatus != {:cancelled}",
          "", 0, 0,
          { eventId: eventId, cancelled: "cancelled" }
        )
        var maxCapacity = event.getInt("maxCapacity") || 0
        if (maxCapacity > 0 && activeRegs.length >= maxCapacity) {
          throw new BadRequestError("Event is at full capacity")
        }

        var price = event.getInt("price") || 0
        var discountAmount = 0
        var finalAmount = price
        var coupon = null
        if (couponCode) {
          try {
            coupon = txApp.findFirstRecordByFilter(
              "coupons",
              "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
              { code: couponCode, eventId: eventId }
            )
          } catch (_) { coupon = null }
          if (!coupon) throw new BadRequestError("Invalid or expired coupon code")

          var maxUses = coupon.getInt("maxUses") || 0
          if (maxUses > 0) {
            var used = txApp.findRecordsByFilter(
              "registrations",
              "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
              "", 0, 0,
              { code: couponCode, eventId: eventId, cancelled: "cancelled" }
            )
            if (used.length >= maxUses) {
              throw new BadRequestError("Coupon '" + couponCode + "' has reached its usage limit")
            }
          }
          var percent = coupon.getInt("discountPercent") || 0
          discountAmount = Math.round(price * percent / 100)
          finalAmount = Math.max(0, price - discountAmount)
        }

        var needsPayment = finalAmount > 0
        if (needsPayment && !pg.paymentConfigured(payGateConfig)) {
          paymentUnavailable = true
          throw new Error("PAYGATE_NOT_CONFIGURED")
        }

        var collection = txApp.findCollectionByNameOrId("registrations")
        var registration = new Record(collection, {
          user: auth.id,
          event: eventId,
          userName: String(responses.name || auth.getString("name") || ""),
          userEmail: String(responses.email || auth.getString("email") || ""),
          userPhone: String(responses.phone || ""),
          formResponses: responses,
          couponCode: couponCode,
          amount: finalAmount,
          discountAmount: discountAmount,
          paymentStatus: needsPayment ? "pending" : "not_required",
          registrationStatus: needsPayment ? "pending" : "confirmed",
          registrationDate: now.toISOString(),
          ticketId: needsPayment ? "" : "TKT-" + $security.randomString(16),
          paymentTicketId: needsPayment ? $security.randomString(32) : "",
          paymentData: needsPayment
            ? { provider: pg.PAYGATE_PROVIDER, providerStatus: "not_initialized", manualReview: false }
            : null,
          checkedIn: false,
          checkedInAt: "",
        })
        txApp.save(registration)

        // registeredCount means active seat reservations (pending + confirmed),
        // matching the capacity rule and the registration-page progress UI.
        event.set("registeredCount", activeRegs.length + 1)
        var checked = txApp.findRecordsByFilter(
          "registrations",
          "event = {:eventId} && registrationStatus = {:confirmed} && checkedIn = true",
          "", 0, 0,
          { eventId: eventId, confirmed: "confirmed" }
        )
        event.set("checkedInCount", checked.length)
        txApp.saveNoValidate(event)

        if (coupon) {
          var couponUses = txApp.findRecordsByFilter(
            "registrations",
            "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
            "", 0, 0,
            { code: couponCode, eventId: eventId, cancelled: "cancelled" }
          )
          coupon.set("usedCount", couponUses.length)
          txApp.saveNoValidate(coupon)
        }

        payload = {
          registrationId: registration.id,
          ticketId: needsPayment ? registration.getString("paymentTicketId") : registration.getString("ticketId"),
          paymentRequired: needsPayment,
          amount: finalAmount,
          registrationStatus: registration.getString("registrationStatus"),
          paymentStatus: registration.getString("paymentStatus"),
          reused: false,
        }
      })
    } catch (err) {
      if (paymentUnavailable) {
        return e.json(503, {
          code: "PAYGATE_NOT_CONFIGURED",
          error: "Online payment is temporarily unavailable for paid events",
        })
      }
      var message = err && err.message ? String(err.message) : String(err)
      return e.json(400, { error: message })
    }

    return e.json(responseStatus, payload)
  },
  $apis.requireAuth("users")
)
