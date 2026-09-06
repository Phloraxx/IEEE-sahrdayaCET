/// <reference path="../pb_data/types.d.ts" />

// Archival is not cancellation. It only hides a historical/unused event while
// preserving its operational outcome and related records.
routerAdd("POST", "/api/admin/events/{id}/archive", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var authz = require(__hooks + "/workspace-authorization.js")
  var attendeeLifecycle = require(__hooks + "/attendee-lifecycle-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }

  if (!authz.hasEventCapability($app, e.auth, "events.archive", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot archive this event" })
  }
  if (event.getBool("isDeleted")) {
    return e.json(200, { archived: true, alreadyArchived: true })
  }

  var status = event.getString("status") || "draft"
  if (status === "published") {
    return e.json(409, { code: "EVENT_STILL_PUBLISHED", error: "Unpublish, complete, or cancel the event before archiving it" })
  }

  if (status === "draft") {
    var active = $app.findRecordsByFilter(
      "registrations",
      "event = {:eventId} && registrationStatus != {:cancelled}",
      "",
      1,
      0,
      { eventId: eventId, cancelled: "cancelled" }
    )
    if (active.length > 0) {
      return e.json(409, {
        code: "ACTIVE_REGISTRATIONS",
        error: "A draft with active registrations cannot be archived",
      })
    }
  } else if (status !== "completed" && status !== "cancelled") {
    return e.json(409, { code: "ARCHIVE_NOT_ALLOWED", error: "This event is not ready to archive" })
  }

  var result = { archived: false, alreadyArchived: false }
  try {
    $app.runInTransaction(function (txApp) {
      var current = txApp.findRecordById("events", eventId)
      if (current.getBool("isDeleted")) {
        result.archived = true
        result.alreadyArchived = true
        return
      }

      var currentStatus = current.getString("status") || "draft"
      if (currentStatus === "published") throw new Error("EVENT_STILL_PUBLISHED")
      if (currentStatus === "draft") {
        var liveActive = txApp.findRecordsByFilter(
          "registrations",
          "event = {:eventId} && registrationStatus != {:cancelled}",
          "",
          1,
          0,
          { eventId: eventId, cancelled: "cancelled" }
        )
        if (liveActive.length > 0) throw new Error("ACTIVE_REGISTRATIONS")
      } else if (currentStatus !== "completed" && currentStatus !== "cancelled") {
        throw new Error("ARCHIVE_NOT_ALLOWED")
      }
      if (currentStatus === "completed" || currentStatus === "cancelled") {
        var closeout = require(__hooks + "/event-closeout-helpers.js").closeoutSummary(txApp, current)
        if (!closeout.readyToArchive) throw new Error("CLOSEOUT_BLOCKED")
      }

      var before = helpers.eventPayload(current)
      current.set("registrationOpen", false)
      current.set("isDeleted", true)
      current.set("waitlistReservedCount", 0)
      attendeeLifecycle.retireActiveWaitlist(txApp, eventId)
      txApp.saveNoValidate(current)
      helpers.audit(txApp, {
        eventId: eventId,
        actorId: e.auth.id,
        action: "event.archived",
        before: before,
        after: helpers.eventPayload(current),
      })
      result.archived = true
    })
  } catch (err) {
    var message = String(err && err.message || "")
    if (message === "EVENT_STILL_PUBLISHED") {
      return e.json(409, { code: message, error: "Unpublish, complete, or cancel the event before archiving it" })
    }
    if (message === "ACTIVE_REGISTRATIONS") {
      return e.json(409, { code: message, error: "A draft with active registrations cannot be archived" })
    }
    if (message === "ARCHIVE_NOT_ALLOWED") {
      return e.json(409, { code: message, error: "This event is not ready to archive" })
    }
    if (message === "CLOSEOUT_BLOCKED") {
      return e.json(409, { code: message, error: "Resolve closeout blockers before archiving this event" })
    }
    console.log("[admin-ops] event archive failed:", err)
    return e.json(500, { code: "EVENT_ARCHIVE_FAILED", error: "Could not archive event safely" })
  }

  return e.json(200, result)
}, $apis.requireAuth("users"))
