/// <reference path="../pb_data/types.d.ts" />

// Registration is a command, not ordinary collection CRUD. Capacity, coupon
// reservation, registration creation, ticket/payment state and counters are
// committed in a single SQLite transaction.
//
// A non-conflicting retry of an active registration is replayed idempotently.
// Any value the retry supplies must match the stored record; omitted optional
// answers do not overwrite anything. Changed answers or coupon choices remain
// rejected for an already-registered user.

routerAdd(
  "POST",
  "/api/app/events/{id}/register",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

    // PocketBase 0.39 serializes route handlers into isolated JSVM scopes, so
    // shared helper functions must be required inside the handler.
    var rh = require(__hooks + "/registration-helpers.js")
    var razorpay = require(__hooks + "/razorpay-direct-helpers.js")
    var razorpayConfig = razorpay.getConfig()
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

        // A successful payment that needs organizer review is financially real
        // even though its seat was released. Never allow a second registration
        // (and therefore a possible second charge) while that payment is open.
        var previous = txApp.findRecordsByFilter(
          "registrations",
          "user = {:userId} && event = {:eventId}",
          "", 0, 0,
          { userId: auth.id, eventId: eventId }
        )
        for (var previousIndex = 0; previousIndex < previous.length; previousIndex++) {
          var previousRegistration = previous[previousIndex]
          if (previousRegistration.getString("registrationStatus") !== "cancelled") continue
          var previousPaymentData = pg.asObject(previousRegistration.get("paymentData"))
          if (previousPaymentData.manualReview === true) {
            throw new BadRequestError("A previous payment for this event is under organizer review")
          }
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
          var compatibleResponses = rh.registrationReplayCompatible(existing.get("formResponses"), responses)
          if (!sameCoupon || !compatibleResponses) {
            throw new BadRequestError("You are already registered for this event")
          }

          var existingNeedsPayment =
            existing.getString("registrationStatus") === "pending" &&
            existing.getString("paymentStatus") === "pending" &&
            rh.registrationFinalFeePaise(existing) > 0

          payload = {
            registrationId: existing.id,
            ticketId: existingNeedsPayment
              ? existing.getString("paymentTicketId")
              : existing.getString("ticketId"),
            paymentRequired: existingNeedsPayment,
            amount: rh.registrationAmount(existing),
            registrationStatus: existing.getString("registrationStatus"),
            paymentStatus: existing.getString("paymentStatus"),
            reused: true,
          }
          responseStatus = 200
          return
        }

        var registrationMode = event.getString("registrationMode") || (
          event.getString("externalFormUrl") ? "external" : (event.getBool("registrationOpen") ? "internal" : "closed")
        )
        if (registrationMode !== "internal") {
          throw new BadRequestError(registrationMode === "external"
            ? "This event uses external registration"
            : "Registration is closed for this event")
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

        var baseFeePaise = Number(event.getInt("baseFeePaise") || 0)
        if (!baseFeePaise) baseFeePaise = Math.max(0, Math.round(Number(event.get("price") || 0) * 100))
        var discountPaise = 0
        var finalFeePaise = baseFeePaise
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
          discountPaise = Math.round(baseFeePaise * percent / 100)
          finalFeePaise = Math.max(0, baseFeePaise - discountPaise)
        }

        var discountAmount = discountPaise / 100
        var finalAmount = finalFeePaise / 100
        var needsPayment = finalFeePaise > 0
        var lockedPaymentData = needsPayment ? {
          provider: "razorpay",
          providerStatus: "not_initialized",
          manualReview: false,
        } : null
        if (needsPayment && (!razorpay.apiConfigured(razorpayConfig) || !razorpayConfig.paymentsEnabled)) {
          paymentUnavailable = true
          throw new Error("RAZORPAY_NOT_AVAILABLE")
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
          baseFeePaise: baseFeePaise,
          discountPaise: discountPaise,
          finalFeePaise: finalFeePaise,
          paymentStatus: needsPayment ? "pending" : "not_required",
          registrationStatus: needsPayment ? "pending" : "confirmed",
          registrationDate: now.toISOString(),
          ticketId: needsPayment ? "" : "TKT-" + $security.randomString(16),
          paymentTicketId: needsPayment ? $security.randomString(32) : "",
          // New paid registrations use Razorpay directly. The normalized
          // payment ledger becomes canonical once an Order is created.
          paymentData: lockedPaymentData,
          checkedIn: false,
          checkedInAt: "",
          registrationSource: "self_service",
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
          code: "RAZORPAY_NOT_AVAILABLE",
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
