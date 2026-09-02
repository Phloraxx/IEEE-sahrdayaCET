/// <reference path="../pb_data/types.d.ts" />

function dateMs(value) {
  if (!value) return 0
  var parsed = Date.parse(String(value))
  return isFinite(parsed) ? parsed : 0
}

function registrationMode(event) {
  var explicit = event.getString("registrationMode") || ""
  if (explicit === "internal" || explicit === "external" || explicit === "closed") return explicit
  if (event.getString("externalFormUrl")) return "external"
  return event.getBool("registrationOpen") ? "internal" : "closed"
}

function registrationWindowOpen(event, nowMs) {
  if (!event || event.getBool("isDeleted") || event.getString("status") !== "published") return false
  if (registrationMode(event) !== "internal" || !event.getBool("registrationOpen")) return false
  var end = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
  if (end && !isNaN(end.getTime()) && end.getTime() <= nowMs) return false
  var starts = dateMs(event.getString("registrationStart") || "")
  if (starts && starts > nowMs) return false
  var deadline = dateMs(event.getString("registrationDeadline") || "")
  if (deadline && deadline <= nowMs) return false
  return true
}

function offerMinutes(event) {
  var value = Number(event.getInt("waitlistOfferMinutes") || 360)
  if (!isFinite(value) || value < 15) return 360
  return Math.min(10080, Math.floor(value))
}
function offerExpiry(event, nowMs) {
  var expiry = nowMs + offerMinutes(event) * 60 * 1000
  var registrationDeadline = dateMs(event.getString("registrationDeadline") || "")
  if (registrationDeadline && registrationDeadline < expiry) expiry = registrationDeadline
  var eventEnd = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
  if (eventEnd && !isNaN(eventEnd.getTime()) && eventEnd.getTime() < expiry) expiry = eventEnd.getTime()
  return expiry > nowMs ? new Date(expiry).toISOString() : ""
}

function activeRegistrations(app, eventId) {
  return app.findRecordsByFilter(
    "registrations", "event = {:eventId} && registrationStatus != {:cancelled}",
    "", 0, 0, { eventId: eventId, cancelled: "cancelled" }
  )
}

function activeOffers(app, eventId, nowMs) {
  var rows = app.findRecordsByFilter(
    "event_waitlist", "event = {:eventId} && status = {:offered}",
    "joinedAt,id", 0, 0, { eventId: eventId, offered: "offered" }
  )
  return rows.filter(function (row) {
    var expires = dateMs(row.getString("offerExpiresAt") || "")
    return expires > nowMs
  })
}

function waitingRows(app, eventId) {
  return app.findRecordsByFilter(
    "event_waitlist", "event = {:eventId} && status = {:waiting}",
    "joinedAt,id", 0, 0, { eventId: eventId, waiting: "waiting" }
  )
}
function expireOffers(app, eventId, nowMs) {
  var rows = app.findRecordsByFilter(
    "event_waitlist", "event = {:eventId} && status = {:offered}",
    "", 0, 0, { eventId: eventId, offered: "offered" }
  )
  var expired = 0
  for (var i = 0; i < rows.length; i++) {
    var expires = dateMs(rows[i].getString("offerExpiresAt") || "")
    if (!expires || expires > nowMs) continue
    rows[i].set("status", "expired")
    rows[i].set("activeKey", "")
    app.saveNoValidate(rows[i])
    expired++
  }
  return expired
}

function waitlistTerminal(event, nowMs) {
  if (!event || event.getBool("isDeleted")) return true
  var status = event.getString("status") || ""
  if (status === "cancelled" || status === "completed") return true
  var deadline = dateMs(event.getString("registrationDeadline") || "")
  if (deadline && deadline <= nowMs) return true
  var end = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
  return !!(end && !isNaN(end.getTime()) && end.getTime() <= nowMs)
}

function retireActiveWaitlist(app, eventId) {
  var rows = app.findRecordsByFilter(
    "event_waitlist",
    "event = {:eventId} && (status = {:waiting} || status = {:offered})",
    "", 0, 0, { eventId: eventId, waiting: "waiting", offered: "offered" }
  )
  for (var i = 0; i < rows.length; i++) {
    rows[i].set("status", "expired")
    rows[i].set("activeKey", "")
    app.saveNoValidate(rows[i])
  }
  return rows.length
}

function updateSeatCounters(app, event, nowMs) {
  var active = activeRegistrations(app, event.id).length
  var reserved = activeOffers(app, event.id, nowMs).length
  event.set("registeredCount", active)
  event.set("waitlistReservedCount", reserved)
  app.saveNoValidate(event)
  return { activeRegistrations: active, reservedOffers: reserved }
}

