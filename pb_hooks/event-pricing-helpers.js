function number(value) {
  var result = Number(value || 0)
  return isFinite(result) ? result : 0
}

function eventBaseFeePaise(event) {
  if (!event) return 0
  var paise = number(event.getInt("baseFeePaise"))
  if (Math.floor(paise) === paise && paise > 0) return paise
  return Math.max(0, Math.round(number(event.get("price")) * 100))
}

function ieeeDiscountPercent(event) {
  if (!event) return 0
  var percent = number(event.get("ieeeMemberDiscountPercent"))
  if (percent < 0) return 0
  if (percent > 100) return 100
  return percent
}

function normalizedCouponCode(value) {
  return String(value || "").trim().toUpperCase()
}

function failure(status, code, error) {
  return { ok: false, status: status, code: code, error: error }
}

function couponFor(app, eventId, code) {
  try {
    return app.findFirstRecordByFilter(
      "coupons",
      "code = {:code} && event = {:eventId} && isActive = true && (expiresAt = '' || expiresAt > @now)",
      { code: code, eventId: eventId }
    )
  } catch (_) {
    return null
  }
}

function couponHasCapacity(app, eventId, code, maxUses) {
  if (maxUses <= 0) return true
  var used = app.findRecordsByFilter(
    "registrations",
    "couponCode = {:code} && event = {:eventId} && registrationStatus != {:cancelled}",
    "", maxUses, 0,
    { code: code, eventId: eventId, cancelled: "cancelled" }
  )
  return used.length < maxUses
}

function calculate(app, event, input) {
  input = input || {}
  var baseFeePaise = eventBaseFeePaise(event)
  var memberPercent = ieeeDiscountPercent(event)
  var memberClaim = input.isIeeeMember === true
  var membershipId = String(input.ieeeMembershipId || "").trim().slice(0, 80)
  if (memberPercent > 0 && memberClaim && !membershipId) {
    return failure(400, "IEEE_MEMBERSHIP_ID_REQUIRED", "Enter your IEEE Membership ID to use the member price")
  }

  var ieeeDiscountPaise = memberPercent > 0 && memberClaim && membershipId
    ? Math.round(baseFeePaise * memberPercent / 100)
    : 0
  var requestedCouponCode = normalizedCouponCode(input.couponCode)
  var couponRecord = null
  var couponDiscountPaise = 0
  var couponPercent = 0

  if (requestedCouponCode) {
    if (baseFeePaise <= 0) return failure(400, "COUPONS_PAID_ONLY", "Coupons are only available for paid events")
    couponRecord = couponFor(app, event.id, requestedCouponCode)
    if (!couponRecord) return failure(400, "INVALID_COUPON", "Invalid or expired coupon code")
    var maxUses = couponRecord.getInt("maxUses") || 0
    if (!couponHasCapacity(app, event.id, requestedCouponCode, maxUses)) {
      return failure(409, "COUPON_EXHAUSTED", "Coupon usage limit has been reached")
    }
    couponPercent = couponRecord.getInt("discountPercent") || 0
    couponDiscountPaise = Math.round(baseFeePaise * couponPercent / 100)
  }

  var discountSource = "none"
  var appliedDiscountPaise = 0
  var appliedCouponCode = ""
  if (ieeeDiscountPaise > 0 && ieeeDiscountPaise >= couponDiscountPaise) {
    discountSource = "ieee_member"
    appliedDiscountPaise = ieeeDiscountPaise
  } else if (couponDiscountPaise > 0) {
    discountSource = "coupon"
    appliedDiscountPaise = couponDiscountPaise
    appliedCouponCode = requestedCouponCode
  }

  var finalFeePaise = Math.max(0, baseFeePaise - appliedDiscountPaise)
  if (input.validateProvider !== false && finalFeePaise > 0 && finalFeePaise % 100 !== 0) {
    return failure(400, "PAYGATE_WHOLE_RUPEE_REQUIRED", "PayGate requires a whole-rupee final amount. Adjust the event price or discount.")
  }

  var label = "Standard price"
  if (discountSource === "ieee_member") label = "IEEE member price applied"
  else if (discountSource === "coupon") label = "Coupon " + appliedCouponCode + " applied"

  return {
    ok: true,
    baseFeePaise: baseFeePaise,
    ieeeDiscountPercent: memberPercent,
    ieeeDiscountPaise: ieeeDiscountPaise,
    couponDiscountPercent: couponPercent,
    couponDiscountPaise: couponDiscountPaise,
    appliedDiscountPaise: appliedDiscountPaise,
    finalFeePaise: finalFeePaise,
    discountSource: discountSource,
    requestedCouponCode: requestedCouponCode,
    appliedCouponCode: appliedCouponCode,
    membershipId: membershipId,
    couponRecord: couponRecord,
    label: label,
  }
}

