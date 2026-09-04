/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/app/events/{id}/pricing-preview", function (e) {
  var auth = e.auth
  var eventTime = require(__hooks + "/event-time-helpers.js")
  var pricing = require(__hooks + "/event-pricing-helpers.js")
  if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

  var eventId = e.request.pathValue("id")
  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { error: "Event not found" }) }
  if (event.getBool("isDeleted") || event.getString("status") !== "published") {
    return e.json(400, { error: "Event is not available for registration" })
  }

  var registrationMode = event.getString("registrationMode") || (
    event.getString("externalFormUrl") ? "external" : (event.getBool("registrationOpen") ? "internal" : "closed")
  )
  if (registrationMode !== "internal" || !event.getBool("registrationOpen")) {
    return e.json(400, { error: "Registration is closed for this event" })
  }
  var now = new Date()
  var endDate = eventTime.eventEndDate(event)
  if (endDate && !isNaN(endDate.getTime()) && endDate <= now) return e.json(400, { error: "This event has already ended" })
  var registrationStart = event.getString("registrationStart")
  if (registrationStart) {
    var startDate = new Date(registrationStart)
    if (!isNaN(startDate.getTime()) && startDate > now) return e.json(400, { error: "Registration has not opened yet" })
  }
  var registrationDeadline = event.getString("registrationDeadline")
  if (registrationDeadline) {
    var deadlineDate = new Date(registrationDeadline)
    if (!isNaN(deadlineDate.getTime()) && deadlineDate < now) return e.json(400, { error: "Registration deadline has passed" })
  }

  var result = pricing.calculate($app, event, {
    isIeeeMember: body.isIeeeMember === true,
    ieeeMembershipId: body.ieeeMembershipId,
    couponCode: body.couponCode,
  })
  if (!result.ok) return e.json(result.status || 400, { code: result.code, error: result.error })
  return e.json(200, {
    baseFeePaise: result.baseFeePaise,
    ieeeDiscountPercent: result.ieeeDiscountPercent,
    ieeeDiscountPaise: result.ieeeDiscountPaise,
    couponDiscountPercent: result.couponDiscountPercent,
    couponDiscountPaise: result.couponDiscountPaise,
    appliedDiscountPaise: result.appliedDiscountPaise,
    finalFeePaise: result.finalFeePaise,
    baseAmount: result.baseFeePaise / 100,
    discountAmount: result.appliedDiscountPaise / 100,
    amount: result.finalFeePaise / 100,
    discountSource: result.discountSource,
    requestedCouponCode: result.requestedCouponCode,
    appliedCouponCode: result.appliedCouponCode,
    label: result.label,
  })
}, $apis.requireAuth("users"))
