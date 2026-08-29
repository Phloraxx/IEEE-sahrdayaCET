/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess(function (e) {
  try {
    require(__hooks + "/notification-helpers.js").enqueueForRegistration(e.record)
  } catch (err) {
    console.log("[mail] failed to queue registration email:", err)
  }
  e.next()
}, "registrations")

onRecordAfterUpdateSuccess(function (e) {
  try {
    require(__hooks + "/notification-helpers.js").enqueueForRegistration(e.record)
  } catch (err) {
    console.log("[mail] failed to queue registration notification:", err)
  }
  e.next()
}, "registrations")

cronAdd("registration-notification-outbox", "* * * * *", function () {
  var nh = require(__hooks + "/notification-helpers.js")
  var records = []
  try {
    records = $app.findRecordsByFilter(
      "notification_outbox",
      "status = {:pending} || status = {:failed} || status = {:sending}",
      "",
      50,
      0,
      { pending: "pending", failed: "failed", sending: "sending" }
    )
  } catch (err) {
    console.log("[mail] outbox scan failed:", err)
    return
  }

  var now = Date.now()
  for (var i = 0; i < records.length; i++) {
    var record = records[i]
    var status = record.getString("status")
    var attempts = record.getInt("attempts") || 0
    if (status === "sending") {
      var lockedAt = Date.parse(record.getString("lastAttemptAt") || "")
      if (isFinite(lockedAt) && now - lockedAt < 10 * 60 * 1000) continue
    }
    if (status === "failed") {
      var retryAt = Date.parse(record.getString("nextAttemptAt") || "")
      if (isFinite(retryAt) && retryAt > now) continue
      if (attempts >= 8) continue
    }

    var claimed = false
    try {
      $app.runInTransaction(function (txApp) {
        var live = txApp.findRecordById("notification_outbox", record.id)
        var liveStatus = live.getString("status")
        var liveAttempts = live.getInt("attempts") || 0
        var liveNow = Date.now()
        if (liveStatus === "sent") return
        if (liveStatus === "sending") {
          var liveLockedAt = Date.parse(live.getString("lastAttemptAt") || "")
          if (isFinite(liveLockedAt) && liveNow - liveLockedAt < 10 * 60 * 1000) return
        }
        if (liveStatus === "failed") {
          var liveRetryAt = Date.parse(live.getString("nextAttemptAt") || "")
          if (isFinite(liveRetryAt) && liveRetryAt > liveNow) return
          if (liveAttempts >= 8) return
        }
        live.set("status", "sending")
        live.set("attempts", liveAttempts + 1)
        live.set("lastAttemptAt", new Date().toISOString())
        live.set("lastError", "")
        txApp.save(live)
        claimed = true
      })
      if (!claimed) continue

      record = $app.findRecordById("notification_outbox", record.id)
      nh.sendOutbox(record)

      record.set("status", "sent")
      record.set("sentAt", new Date().toISOString())
      record.set("nextAttemptAt", "")
      record.set("lastError", "")
      $app.saveNoValidate(record)
      try { require(__hooks + "/certificate-delivery-helpers.js").reconcileForOutbox($app, record) } catch (reconcileErr) {
        console.log("[mail] failed to reconcile certificate delivery after send:", reconcileErr)
      }
    } catch (err) {
      try {
        record.set("status", "failed")
        if (err && err.mailDeliveryPermanent === true) {
          record.set("attempts", 8)
          record.set("nextAttemptAt", "")
        } else {
          record.set("nextAttemptAt", nh.nextRetryIso(record.getInt("attempts") || 1))
        }
        record.set("lastError", String(err && err.message ? err.message : err).slice(0, 3900))
        $app.saveNoValidate(record)
        try { require(__hooks + "/certificate-delivery-helpers.js").reconcileForOutbox($app, record) } catch (reconcileErr) {
          console.log("[mail] failed to reconcile certificate delivery after failure:", reconcileErr)
        }
      } catch (persistErr) {
        console.log("[mail] failed to persist notification failure state for " + record.id + ":", persistErr)
      }
      console.log("[mail] notification send failed for " + record.id + ":", err)
    }
  }
})

routerAdd(
  "GET",
  "/api/app/registrations/{id}/receipt",
  function (e) {
    var id = e.request.pathValue("id") || ""
    var registration
    try { registration = $app.findRecordById("registrations", id) }
    catch (_) { return e.json(404, { error: "Registration not found" }) }

    var auth = e.auth
    var isAdmin = auth && auth.getString("role") === "admin"
    if (!auth || (registration.getString("user") !== auth.id && !isAdmin)) {
      return e.json(403, { error: "You cannot access this receipt" })
    }
    if ((registration.getString("paymentStatus") !== "paid" && registration.getString("paymentStatus") !== "refunded") || require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) <= 0 || !registration.getString("ticketId")) {
      return e.json(404, { error: "A paid receipt is not available for this registration" })
    }

    var nh = require(__hooks + "/notification-helpers.js")
    var event = nh.getEvent(registration)
    e.response.header().set("Content-Disposition", 'attachment; filename="Receipt_' + String(registration.id).toUpperCase() + '.pdf"')
    return e.blob(200, "application/pdf", nh.receiptPdfBytes(registration, event))
  },
  $apis.requireAuth("users")
)

routerAdd(
  "GET",
  "/api/admin/registrations/{id}/notifications",
  function (e) {
    var id = e.request.pathValue("id") || ""
    var registration
    try { registration = $app.findRecordById("registrations", id) }
    catch (_) { return e.json(404, { error: "Registration not found" }) }
    var nh = require(__hooks + "/notification-helpers.js")
    if (!nh.canManageRegistration(e.auth, registration)) return e.json(403, { error: "Forbidden" })
    return e.json(200, {
      ticketAvailable: registration.getString("registrationStatus") === "confirmed" && !!registration.getString("ticketId"),
      receiptAvailable: (registration.getString("paymentStatus") === "paid" || registration.getString("paymentStatus") === "refunded") && require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) > 0 && !!registration.getString("ticketId"),
      notifications: nh.snapshot(registration.id),
    })
  },
  $apis.requireAuth("users")
)

routerAdd(
  "POST",
  "/api/admin/registrations/{id}/notifications/{kind}/resend",
  function (e) {
    var id = e.request.pathValue("id") || ""
    var kind = e.request.pathValue("kind") || ""
    if (kind !== "ticket" && kind !== "receipt") return e.json(400, { error: "Invalid notification kind" })
    var registration
    try { registration = $app.findRecordById("registrations", id) }
    catch (_) { return e.json(404, { error: "Registration not found" }) }
    var nh = require(__hooks + "/notification-helpers.js")
    if (!nh.canManageRegistration(e.auth, registration)) return e.json(403, { error: "Forbidden" })
    var queued = nh.enqueue(registration, kind, true)
    if (!queued) return e.json(409, { error: kind === "receipt" ? "Paid receipt is not available" : "Ticket is not available" })
    return e.json(202, { success: true, status: queued.getString("status") || "pending" })
  },
  $apis.requireAuth("users")
)
