/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/events/{id}/waitlist", function (e) {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var nowMs = Date.now()
  var capacity = Number(event.getInt("maxCapacity") || 0)
  var active = helpers.activeRegistrations($app, eventId).length
  var reserved = helpers.activeOffers($app, eventId, nowMs).length
  var state = helpers.waitlistSnapshot($app, event, e.auth.id, nowMs)
  return e.json(200, {
    enabled: event.getBool("waitlistEnabled") && capacity > 0,
    registrationOpen: helpers.registrationWindowOpen(event, nowMs),
    full: capacity > 0 && active + reserved >= capacity,
    capacity: capacity,
    occupied: active + reserved,
    state: state,
  })
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/app/events/{id}/waitlist/join", function (e) {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var audit = require(__hooks + "/admin-operations-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var failure = null
  var response = null
  try {
    $app.runInTransaction(function (txApp) {
      var event
      try { event = txApp.findRecordById("events", eventId) }
      catch (_) { failure = { status: 404, code: "EVENT_NOT_FOUND", error: "Event not found" }; return }
      var nowMs = Date.now()
      var nowIso = new Date(nowMs).toISOString()
      helpers.reconcileEventWaitlist(txApp, eventId, nowIso)
      event = txApp.findRecordById("events", eventId)
      if (!event.getBool("waitlistEnabled") || (event.getInt("maxCapacity") || 0) <= 0) {
        failure = { status: 409, code: "WAITLIST_DISABLED", error: "This event does not use a waitlist" }; return
      }
      if (!helpers.registrationWindowOpen(event, nowMs)) {
        failure = { status: 409, code: "REGISTRATION_CLOSED", error: "Registration is not currently open" }; return
      }
      var registrations = txApp.findRecordsByFilter(
        "registrations", "event = {:eventId} && user = {:userId} && registrationStatus != {:cancelled}",
        "", 1, 0, { eventId: eventId, userId: e.auth.id, cancelled: "cancelled" }
      )
      if (registrations.length) {
        failure = { status: 409, code: "ALREADY_REGISTERED", error: "You already have an active registration for this event" }; return
      }
      var existing = helpers.activeWaitlistEntry(txApp, eventId, e.auth.id)
      if (existing) {
        response = { joined: false, reused: true, state: helpers.waitlistSnapshot(txApp, event, e.auth.id, nowMs) }
        return
      }
      var active = helpers.activeRegistrations(txApp, eventId).length
      var reserved = helpers.activeOffers(txApp, eventId, nowMs).length
      var capacity = event.getInt("maxCapacity") || 0
      if (active + reserved < capacity) {
        failure = { status: 409, code: "REGISTRATION_AVAILABLE", error: "A registration place is available; register directly instead" }; return
      }
      var collection = txApp.findCollectionByNameOrId("event_waitlist")
      var row = new Record(collection, { event: eventId, user: e.auth.id, status: "waiting", activeKey: eventId + ":" + e.auth.id, joinedAt: nowIso })
      txApp.saveNoValidate(row)
      response = { joined: true, reused: false, state: helpers.waitlistSnapshot(txApp, event, e.auth.id, nowMs) }
      audit.audit(txApp, { eventId: eventId, actorId: e.auth.id, action: "waitlist.joined", entityType: "waitlist", entityId: row.id })
    })
  } catch (err) {
    console.log("[attendee-lifecycle] waitlist join failed:", err)
    return e.json(500, { code: "WAITLIST_JOIN_FAILED", error: "Could not join the waitlist" })
  }
  if (failure) return e.json(failure.status || 400, { code: failure.code || "WAITLIST_JOIN_FAILED", error: failure.error || "Could not join the waitlist" })
  return e.json(response && response.joined ? 201 : 200, response)
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/app/events/{id}/waitlist/leave", function (e) {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var audit = require(__hooks + "/admin-operations-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var response = { left: false, alreadyLeft: true }
  try {
    $app.runInTransaction(function (txApp) {
      var event
      try { event = txApp.findRecordById("events", eventId) }
      catch (_) { throw new Error("EVENT_NOT_FOUND") }
      var nowIso = new Date().toISOString()
      helpers.reconcileEventWaitlist(txApp, eventId, nowIso)
      var row = helpers.activeWaitlistEntry(txApp, eventId, e.auth.id)
      if (!row) return
      row.set("status", "cancelled")
      row.set("activeKey", "")
      txApp.saveNoValidate(row)
      helpers.reconcileEventWaitlist(txApp, eventId, nowIso)
      response = { left: true, alreadyLeft: false }
      audit.audit(txApp, { eventId: eventId, actorId: e.auth.id, action: "waitlist.left", entityType: "waitlist", entityId: row.id })
    })
  } catch (err) {
    if (String(err && err.message || err) === "EVENT_NOT_FOUND") return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" })
    console.log("[attendee-lifecycle] waitlist leave failed:", err)
    return e.json(500, { code: "WAITLIST_LEAVE_FAILED", error: "Could not leave the waitlist" })
  }
  return e.json(200, response)
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/app/registrations/{id}/cancel", function (e) {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var audit = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var registrationId = e.request.pathValue("id") || ""
  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var reason = String(body.reason || "").trim()
  var failure = null
  var response = null
  var couponCode = ""
  try {
    $app.runInTransaction(function (txApp) {
      var registration
      try { registration = txApp.findRecordById("registrations", registrationId) }
      catch (_) { failure = { status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }; return }
      if (registration.getString("user") !== e.auth.id) {
        failure = { status: 403, code: "FORBIDDEN", error: "You can only cancel your own registration" }; return
      }
      var event
      try { event = txApp.findRecordById("events", registration.getString("event")) }
      catch (_) { failure = { status: 404, code: "EVENT_NOT_FOUND", error: "Event not found" }; return }
      var nowMs = Date.now()
      var nowIso = new Date(nowMs).toISOString()
      var policy = helpers.cancellationPolicy(txApp, event, registration, nowMs)
      if (!policy.allowed) {
        failure = { status: 409, code: "SELF_CANCELLATION_NOT_AVAILABLE", error: "Self-cancellation is not available for this registration" }; return
      }
      if (policy.mode === "refund_request") {
        var request = helpers.createRefundRequest(txApp, registration, event, e.auth.id, reason, nowIso)
        response = { action: "refund_requested", request: helpers.requestSnapshot(request) }
        audit.audit(txApp, {
          eventId: event.id, registrationId: registration.id, actorId: e.auth.id,
          action: "registration.refund-requested", note: reason,
        })
        return
      }
      couponCode = registration.getString("couponCode") || ""
      var before = audit.registrationSnapshot(registration)
      helpers.cancelUnpaidRegistration(txApp, registration, e.auth.id, reason, nowIso)
      helpers.reconcileEventWaitlist(txApp, event.id, nowIso)
      response = { action: "cancelled", registration: audit.registrationSnapshot(registration) }
      audit.audit(txApp, {
        eventId: event.id, registrationId: registration.id, actorId: e.auth.id,
        action: "registration.self-cancelled", note: reason, before: before, after: response.registration,
      })
    })
  } catch (err) {
    console.log("[attendee-lifecycle] self-cancellation failed:", err)
    return e.json(500, { code: "SELF_CANCELLATION_FAILED", error: "Could not cancel this registration" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })
  if (couponCode && response && response.action === "cancelled") {
    try {
      var saved = $app.findRecordById("registrations", registrationId)
      rh.recomputeCouponUsedCount(couponCode, saved.getString("event") || "")
    } catch (_) {}
  }
  return e.json(response.action === "refund_requested" ? 202 : 200, response)
}, $apis.requireAuth("users"))
routerAdd("POST", "/api/admin/cancellation-requests/{id}/decision", function (e) {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var audit = require(__hooks + "/admin-operations-helpers.js")
  var authz = require(__hooks + "/workspace-authorization.js")
  var requestId = e.request.pathValue("id") || ""
  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var action = String(body.action || "").trim()
  var note = String(body.note || "").trim()
  if (action !== "accept" && action !== "decline") {
    return e.json(400, { code: "INVALID_DECISION", error: "Decision must be accept or decline" })
  }
  if (!note) return e.json(400, { code: "NOTE_REQUIRED", error: "A decision note is required" })
  var result = null
  var failure = null
  try {
    $app.runInTransaction(function (txApp) {
      var request
      try { request = txApp.findRecordById("registration_cancellation_requests", requestId) }
      catch (_) { failure = { status: 404, code: "REQUEST_NOT_FOUND", error: "Cancellation request not found" }; return }
      var event = txApp.findRecordById("events", request.getString("event"))
      if (!authz.hasEventCapability(txApp, e.auth, "finance.manage", event)) {
        failure = { status: 403, code: "FORBIDDEN", error: "Finance permission is required" }; return
      }
      var current = request.getString("status") || ""
      var target = action === "accept" ? "accepted" : "declined"
      if (current === target) { result = helpers.requestSnapshot(request); return }
      if (current !== "open") {
        failure = { status: 409, code: "REQUEST_ALREADY_DECIDED", error: "This request has already been decided" }; return
      }
      request.set("status", target)
      if (target === "declined") request.set("activeKey", "")
      request.set("decisionAt", new Date().toISOString())
      request.set("decisionBy", e.auth.id)
      request.set("resolutionNote", note.slice(0, 2000))
      txApp.saveNoValidate(request)
      result = helpers.requestSnapshot(request)
      audit.audit(txApp, {
        eventId: event.id, registrationId: request.getString("registration"), actorId: e.auth.id,
        action: "registration.refund-request." + target, note: note,
        entityType: "registration_cancellation_request", entityId: request.id,
      })
    })
  } catch (err) {
    console.log("[attendee-lifecycle] cancellation decision failed:", err)
    return e.json(500, { code: "CANCELLATION_DECISION_FAILED", error: "Could not save the decision" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })
  return e.json(200, { request: result })
}, $apis.requireAuth("users"))

cronAdd("attendee-lifecycle-reconcile", "* * * * *", function () {
  var helpers = require(__hooks + "/attendee-lifecycle-helpers.js")
  var entries = []
  try {
    entries = $app.findRecordsByFilter(
      "event_waitlist", "status = {:waiting} || status = {:offered}", "", 0, 0,
      { waiting: "waiting", offered: "offered" }
    )
  } catch (err) { console.log("[attendee-lifecycle] waitlist scan failed:", err) }
  var eventIds = {}
  for (var i = 0; i < entries.length; i++) {
    var eventId = entries[i].getString("event") || ""
    if (eventId) eventIds[eventId] = true
  }
  var ids = Object.keys(eventIds)
  for (var ei = 0; ei < ids.length; ei++) {
    try {
      var id = ids[ei]
      $app.runInTransaction(function (txApp) {
        helpers.reconcileEventWaitlist(txApp, id, new Date().toISOString())
      })
    } catch (err) {
      console.log("[attendee-lifecycle] waitlist reconciliation failed for " + ids[ei] + ":", err)
    }
  }
  try { helpers.resolveCompletedCancellationRequests($app) }
  catch (err) { console.log("[attendee-lifecycle] cancellation request reconciliation failed:", err) }
})
