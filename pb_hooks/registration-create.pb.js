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
    var eventTime = require(__hooks + "/event-time-helpers.js")
    var razorpay = require(__hooks + "/razorpay-direct-helpers.js")
    var paygate = require(__hooks + "/paygate-helpers.js")
    var providerSelection = require(__hooks + "/payment-provider-selection.js")
    var attendeeLifecycle = require(__hooks + "/attendee-lifecycle-helpers.js")
    var razorpayConfig = razorpay.getConfig()
    var paygateConfig = paygate.getConfig()
    var eventId = e.request.pathValue("id")
    var body = {}
    try { body = e.requestInfo().body || {} } catch (_) { body = {} }
    var responses = body.formResponses || {}
    if (typeof responses === "string") {
      try { responses = JSON.parse(responses) } catch (_) { responses = {} }
    }
    if (!responses || typeof responses !== "object") responses = {}
    var couponCode = String(body.couponCode || "").trim().toUpperCase()

    var payload = null
    var responseStatus = 201
    var paymentUnavailable = false
    var paymentUnavailableCode = "PAYMENT_NOT_AVAILABLE"
    var paymentUnavailableMessage = "Online payment is temporarily unavailable for this event"

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
          var previousPaymentData = rh.registrationJsonObject(previousRegistration.get("paymentData"))
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
        var endDate = eventTime.eventEndDate(event)
        if (endDate && !isNaN(endDate.getTime()) && endDate <= now) {
          throw new BadRequestError("This event has already ended")
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

        // Reconcile expired/offered waitlist seats before capacity is decided.
        // An unexpired offer is a real reservation: direct registrations may
        // not steal it, while the offered attendee may consume that seat.
        attendeeLifecycle.reconcileEventWaitlist(txApp, eventId, now.toISOString())
        event = txApp.findRecordById("events", eventId)
        var activeRegs = attendeeLifecycle.activeRegistrations(txApp, eventId)
        var activeOffers = attendeeLifecycle.activeOffers(txApp, eventId, now.getTime())
        var offeredWaitlist = attendeeLifecycle.validOfferForUser(txApp, eventId, auth.id, now.getTime())
        var maxCapacity = event.getInt("maxCapacity") || 0
        if (maxCapacity > 0) {
          var occupied = activeRegs.length + activeOffers.length
          if ((offeredWaitlist && activeRegs.length >= maxCapacity) || (!offeredWaitlist && occupied >= maxCapacity)) {
            throw new BadRequestError("Event is at full capacity")
          }
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
        var eventPaymentProvider = providerSelection.eventProvider(event)
        var lockedPaymentData = needsPayment ? providerSelection.paymentDataForEvent(event) : null
        if (needsPayment && eventPaymentProvider === providerSelection.KOTAK) {
          // PayGate deliberately allocates the verification fingerprint in the
          // paise suffix, so its requested/base amount must be a whole rupee.
          if (finalFeePaise % 100 !== 0) {
            throw new BadRequestError("Kotak temporary payments require a whole-rupee final amount. Adjust the event price or coupon.")
          }
          if (!paygate.paymentConfigured(paygateConfig)) {
            paymentUnavailable = true
            paymentUnavailableCode = "PAYGATE_NOT_AVAILABLE"
            paymentUnavailableMessage = "Kotak UPI is temporarily unavailable for this event"
            throw new Error("PAYGATE_NOT_AVAILABLE")
          }
        } else if (needsPayment && (!razorpay.apiConfigured(razorpayConfig) || !razorpayConfig.paymentsEnabled)) {
          paymentUnavailable = true
          paymentUnavailableCode = "RAZORPAY_NOT_AVAILABLE"
          paymentUnavailableMessage = "Razorpay is temporarily unavailable for this event"
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
          // Provider choice is locked onto the registration at creation time.
          // Changing the event later never moves an in-flight payment between
          // Razorpay and the temporary Kotak/PayGate route.
          paymentData: lockedPaymentData,
          checkedIn: false,
          checkedInAt: "",
          registrationSource: "self_service",
        })
        txApp.save(registration)

        if (offeredWaitlist) {
          offeredWaitlist.set("status", "accepted")
          offeredWaitlist.set("activeKey", "")
          offeredWaitlist.set("acceptedRegistration", registration.id)
          txApp.saveNoValidate(offeredWaitlist)
        }

        // registeredCount means active seat reservations (pending + confirmed),
        // matching the capacity rule and the registration-page progress UI.
        event.set("registeredCount", activeRegs.length + 1)
        event.set("waitlistReservedCount", attendeeLifecycle.activeOffers(txApp, eventId, now.getTime()).length)
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
          code: paymentUnavailableCode,
          error: paymentUnavailableMessage,
        })
      }
      var message = err && err.message ? String(err.message) : String(err)
      return e.json(400, { error: message })
    }

    return e.json(responseStatus, payload)
  },
  $apis.requireAuth("users")
)
