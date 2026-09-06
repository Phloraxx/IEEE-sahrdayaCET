/// <reference path="../pb_data/types.d.ts" />

function registrationTime(record) {
  return Date.parse(record.getString("registrationDate") || record.getString("created") || "") || 0
}

function preferredRegistration(rows) {
  rows.sort(function (a, b) { return registrationTime(b) - registrationTime(a) })
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].getString("registrationStatus") !== "cancelled") return rows[i]
  }
  return rows.length ? rows[0] : null
}

function eventBannerUrl(event) {
  var banner = event.getString("banner") || ""
  if (!banner) return ""
  return "/api/files/events/" + event.id + "/" + encodeURIComponent(banner)
}

function activeCertificates(app, registrationId) {
  var rows = []
  try {
    rows = app.findRecordsByFilter(
      "certificates",
      "registration = {:registration} && status = {:active}",
      "-issuedAt",
      20,
      0,
      { registration: registrationId, active: "active" }
    )
  } catch (_) { rows = [] }
  return rows.map(function (row) {
    return {
      credentialId: row.getString("credentialId") || "",
      verificationToken: row.getString("verificationToken") || "",
      certificateType: row.getString("certificateType") || "participation",
      issuedAt: row.getString("issuedAt") || "",
      status: row.getString("status") || "active",
    }
  })
}

function attendanceSnapshot(app, event, registration) {
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var allSessions = attendance.sessionsForEvent(app, event.id)
  if (!allSessions.length) {
    return {
      mode: "legacy",
      checkedIn: registration.getBool("checkedIn"),
      checkedInAt: registration.getString("checkedInAt") || "",
      attendedSessions: registration.getBool("checkedIn") ? 1 : 0,
      totalSessions: 0,
      sessions: [],
    }
  }
  var sessions = allSessions.filter(function (session) { return session.getBool("attendanceEnabled") })
  var attended = 0
  var items = []
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i]
    var state = attendance.registrationSessionState(app, session.id, registration.id)
    if (state.present) attended += 1
    items.push({
      id: session.id,
      title: session.getString("title") || "Session",
      startsAt: session.getString("startsAt") || "",
      endsAt: session.getString("endsAt") || "",
      present: state.present === true,
    })
  }
  return {
    mode: "sessions",
    checkedIn: registration.getBool("checkedIn"),
    checkedInAt: registration.getString("checkedInAt") || "",
    attendedSessions: attended,
    totalSessions: sessions.length,
    sessions: items,
  }
}

function privateAccess(app, event, registration, ended) {
  if (ended || event.getString("status") !== "published") return null
  if (registration.getString("registrationStatus") !== "confirmed") return null
  var details = require(__hooks + "/event-private-details-helpers.js")
  var mode = details.attendanceMode(event)
  if (mode !== "online" && mode !== "hybrid") return null
  var record = details.findDetails(app, event.id)
  var payload = details.responsePayload(record)
  if (!payload.virtualJoinUrl && !payload.joinInstructions) return null
  return payload
}
function societySummary(app, event) {
  var societyId = event.getString("society") || ""
  if (!societyId) return null
  try {
    var society = app.findRecordById("societies", societyId)
    return {
      id: society.id,
      name: society.getString("name") || "IEEE Sahrdaya",
      slug: society.getString("slug") || "",
    }
  } catch (_) { return null }
}

function eventEnded(event) {
  var end = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
  return !!(end && !isNaN(end.getTime()) && end.getTime() <= Date.now())
}

function registrationPaymentData(registration) {
  try {
    return require(__hooks + "/registration-helpers.js").registrationJsonObject(registration.get("paymentData")) || {}
  } catch (_) { return {} }
}

function myEventItem(app, event, registration) {
  var rh = require(__hooks + "/registration-helpers.js")
  var ended = eventEnded(event)
  var status = registration.getString("registrationStatus") || ""
  var paymentStatus = registration.getString("paymentStatus") || ""
  var amount = rh.registrationAmount(registration)
  var paymentData = registrationPaymentData(registration)
  var ticketId = registration.getString("ticketId") || ""
  var manualReview = paymentData.manualReview === true
  var certificates = activeCertificates(app, registration.id)
  var attendance = attendanceSnapshot(app, event, registration)
  var cancellation = require(__hooks + "/attendee-lifecycle-helpers.js").cancellationPolicy(app, event, registration, Date.now())
  return {
    event: {
      id: event.id,
      title: event.getString("title") || "Event",
      slug: event.getString("slug") || "",
      date: event.getString("date") || "",
      endDate: event.getString("endDate") || "",
      timeTbc: event.getBool("timeTbc"),
      venue: event.getString("venue") || "",
      timezone: event.getString("timezone") || "Asia/Kolkata",
      attendanceMode: event.getString("attendanceMode") || "onsite",
      locationAddress: event.getString("locationAddress") || "",
      bannerUrl: eventBannerUrl(event),
      status: event.getString("status") || "draft",
      isArchived: event.getBool("isDeleted"),
      society: societySummary(app, event),
    },
    registration: {
      id: registration.id,
      status: status,
      paymentStatus: paymentStatus,
      amount: amount,
      paymentRequired: status === "pending" && paymentStatus === "pending" && amount > 0,
      manualReview: manualReview,
      reviewReason: String(paymentData.reviewReason || ""),
      ticketId: ticketId,
      receiptAvailable: (paymentStatus === "paid" || paymentStatus === "refunded") && amount > 0 && !!ticketId,
      registeredAt: registration.getString("registrationDate") || registration.getString("created") || "",
    },
    ended: ended,
    privateAccess: privateAccess(app, event, registration, ended),
    cancellation: cancellation,
    attendance: attendance,
    certificates: certificates,
  }
}

function listForUser(app, userId) {
  var rows = []
  try {
    rows = app.findRecordsByFilter("registrations", "user = {:user}", "", 500, 0, { user: userId })
  } catch (_) { rows = [] }
  var grouped = {}
  for (var i = 0; i < rows.length; i++) {
    var eventId = rows[i].getString("event") || ""
    if (!eventId) continue
    if (!grouped[eventId]) grouped[eventId] = []
    grouped[eventId].push(rows[i])
  }
  var items = []
  var eventIds = Object.keys(grouped)
  for (var j = 0; j < eventIds.length; j++) {
    var eventId = eventIds[j]
    var registration = preferredRegistration(grouped[eventId])
    if (!registration) continue
    var event = null
    try { event = app.findRecordById("events", eventId) } catch (_) { event = null }
    if (!event) continue
    items.push(myEventItem(app, event, registration))
  }
  items.sort(function (a, b) {
    var av = Date.parse(a.event.date || "") || 0
    var bv = Date.parse(b.event.date || "") || 0
    if (a.ended !== b.ended) return a.ended ? 1 : -1
    return a.ended ? bv - av : av - bv
  })
  return items
}

module.exports = {
  activeCertificates: activeCertificates,
  attendanceSnapshot: attendanceSnapshot,
  eventEnded: eventEnded,
  listForUser: listForUser,
  myEventItem: myEventItem,
  preferredRegistration: preferredRegistration,
  privateAccess: privateAccess,
}
