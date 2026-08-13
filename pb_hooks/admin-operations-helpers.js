/// <reference path="../pb_data/types.d.ts" />

function jsonObject(value) {
  return require(__hooks + "/registration-helpers.js").registrationJsonObject(value)
}

function role(auth) {
  if (!auth || !auth.id) return ""
  try {
    if (typeof auth.isSuperuser === "function" && auth.isSuperuser()) return "admin"
  } catch (_) {}
  return auth.getString("role") || ""
}

function mayManageEvent(app, auth, event) {
  var authRole = role(auth)
  if (authRole === "admin") return true
  if (authRole !== "chair" || !event) return false
  var societyId = event.getString("society") || ""
  if (!societyId) return false
  try {
    var society = app.findRecordById("societies", societyId)
    var chairs = society.getStringSlice("chairs") || []
    return chairs.indexOf(auth.id) !== -1
  } catch (_) {
    return false
  }
}
function requireManageEvent(app, auth, event) {
  if (!mayManageEvent(app, auth, event)) throw new Error("FORBIDDEN_EVENT")
}

function providerKind(registration) {
  var data = jsonObject(registration.get("paymentData"))
  if (data.manualConfirmation || data.provider === "manual") return "manual"
  if (data.provider === "razorpay_live") return "razorpay"
  if (data.provider === "paygate") {
    return String(data.eventPaymentProvider || data.paymentAccount || "paygate")
  }
  if (registration.getString("paymentStatus") === "not_required") return "not_required"
  return "unknown"
}

function registrationSnapshot(registration) {
  if (!registration) return null
  var data = jsonObject(registration.get("paymentData"))
  return {
    id: registration.id,
    event: registration.getString("event") || "",
    user: registration.getString("user") || "",
    userName: registration.getString("userName") || "",
    userEmail: registration.getString("userEmail") || "",
    userPhone: registration.getString("userPhone") || "",
    registrationStatus: registration.getString("registrationStatus") || "",
    paymentStatus: registration.getString("paymentStatus") || "",
    amount: registration.getInt("amount") || 0,
    couponCode: registration.getString("couponCode") || "",
    discountAmount: registration.getInt("discountAmount") || 0,
    ticketId: registration.getString("ticketId") || "",
    checkedIn: registration.getBool("checkedIn"),
    checkedInAt: registration.getString("checkedInAt") || "",
    registrationDate: registration.getString("registrationDate") || "",
    registrationSource: registration.getString("registrationSource") || "self_service",
    internalNotes: registration.getString("internalNotes") || "",
    provider: providerKind(registration),
    providerStatus: String(data.providerStatus || ""),
    manualReview: data.manualReview === true,
    reviewReason: String(data.reviewReason || ""),
    manualConfirmation: data.manualConfirmation || null,
  }
}

function audit(app, input) {
  var collection
  try { collection = app.findCollectionByNameOrId("admin_audit_log") } catch (_) { return }
  var record = new Record(collection, {
    event: input.eventId || "",
    registration: input.registrationId || "",
    actor: input.actorId || "",
    action: String(input.action || "admin_action").slice(0, 160),
    note: String(input.note || "").slice(0, 4000),
    before: input.before || null,
    after: input.after || null,
  })
  app.saveNoValidate(record)
}

function eventPayload(event) {
  return {
    id: event.id,
    title: event.getString("title") || "",
    slug: event.getString("slug") || "",
    date: event.getString("date") || "",
    endDate: event.getString("endDate") || "",
    venue: event.getString("venue") || "",
    status: event.getString("status") || "",
    price: event.getInt("price") || 0,
    paymentProvider: event.getString("paymentProvider") || "kotak",
    registrationOpen: event.getBool("registrationOpen"),
    checkInEnabled: event.getBool("checkInEnabled"),
    maxCapacity: event.getInt("maxCapacity") || 0,
    registeredCount: event.getInt("registeredCount") || 0,
    checkedInCount: event.getInt("checkedInCount") || 0,
    society: event.getString("society") || "",
  }
}

function summarizeRegistrations(records) {
  var summary = {
    totalRecords: records.length,
    active: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    checkedIn: 0,
    paidCount: 0,
    paidAmount: 0,
    confirmedPaidAmount: 0,
    pendingPaymentCount: 0,
    pendingPaymentAmount: 0,
    failedCount: 0,
    notRequiredCount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    manualPaidCount: 0,
    manualPaidAmount: 0,
    providerPaidCount: 0,
    providerPaidAmount: 0,
    cancelledPaidCount: 0,
    cancelledPaidAmount: 0,
    reviewCount: 0,
    discountAmount: 0,
    adminCreatedCount: 0,
    selfServiceCount: 0,
    providers: {},
  }

  for (var i = 0; i < records.length; i++) {
    var reg = records[i]
    var registrationStatus = reg.getString("registrationStatus") || ""
    var paymentStatus = reg.getString("paymentStatus") || ""
    var amount = reg.getInt("amount") || 0
    var source = reg.getString("registrationSource") || "self_service"
    var data = jsonObject(reg.get("paymentData"))
    var kind = providerKind(reg)

    if (registrationStatus !== "cancelled") summary.active++
    if (registrationStatus === "confirmed") summary.confirmed++
    if (registrationStatus === "pending") summary.pending++
    if (registrationStatus === "cancelled") summary.cancelled++
    if (reg.getBool("checkedIn")) summary.checkedIn++
    if (source === "admin") summary.adminCreatedCount++
    else summary.selfServiceCount++

    summary.discountAmount += reg.getInt("discountAmount") || 0
    if (paymentStatus === "paid") {
      summary.paidCount++
      summary.paidAmount += amount
      if (registrationStatus === "confirmed") summary.confirmedPaidAmount += amount
      if (registrationStatus === "cancelled") {
        summary.cancelledPaidCount++
        summary.cancelledPaidAmount += amount
      }
      if (kind === "manual") {
        summary.manualPaidCount++
        summary.manualPaidAmount += amount
      } else {
        summary.providerPaidCount++
        summary.providerPaidAmount += amount
      }
    } else if (paymentStatus === "pending") {
      summary.pendingPaymentCount++
      summary.pendingPaymentAmount += amount
    } else if (paymentStatus === "failed") {
      summary.failedCount++
    } else if (paymentStatus === "not_required") {
      summary.notRequiredCount++
    } else if (paymentStatus === "refunded") {
      summary.refundedCount++
      summary.refundedAmount += amount
    }

    if (data.manualReview === true ||
        (registrationStatus === "cancelled" && paymentStatus === "paid")) {
      summary.reviewCount++
    }

    if (!summary.providers[kind]) {
      summary.providers[kind] = { count: 0, paidCount: 0, amount: 0 }
    }
    summary.providers[kind].count++
    if (paymentStatus === "paid") {
      summary.providers[kind].paidCount++
      summary.providers[kind].amount += amount
    }
  }
  return summary
}

module.exports = {
  jsonObject: jsonObject,
  role: role,
  mayManageEvent: mayManageEvent,
  requireManageEvent: requireManageEvent,
  providerKind: providerKind,
  registrationSnapshot: registrationSnapshot,
  audit: audit,
  eventPayload: eventPayload,
  summarizeRegistrations: summarizeRegistrations,
}
