/// <reference path="../pb_data/types.d.ts" />

// Registration is a command, not ordinary collection CRUD. Capacity, coupon
// reservation, registration creation, ticket/payment state and counters are
// committed in a single SQLite transaction.
routerAdd(
  "POST",
  "/api/app/events/{id}/register",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

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
    try {
      $app.runInTransaction(function (txApp) {
        var event
        try { event = txApp.findRecordById("events", eventId) }
        catch (_) { throw new BadRequestError("Event not found") }

        if (event.getBool("isDeleted") || event.getString("status") !== "published") {
          throw new BadRequestError("Event is not available for registration")
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

        // A cancelled registration may be recreated; any active registration
        // for this user/event blocks another seat reservation.
        var duplicates = txApp.findRecordsByFilter(
          "registrations",
          "user = {:userId} && event = {:eventId} && registrationStatus != {:cancelled}",
          "", 1, 0,
          { userId: auth.id, eventId: eventId, cancelled: "cancelled" }
        )
        if (duplicates.length) throw new BadRequestError("You are already registered for this event")

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
        }
      })
    } catch (err) {
      var message = err && err.message ? String(err.message) : String(err)
      return e.json(400, { error: message })
    }

    return e.json(201, payload)
  },
  $apis.requireAuth("users")
)