function reconcileEventWaitlist(app, eventId, nowIso) {
  var nowMs = dateMs(nowIso) || Date.now()
  var event = app.findRecordById("events", eventId)
  var expired = expireOffers(app, eventId, nowMs)
  var capacity = Number(event.getInt("maxCapacity") || 0)
  if (waitlistTerminal(event, nowMs) || !event.getBool("waitlistEnabled") || capacity <= 0) {
    expired += retireActiveWaitlist(app, eventId)
  }
  var counts = updateSeatCounters(app, event, nowMs)
  var offered = 0
  if (!event.getBool("waitlistEnabled") || capacity <= 0 || !registrationWindowOpen(event, nowMs)) {
    return { expired: expired, offered: 0, activeRegistrations: counts.activeRegistrations, reservedOffers: counts.reservedOffers }
  }
  var slots = Math.max(0, capacity - counts.activeRegistrations - counts.reservedOffers)
  if (slots > 0) {
    var waiting = waitingRows(app, eventId)
    for (var i = 0; i < waiting.length && slots > 0; i++) {
      var expiry = offerExpiry(event, nowMs)
      if (!expiry) break
      waiting[i].set("status", "offered")
      waiting[i].set("offeredAt", new Date(nowMs).toISOString())
      waiting[i].set("offerExpiresAt", expiry)
      app.saveNoValidate(waiting[i])
      offered++
      slots--
    }
  }
  counts = updateSeatCounters(app, event, nowMs)
  return {
    expired: expired,
    offered: offered,
    activeRegistrations: counts.activeRegistrations,
    reservedOffers: counts.reservedOffers,
  }
}

function activeWaitlistEntry(app, eventId, userId) {
  try {
    return app.findFirstRecordByFilter(
      "event_waitlist",
      "event = {:eventId} && user = {:userId} && (status = {:waiting} || status = {:offered})",
      { eventId: eventId, userId: userId, waiting: "waiting", offered: "offered" }
    )
  } catch (_) { return null }
}

function validOfferForUser(app, eventId, userId, nowMs) {
  var row = activeWaitlistEntry(app, eventId, userId)
  if (!row || row.getString("status") !== "offered") return null
  return dateMs(row.getString("offerExpiresAt") || "") > nowMs ? row : null
}
function waitlistSnapshot(app, event, userId, nowMs) {
  var entry = activeWaitlistEntry(app, event.id, userId)
  if (!entry) return null
  var status = entry.getString("status") || ""
  var position = 0
  if (status === "waiting") {
    var waiting = waitingRows(app, event.id)
    for (var i = 0; i < waiting.length; i++) {
      if (waiting[i].id === entry.id) { position = i + 1; break }
    }
  }
  var expiresAt = entry.getString("offerExpiresAt") || ""
  if (status === "offered" && dateMs(expiresAt) <= nowMs) status = "expired"
  return {
    id: entry.id,
    status: status,
    position: position,
    joinedAt: entry.getString("joinedAt") || "",
    offeredAt: entry.getString("offeredAt") || "",
    offerExpiresAt: expiresAt,
  }
}

function cancellationDeadline(event, paid) {
  var value = paid ? event.getString("refundRequestUntil") : event.getString("selfCancellationUntil")
  if (!value && paid) value = event.getString("selfCancellationUntil")
  if (!value) value = event.getString("registrationDeadline")
  if (!value) value = event.getString("date")
  return value || ""
}

function activeCancellationRequest(app, registrationId) {
  try {
    return app.findFirstRecordByFilter(
      "registration_cancellation_requests",
      "registration = {:registration} && (status = {:open} || status = {:accepted})",
      { registration: registrationId, open: "open", accepted: "accepted" }
    )
  } catch (_) { return null }
}
function requestSnapshot(request) {
  if (!request) return null
  return {
    id: request.id,
    kind: request.getString("kind") || "refund",
    status: request.getString("status") || "open",
    reason: request.getString("reason") || "",
    requestedAt: request.getString("requestedAt") || "",
    decisionAt: request.getString("decisionAt") || "",
    resolutionNote: request.getString("resolutionNote") || "",
    resolvedAt: request.getString("resolvedAt") || "",
  }
}

function cancellationPolicy(app, event, registration, nowMs) {
  var request = activeCancellationRequest(app, registration.id)
  var status = registration.getString("registrationStatus") || ""
  var paymentStatus = registration.getString("paymentStatus") || ""
  var paymentData = require(__hooks + "/registration-helpers.js").registrationJsonObject(registration.get("paymentData"))
  var paid = paymentStatus === "paid"
  var deadline = cancellationDeadline(event, paid)
  var deadlineMs = dateMs(deadline)
  var ended = false
  var end = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
  if (end && !isNaN(end.getTime())) ended = end.getTime() <= nowMs
  var allowed = event.getBool("allowSelfCancellation") && status !== "cancelled" && !ended && !registration.getBool("checkedIn")
  if (deadlineMs && deadlineMs <= nowMs) allowed = false
  if (paymentData.manualReview === true) allowed = false
  if (paymentStatus === "refunded") allowed = false
  return {
    allowed: allowed,
    mode: allowed ? (paid ? "refund_request" : "direct") : "none",
    deadline: deadline,
    refundPolicy: event.getString("refundPolicy") || "",
    request: requestSnapshot(request),
  }
}
function createRefundRequest(app, registration, event, userId, reason, nowIso) {
  var existing = activeCancellationRequest(app, registration.id)
  if (existing) return existing
  var collection = app.findCollectionByNameOrId("registration_cancellation_requests")
  var request = new Record(collection, {
    registration: registration.id,
    event: event.id,
    user: userId,
    kind: "refund",
    status: "open",
    activeKey: registration.id,
    reason: String(reason || "").trim().slice(0, 2000),
    requestedAt: nowIso,
  })
  app.saveNoValidate(request)
  return request
}

