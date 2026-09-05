/// <reference path="../pb_data/types.d.ts" />

function rows(app, collection, filter, params) {
  try { return app.findRecordsByFilter(collection, filter, "", 0, 0, params || {}) }
  catch (_) { return [] }
}

function issue(code, label, count, area, restricted) {
  return { code: code, label: label, count: count || 0, area: area || "overview", restricted: restricted === true }
}

function registrationAmount(registration) {
  return require(__hooks + "/registration-helpers.js").registrationAmount(registration)
}

function registrationJson(registration) {
  return require(__hooks + "/registration-helpers.js").registrationJsonObject(registration.get("paymentData"))
}

function closeoutSummary(app, event) {
  var status = event.getString("status") || ""
  var applicable = !event.getBool("isDeleted") && (status === "completed" || status === "cancelled")
  var blockers = []
  var warnings = []
  if (!applicable) {
    return {
      applicable: false, readyToArchive: false, blockers: [], warnings: [],
      metrics: { pendingRegistrations: 0, unresolvedRefundRequests: 0, paymentExceptions: 0, activeWaitlist: 0, attendanceSessions: 0, attendanceCorrections: 0, attendanceScheduleAnomalies: 0 },
    }
  }
  var registrations = rows(app, "registrations", "event = {:eventId}", { eventId: event.id })
  var pendingRegistrations = 0
  var paymentExceptionIds = {}
  for (var i = 0; i < registrations.length; i++) {
    var reg = registrations[i]
    var registrationStatus = reg.getString("registrationStatus") || ""
    var paymentStatus = reg.getString("paymentStatus") || ""
    var data = registrationJson(reg)
    if (registrationStatus === "pending") pendingRegistrations++
    if (data.manualReview === true ||
        (registrationStatus === "cancelled" && paymentStatus === "paid") ||
        (paymentStatus === "pending" && registrationAmount(reg) > 0)) {
      paymentExceptionIds[reg.id] = true
    }
  }

  var paymentRows = rows(app, "payments", "event = {:eventId}", { eventId: event.id })
  for (var pi = 0; pi < paymentRows.length; pi++) {
    var payment = paymentRows[pi]
    var paymentStatus = payment.getString("status") || ""
    if (payment.getBool("manualReview") || paymentStatus === "manual_review" || paymentStatus === "partially_refunded") {
      paymentExceptionIds[payment.getString("registration") || payment.id] = true
    }
  }

  var refundRequests = rows(app, "registration_cancellation_requests",
    "event = {:eventId} && (status = {:open} || status = {:accepted})",
    { eventId: event.id, open: "open", accepted: "accepted" })
  if (pendingRegistrations > 0) {
    blockers.push(issue("PENDING_REGISTRATIONS", "Pending registrations still need a final decision", pendingRegistrations, "attendees"))
  }
  if (refundRequests.length > 0) {
    blockers.push(issue("REFUNDS_UNRESOLVED", "Attendee refund requests are still unresolved", refundRequests.length, "payments"))
  }
  var paymentExceptionCount = Object.keys(paymentExceptionIds).length
  if (paymentExceptionCount > 0) {
    blockers.push(issue("PAYMENT_EXCEPTIONS", "Payment exceptions still need reconciliation", paymentExceptionCount, "payments"))
  }

  var waitlistRows = rows(app, "event_waitlist",
    "event = {:eventId} && (status = {:waiting} || status = {:offered})",
    { eventId: event.id, waiting: "waiting", offered: "offered" })
  if (waitlistRows.length > 0 || event.getInt("waitlistReservedCount") > 0) {
    warnings.push(issue("WAITLIST_DRIFT", "Active waitlist state remains after event closeout", Math.max(waitlistRows.length, event.getInt("waitlistReservedCount") || 0), "overview"))
  }

  var sessions = require(__hooks + "/attendance-v2-helpers.js").sessionsForEvent(app, event.id)
  var corrections = rows(app, "attendance_records",
    "event = {:eventId} && (type = {:add} || type = {:remove})",
    { eventId: event.id, add: "manual_add", remove: "manual_remove" })
  var eventStart = Date.parse(event.getString("date") || "")
  var eventEnd = Date.parse(event.getString("endDate") || "")
  var anomalousSessions = 0
  for (var si = 0; si < sessions.length; si++) {
    var sessionStart = Date.parse(sessions[si].getString("startsAt") || "")
    var sessionEnd = Date.parse(sessions[si].getString("endsAt") || "")
    if ((isFinite(eventStart) && isFinite(sessionStart) && sessionStart < eventStart) ||
        (isFinite(eventEnd) && ((isFinite(sessionStart) && sessionStart > eventEnd) || (isFinite(sessionEnd) && sessionEnd > eventEnd)))) {
      anomalousSessions++
    }
  }
  if (corrections.length > 0) warnings.push(issue("ATTENDANCE_CORRECTIONS", "Manual attendance corrections are present in the audit history", corrections.length, "attendance"))
  if (anomalousSessions > 0) warnings.push(issue("SESSION_SCHEDULE_ANOMALY", "Attendance session timing falls outside the event schedule", anomalousSessions, "attendance"))

  return {
    applicable: applicable,
    readyToArchive: applicable && blockers.length === 0,
    blockers: blockers,
    warnings: warnings,
    metrics: {
      pendingRegistrations: pendingRegistrations,
      unresolvedRefundRequests: refundRequests.length,
      paymentExceptions: paymentExceptionCount,
      activeWaitlist: waitlistRows.length,
      attendanceSessions: sessions.length,
      attendanceCorrections: corrections.length,
      attendanceScheduleAnomalies: anomalousSessions,
    },
  }
}
function projectCloseoutSummary(summary, financeAllowed) {
  if (!summary || financeAllowed) return summary
  var blockers = []
  var financeBlocked = false
  for (var i = 0; i < summary.blockers.length; i++) {
    var blocker = summary.blockers[i]
    if (blocker.area === "payments") financeBlocked = true
    else blockers.push(blocker)
  }
  if (financeBlocked) blockers.push(issue("FINANCE_RECONCILIATION", "Finance reconciliation is still required", 0, "overview", true))
  return {
    applicable: summary.applicable,
    readyToArchive: summary.readyToArchive,
    blockers: blockers,
    warnings: summary.warnings,
    metrics: {
      pendingRegistrations: summary.metrics.pendingRegistrations,
      activeWaitlist: summary.metrics.activeWaitlist,
      attendanceSessions: summary.metrics.attendanceSessions,
      attendanceCorrections: summary.metrics.attendanceCorrections,
      attendanceScheduleAnomalies: summary.metrics.attendanceScheduleAnomalies,
    },
  }
}

module.exports = {
  closeoutSummary: closeoutSummary,
  projectCloseoutSummary: projectCloseoutSummary,
}
