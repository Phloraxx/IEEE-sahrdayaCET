/// <reference path="../pb_data/types.d.ts" />

// Event cancellation is an operational command because registration/payment
// state must move with the event. Block ordinary record PATCHes from bypassing it.
onRecordUpdateRequest(function (e) {
  var old = null
  try { old = $app.findRecordById("events", e.record.id) } catch (_) {}
  if (old && old.getString("status") !== "cancelled" && e.record.getString("status") === "cancelled") {
    throw new BadRequestError("Use the Cancel event command so registrations are resolved safely")
  }
  e.next()
}, "events")

routerAdd("POST", "/api/admin/events/{id}/cancel", function (e) {
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var paymentLedger = require(__hooks + "/payment-ledger-helpers.js")
  var eventId = e.request.pathValue("id") || ""
  var auth = e.auth
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, auth, "events.cancel", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot cancel this event" })
  }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var reason = String(body.reason || "").trim()
  if (!reason) return e.json(400, { code: "REASON_REQUIRED", error: "A cancellation reason is required" })

  var result = { alreadyCancelled: false, cancelled: 0, refundReview: 0, manualRefundRequired: 0, releasedPending: 0, waitlistCancelled: 0 }
  try {
    $app.runInTransaction(function (txApp) {
      var currentEvent = txApp.findRecordById("events", eventId)
      if (currentEvent.getString("status") === "cancelled") {
        result.alreadyCancelled = true
        return
      }
      var beforeEvent = helpers.eventPayload(currentEvent)
      currentEvent.set("status", "cancelled")
      currentEvent.set("registrationOpen", false)
      currentEvent.set("waitlistReservedCount", 0)
      txApp.saveNoValidate(currentEvent)
      var waitlistRows = txApp.findRecordsByFilter(
        "event_waitlist", "event = {:eventId} && (status = {:waiting} || status = {:offered})",
        "", 0, 0, { eventId: eventId, waiting: "waiting", offered: "offered" }
      )
      for (var wi = 0; wi < waitlistRows.length; wi++) {
        waitlistRows[wi].set("status", "cancelled")
        txApp.saveNoValidate(waitlistRows[wi])
        result.waitlistCancelled++
      }
      var registrations = txApp.findRecordsByFilter(
        "registrations", "event = {:eventId} && registrationStatus != {:cancelled}",
        "", 0, 0, { eventId: eventId, cancelled: "cancelled" }
      )
      var now = new Date().toISOString()
      for (var i = 0; i < registrations.length; i++) {
        var reg = registrations[i]
        var before = helpers.registrationSnapshot(reg)
        var payStatus = reg.getString("paymentStatus") || ""
        var data = helpers.jsonObject(reg.get("paymentData"))
        reg.set("registrationStatus", "cancelled")

        if (payStatus === "pending") {
          reg.set("paymentStatus", "failed")
          data.releaseReason = "Event cancelled by organizer"
          data.providerStatus = data.providerStatus || "cancelled"
          var pendingLedger = paymentLedger.findLatestForRegistration(txApp, reg.id)
          if (pendingLedger) {
            pendingLedger.set("status", "cancelled")
            pendingLedger.set("lastSyncedAt", now)
            txApp.saveNoValidate(pendingLedger)
          }
          result.releasedPending++
        } else if (payStatus === "paid") {
          var ledger = paymentLedger.findLatestForRegistration(txApp, reg.id)
          var collectedPaise = ledger ? Number(ledger.getInt("collectedPaise") || 0) : 0
          var refundedPaise = ledger ? Number(ledger.getInt("refundedPaise") || 0) : 0
          var fullyRefunded = ledger && collectedPaise > 0 && refundedPaise >= collectedPaise
          if (fullyRefunded) {
            data.manualReview = false
            data.reviewReason = "Payment was already fully refunded"
          } else {
            data.manualReview = true
            data.reviewReason = "Event cancelled; manual refund requires organizer resolution"
            result.manualRefundRequired++
            result.refundReview++
            if (ledger) {
              ledger.set("manualReview", true)
              ledger.set("reviewReason", data.reviewReason)
              txApp.saveNoValidate(ledger)
            }
          }
          data.eventCancellation = { cancelledAt: now, cancelledBy: auth.id, reason: reason }
        }

        reg.set("paymentData", data)
        txApp.saveNoValidate(reg)
        result.cancelled++
        helpers.audit(txApp, {
          eventId: eventId,
          registrationId: reg.id,
          actorId: auth.id,
          action: "registration.event-cancelled",
          note: reason,
          before: before,
          after: helpers.registrationSnapshot(reg),
        })
      }

      require(__hooks + "/attendee-lifecycle-helpers.js").reconcileEventWaitlist(txApp, eventId, now)
      helpers.audit(txApp, {
        eventId: eventId,
        actorId: auth.id,
        action: "event.cancelled",
        note: reason,
        before: beforeEvent,
        after: helpers.eventPayload(currentEvent),
      })
    })
  } catch (err) {
    console.log("[admin-ops] event cancellation failed:", err)
    return e.json(500, { code: "EVENT_CANCELLATION_FAILED", error: "Could not cancel event safely" })
  }

  rh.recomputeEventCounters(eventId)
  return e.json(200, result)
}, $apis.requireAuth("users"))
