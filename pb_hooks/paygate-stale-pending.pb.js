/// <reference path="../pb_data/types.d.ts" />

// Fallback for the rare case where PayGate created a session but its expiry
// webhook is permanently missed and the attendee is no longer polling. The
// normal paygate-registration-expiry cron handles providerStatus=expired and
// not_initialized; this reconciler handles a locally stale providerStatus=pending.
//
// Re-read immediately before cancellation so a concurrent payment confirmation
// cannot be overwritten by a stale record captured at the start of the scan.
cronAdd("paygate-stale-pending-expiry", "* * * * *", function () {
  var pg = require(__hooks + "/paygate-helpers.js")
  var stale = require(__hooks + "/paygate-stale-pending-helpers.js")
  var config = pg.getConfig()
  var records = []

  try {
    records = $app.findRecordsByFilter(
      "registrations",
      "registrationStatus = {:registrationStatus} && paymentStatus = {:paymentStatus}",
      "registrationDate",
      0,
      0,
      { registrationStatus: "pending", paymentStatus: "pending" }
    )
  } catch (err) {
    console.log("[paygate] failed to scan stale pending registrations:", err)
    return
  }

  var nowMs = Date.now()
  for (var i = 0; i < records.length; i++) {
    var candidate = records[i]
    var candidateData = pg.asObject(candidate.get("paymentData"))
    if (!stale.shouldReleaseStalePending(
      candidate.getString("registrationStatus"),
      candidate.getString("paymentStatus"),
      candidateData,
      nowMs,
      config.registrationGraceSeconds
    )) continue

    try {
      // Re-read current state to avoid cancelling a registration that was paid
      // while this cron was iterating its initial snapshot.
      var registration = $app.findRecordById("registrations", candidate.id)
      var data = pg.asObject(registration.get("paymentData"))
      if (!stale.shouldReleaseStalePending(
        registration.getString("registrationStatus"),
        registration.getString("paymentStatus"),
        data,
        Date.now(),
        config.registrationGraceSeconds
      )) continue

      data.releaseReason = "PayGate payment remained pending beyond its expiry and the IEEE grace window elapsed"
      registration.set("paymentStatus", "failed")
      registration.set("registrationStatus", "cancelled")
      registration.set("paymentData", data)
      $app.save(registration)
    } catch (err) {
      console.log("[paygate] failed to release stale pending registration " + candidate.id + ":", err)
    }
  }
})