function validateEventConfiguration(event) {
  var baseFeePaise = eventBaseFeePaise(event)
  var memberPercent = number(event && event.get ? event.get("ieeeMemberDiscountPercent") : 0)
  if (memberPercent < 0 || memberPercent > 100 || Math.floor(memberPercent) !== memberPercent) {
    return failure(400, "INVALID_IEEE_DISCOUNT", "IEEE member discount must be a whole percentage from 0 to 100")
  }
  if (memberPercent > 0 && baseFeePaise <= 0) {
    return failure(400, "IEEE_DISCOUNT_REQUIRES_PAID_EVENT", "IEEE member pricing is only available for paid events")
  }
  if (memberPercent > 0 && !event.getBool("collectIeeeMember")) {
    return failure(400, "IEEE_MEMBER_DETAILS_REQUIRED", "Enable IEEE membership details before setting a member discount")
  }
  if (baseFeePaise > 0) {
    if (baseFeePaise % 100 !== 0) {
      return failure(400, "PAYGATE_WHOLE_RUPEE_REQUIRED", "PayGate requires a whole-rupee registration fee")
    }
    if (memberPercent > 0) {
      var memberFinal = Math.max(0, baseFeePaise - Math.round(baseFeePaise * memberPercent / 100))
      if (memberFinal > 0 && memberFinal % 100 !== 0) {
        return failure(400, "PAYGATE_WHOLE_RUPEE_REQUIRED", "PayGate requires the IEEE member price to be a whole rupee")
      }
    }
  }
  return { ok: true }
}

function validateCouponConfiguration(event, discountPercent) {
  var percent = number(discountPercent)
  if (percent < 0 || percent > 100 || Math.floor(percent) !== percent) {
    return failure(400, "INVALID_COUPON_DISCOUNT", "Coupon discount must be a whole percentage from 0 to 100")
  }
  var baseFeePaise = eventBaseFeePaise(event)
  if (baseFeePaise > 0) {
    var finalFeePaise = Math.max(0, baseFeePaise - Math.round(baseFeePaise * percent / 100))
    if (finalFeePaise > 0 && finalFeePaise % 100 !== 0) {
      return failure(400, "PAYGATE_WHOLE_RUPEE_REQUIRED", "PayGate requires every active coupon price to be a whole rupee")
    }
  }
  return { ok: true }
}

function validateExistingCoupons(app, event) {
  if (!app || !event || eventBaseFeePaise(event) <= 0) return { ok: true }
  var offset = 0
  var batchSize = 100
  while (true) {
    var coupons = app.findRecordsByFilter(
      "coupons",
      "event = {:eventId} && isActive = true",
      "id", batchSize, offset,
      { eventId: event.id }
    )
    for (var i = 0; i < coupons.length; i++) {
      var validation = validateCouponConfiguration(event, coupons[i].getInt("discountPercent") || 0)
      if (!validation.ok) {
        validation.error = "Coupon " + String(coupons[i].getString("code") || "discount") + " is incompatible with PayGate: " + validation.error
        return validation
      }
    }
    if (coupons.length < batchSize) break
    offset += coupons.length
  }
  return { ok: true }
}

module.exports = {
  eventBaseFeePaise: eventBaseFeePaise,
  ieeeDiscountPercent: ieeeDiscountPercent,
  normalizedCouponCode: normalizedCouponCode,
  calculate: calculate,
  validateEventConfiguration: validateEventConfiguration,
  validateCouponConfiguration: validateCouponConfiguration,
  validateExistingCoupons: validateExistingCoupons,
}
