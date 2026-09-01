/// <reference path="../pb_data/types.d.ts" />

function eventPrivateDetails(app, eventId) {
  try {
    return app.findFirstRecordByFilter(
      "event_private_details",
      "event = {:eventId}",
      { eventId: eventId }
    )
  } catch (_) { return null }
}

function eventAttendanceMode(event) {
  var mode = event.getString("attendanceMode") || ""
  if (mode === "onsite" || mode === "online" || mode === "hybrid") return mode
  var venue = String(event.getString("venue") || "").toLowerCase()
  if (/\b(hybrid|mixed mode|online and offline)\b/.test(venue)) return "hybrid"
  if (/\b(online|virtual|google meet|zoom|microsoft teams|webex|meet\.google\.com)\b/.test(venue)) return "online"
  return "onsite"
}

function safeHttpUrl(value) {
  var text = String(value || "").trim()
  if (!text) return ""
  if (!/^https?:\/\//i.test(text)) throw new Error("INVALID_JOIN_URL")
  return text
}

function privateSummary(record) {
  return {
    hasJoinUrl: Boolean(record && record.getString("virtualJoinUrl")),
    hasJoinInstructions: Boolean(record && record.getString("joinInstructions")),
  }
}

function responsePayload(record) {
  return {
    virtualJoinUrl: record ? record.getString("virtualJoinUrl") || "" : "",
    joinInstructions: record ? record.getString("joinInstructions") || "" : "",
  }
}

function confirmedRegistration(app, userId, eventId) {
  try {
    return app.findFirstRecordByFilter(
      "registrations",
      "user = {:userId} && event = {:eventId} && registrationStatus = {:confirmed}",
      { userId: userId, eventId: eventId, confirmed: "confirmed" }
    )
  } catch (_) { return null }
}

routerAdd("GET", "/api/app/events/{id}/private-details", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot edit private attendee access for this event" })
  }
  return e.json(200, responsePayload(eventPrivateDetails($app, eventId)))
}, $apis.requireAuth("users"))

routerAdd("PUT", "/api/app/events/{id}/private-details", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot edit private attendee access for this event" })
  }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var virtualJoinUrl = ""
  try { virtualJoinUrl = safeHttpUrl(body.virtualJoinUrl) }
  catch (_) { return e.json(400, { code: "INVALID_JOIN_URL", error: "Private join URL must use http or https" }) }
  var joinInstructions = String(body.joinInstructions || "").trim().slice(0, 4000)

  var mode = eventAttendanceMode(event)
  if (mode === "onsite" && (virtualJoinUrl || joinInstructions)) {
    return e.json(409, {
      code: "ONSITE_EVENT",
      error: "Private online access can only be stored for online or hybrid events",
    })
  }

  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var collection = txApp.findCollectionByNameOrId("event_private_details")
      var record = eventPrivateDetails(txApp, eventId)
      var before = privateSummary(record)
      if (!record) record = new Record(collection, { event: eventId })
      record.set("virtualJoinUrl", virtualJoinUrl)
      record.set("joinInstructions", joinInstructions)
      txApp.save(record)
      result = responsePayload(record)

      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        actorId: e.auth.id,
        action: "event.private-access.updated",
        entityType: "event_private_details",
        entityId: eventId,
        before: before,
        after: privateSummary(record),
      })
    })
  } catch (err) {
    console.log("[event-private] update failed:", err)
    return e.json(500, { code: "PRIVATE_DETAILS_UPDATE_FAILED", error: "Could not save private attendee access" })
  }
  return e.json(200, result || { virtualJoinUrl: "", joinInstructions: "" })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/app/events/{id}/join-details", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  if (!confirmedRegistration($app, e.auth.id, eventId)) {
    return e.json(403, { code: "CONFIRMED_REGISTRATION_REQUIRED", error: "Confirmed registration is required" })
  }

  var mode = eventAttendanceMode(event)
  if (mode === "onsite") {
    return e.json(200, { virtualJoinUrl: "", joinInstructions: "" })
  }
  return e.json(200, responsePayload(eventPrivateDetails($app, eventId)))
}, $apis.requireAuth("users"))
