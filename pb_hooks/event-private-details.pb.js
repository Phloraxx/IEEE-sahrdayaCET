/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/events/{id}/private-details", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot edit private attendee access for this event" })
  }
  var privateHelpers = require(__hooks + "/event-private-details-helpers.js")
  return e.json(200, privateHelpers.responsePayload(privateHelpers.findDetails($app, eventId)))
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
  var privateHelpers = require(__hooks + "/event-private-details-helpers.js")
  var virtualJoinUrl = ""
  try {
    virtualJoinUrl = privateHelpers.safeHttpUrl(body.virtualJoinUrl)
  } catch (err) {
    if (err && err.message === "INVALID_JOIN_URL") {
      return e.json(400, { code: "INVALID_JOIN_URL", error: "Private join URL must use http or https" })
    }
    console.log("[event-private] URL validation failed unexpectedly:", err)
    return e.json(500, { code: "PRIVATE_DETAILS_VALIDATION_FAILED", error: "Could not validate private attendee access" })
  }
  var joinInstructions = String(body.joinInstructions || "").trim().slice(0, 4000)

  var mode = privateHelpers.attendanceMode(event)
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
      var record = privateHelpers.findDetails(txApp, eventId)
      var before = privateHelpers.privateSummary(record)
      if (!record) record = new Record(collection, { event: eventId })
      record.set("virtualJoinUrl", virtualJoinUrl)
      record.set("joinInstructions", joinInstructions)
      txApp.save(record)
      result = privateHelpers.responsePayload(record)

      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        actorId: e.auth.id,
        action: "event.private-access.updated",
        entityType: "event_private_details",
        entityId: eventId,
        before: before,
        after: privateHelpers.privateSummary(record),
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

  var privateHelpers = require(__hooks + "/event-private-details-helpers.js")
  if (!privateHelpers.confirmedRegistration($app, e.auth.id, eventId)) {
    return e.json(403, { code: "CONFIRMED_REGISTRATION_REQUIRED", error: "Confirmed registration is required" })
  }

  if (privateHelpers.attendanceMode(event) === "onsite") {
    return e.json(200, { virtualJoinUrl: "", joinInstructions: "" })
  }
  return e.json(200, privateHelpers.responsePayload(privateHelpers.findDetails($app, eventId)))
}, $apis.requireAuth("users"))