function cancelUnpaidRegistration(app, registration, userId, reason, nowIso) {
  var status = registration.getString("registrationStatus") || ""
  if (status === "cancelled") return registration
  var paymentStatus = registration.getString("paymentStatus") || ""
  if (paymentStatus === "paid" || paymentStatus === "refunded") throw new Error("PAID_REGISTRATION_REQUIRES_REQUEST")
  var rh = require(__hooks + "/registration-helpers.js")
  var data = rh.registrationJsonObject(registration.get("paymentData"))
  registration.set("registrationStatus", "cancelled")
  if (paymentStatus === "pending") registration.set("paymentStatus", "failed")
  data.attendeeCancellation = {
    cancelledAt: nowIso,
    cancelledBy: userId,
    reason: String(reason || "").trim().slice(0, 2000),
  }
  registration.set("paymentData", data)
  app.saveNoValidate(registration)

  var payments = app.findRecordsByFilter("payments", "registration = {:registration}", "", 0, 0, { registration: registration.id })
  for (var i = 0; i < payments.length; i++) {
    var ledgerStatus = payments[i].getString("status") || ""
    if (ledgerStatus === "created" || ledgerStatus === "pending" || ledgerStatus === "authorized") {
      payments[i].set("status", "cancelled")
      app.saveNoValidate(payments[i])
    }
  }
  return registration
}
function waitlistItemsForUser(app, userId, nowMs) {
  var rows = app.findRecordsByFilter(
    "event_waitlist", "user = {:userId} && (status = {:waiting} || status = {:offered})",
    "-joinedAt", 100, 0, { userId: userId, waiting: "waiting", offered: "offered" }
  )
  var items = []
  for (var i = 0; i < rows.length; i++) {
    var event = null
    try { event = app.findRecordById("events", rows[i].getString("event")) } catch (_) {}
    if (!event) continue
    var state = waitlistSnapshot(app, event, userId, nowMs)
    if (!state || (state.status !== "waiting" && state.status !== "offered")) continue
    items.push({
      event: {
        id: event.id,
        title: event.getString("title") || "Event",
        slug: event.getString("slug") || "",
        date: event.getString("date") || "",
        venue: event.getString("venue") || "",
        status: event.getString("status") || "draft",
        isArchived: event.getBool("isDeleted"),
      },
      entry: state,
    })
  }
  return items
}

function resolveCancellationRequestForRegistration(app, registration, nowIso) {
  if (!registration || registration.getString("paymentStatus") !== "refunded") return 0
  var request = activeCancellationRequest(app, registration.id)
  if (!request) return 0
  request.set("status", "resolved")
  request.set("activeKey", "")
  request.set("resolvedAt", nowIso || new Date().toISOString())
  app.saveNoValidate(request)
  return 1
}

function resolveCompletedCancellationRequests(app) {
  var rows = app.findRecordsByFilter(
    "registration_cancellation_requests",
    "status = {:open} || status = {:accepted}", "", 0, 0,
    { open: "open", accepted: "accepted" }
  )
  var resolved = 0
  for (var i = 0; i < rows.length; i++) {
    var registration = null
    try { registration = app.findRecordById("registrations", rows[i].getString("registration")) } catch (_) {}
    if (!registration) continue
    if (registration.getString("paymentStatus") !== "refunded") continue
    rows[i].set("status", "resolved")
    rows[i].set("activeKey", "")
    rows[i].set("resolvedAt", new Date().toISOString())
    app.saveNoValidate(rows[i])
    resolved++
  }
  return resolved
}

module.exports = {
  activeCancellationRequest: activeCancellationRequest,
  activeOffers: activeOffers,
  activeRegistrations: activeRegistrations,
  activeWaitlistEntry: activeWaitlistEntry,
  cancelUnpaidRegistration: cancelUnpaidRegistration,
  cancellationPolicy: cancellationPolicy,
  createRefundRequest: createRefundRequest,
  dateMs: dateMs,
  offerExpiry: offerExpiry,
  reconcileEventWaitlist: reconcileEventWaitlist,
  registrationWindowOpen: registrationWindowOpen,
  requestSnapshot: requestSnapshot,
  resolveCancellationRequestForRegistration: resolveCancellationRequestForRegistration,
  resolveCompletedCancellationRequests: resolveCompletedCancellationRequests,
  retireActiveWaitlist: retireActiveWaitlist,
  updateSeatCounters: updateSeatCounters,
  validOfferForUser: validOfferForUser,
  waitingRows: waitingRows,
  waitlistItemsForUser: waitlistItemsForUser,
  waitlistSnapshot: waitlistSnapshot,
}
