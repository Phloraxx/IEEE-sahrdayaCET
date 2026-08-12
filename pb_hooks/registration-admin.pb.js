/// <reference path="../pb_data/types.d.ts" />

// Privileged registration commands live here instead of relying on several
// independent collection PATCHes. A manual payment confirmation must move the
// payment and registration state together, mint exactly one ticket, retain an
// audit trail, and let the existing notification outbox queue both emails.

routerAdd(
  "POST",
  "/api/admin/registrations/{id}/confirm-payment",
  function (e) {
    var auth = e.auth
    if (!auth || auth.getString("role") !== "admin") {
      return e.json(403, { code: "FORBIDDEN", error: "Only admins can confirm payments" })
    }

    var id = e.request.pathValue("id") || ""
    var result = null
    var failure = null

    try {
      $app.runInTransaction(function (txApp) {
        var registration
        try {
          registration = txApp.findRecordById("registrations", id)
        } catch (_) {
          failure = { status: 404, code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }
          return
        }

        var registrationStatus = registration.getString("registrationStatus")
        var paymentStatus = registration.getString("paymentStatus")
        var amount = registration.getInt("amount") || 0

        if (registrationStatus === "confirmed" && paymentStatus === "paid") {
          result = {
            success: true,
            alreadyConfirmed: true,
            registrationId: registration.id,
            registrationStatus: registrationStatus,
            paymentStatus: paymentStatus,
            ticketId: registration.getString("ticketId") || "",
          }
          return
        }

        if (registrationStatus === "cancelled") {
          failure = {
            status: 409,
            code: "CANCELLED_REGISTRATION",
            error: "A cancelled registration cannot be manually confirmed",
          }
          return
        }

        if (registrationStatus !== "pending" || paymentStatus !== "pending" || amount <= 0) {
          failure = {
            status: 409,
            code: "PAYMENT_NOT_PENDING",
            error: "This registration is not awaiting a paid confirmation",
          }
          return
        }

        var pg = require(__hooks + "/paygate-helpers.js")
        var rh = require(__hooks + "/registration-helpers.js")
        var paymentData = pg.asObject(registration.get("paymentData"))
        var confirmedAt = new Date().toISOString()

        // Keep the provider status as provider-reported truth. The separate
        // manualConfirmation object records the human override without making a
        // pending PayGate payment appear to have been verified by PayGate.
        paymentData.manualConfirmation = {
          confirmedAt: confirmedAt,
          confirmedBy: auth.id,
          source: "admin",
          providerStatusAtConfirmation: String(paymentData.providerStatus || ""),
        }
        if (!paymentData.paidAt) paymentData.paidAt = confirmedAt

        registration.set("registrationStatus", "confirmed")
        registration.set("paymentStatus", "paid")
        registration.set("paymentData", paymentData)
        if (!registration.getString("ticketId")) {
          registration.set("ticketId", rh.generateTicketId())
        }
        txApp.saveNoValidate(registration)

        result = {
          success: true,
          alreadyConfirmed: false,
          registrationId: registration.id,
          registrationStatus: "confirmed",
          paymentStatus: "paid",
          ticketId: registration.getString("ticketId"),
        }
      })
    } catch (err) {
      console.log("[payment] manual confirmation failed for " + id + ":", err)
      return e.json(500, { code: "MANUAL_CONFIRMATION_FAILED", error: "Payment confirmation failed" })
    }

    if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })

    // The after-update hook normally creates these idempotent outbox rows. Run
    // the same helper once more after commit as a recovery guard; the unique
    // dedupe key means this can never create duplicate emails.
    try {
      var saved = $app.findRecordById("registrations", id)
      require(__hooks + "/notification-helpers.js").enqueueForRegistration(saved)
    } catch (notifyErr) {
      console.log("[mail] failed to queue manually confirmed registration " + id + ":", notifyErr)
    }

    console.log("[payment] registration " + id + " manually confirmed by admin " + auth.id)
    return e.json(200, result)
  },
  $apis.requireAuth("users")
)
