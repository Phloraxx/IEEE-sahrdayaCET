/// <reference path="../pb_data/types.d.ts" />

// Read-only coupon preview for signed-in attendees. The final registration
// command revalidates all coupon constraints transactionally before reserving
// a seat or creating a payment.
routerAdd("POST", "/api/app/events/{id}/coupon-preview", function (e) {
  var auth = e.auth
  if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

  var eventId = e.request.pathValue("id")
  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var code = String(body.couponCode || "").trim().toUpperCase()
  if (!code) return e.json(400, { error: "Enter a coupon code" })

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
  var endValue = event.getString("endDate") || event.getString("date")
  if (endValue) {
    var endDate = new Date(endValue)
    if (!isNaN(endDate.getTime()) && endDate <= now) return e.json(400, { error: "This event has already ended" })
  }
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

  var baseFeePaise = Number(event.getInt("baseFeePaise") || 0)
  if (!baseFeePaise) baseFeePaise = Math.max(0, Math.round(Number(event.get("price") || 0) * 100))
  if (baseFeePaise <= 0) return e.json(400, { error: "Coupons are only available for paid events" })

  var coupon
  try {
    coupon = $app.findFirstRecordByFilter(
      "coupons",
      "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
      { code: code, eventId: eventId }
    )
  } catch (_) { coupon = null }
  if (!coupon) return e.json(400, { error: "Invalid or expired coupon code" })

  var maxUses = coupon.getInt("maxUses") || 0
  if (maxUses > 0) {
    var used = $app.findRecordsByFilter(
      "registrations",
      "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
      "", 0, 0,
      { code: code, eventId: eventId, cancelled: "cancelled" }
    )
    if (used.length >= maxUses) return e.json(409, { error: "Coupon usage limit has been reached" })
  }

  var percent = coupon.getInt("discountPercent") || 0
  var discountPaise = Math.round(baseFeePaise * percent / 100)
  var finalFeePaise = Math.max(0, baseFeePaise - discountPaise)
  return e.json(200, {
    code: code,
    discountPercent: percent,
    baseAmount: baseFeePaise / 100,
    discountAmount: discountPaise / 100,
    amount: finalFeePaise / 100,
  })
}, $apis.requireAuth("users"))
