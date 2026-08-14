/// <reference path="../pb_data/types.d.ts" />

function paymentConfirmationDisposition(registration, app) {
  var store = app || $app
  if (!registration) return { blocked: true, reason: "Payment arrived for an unavailable registration" }
  if (registration.getString("registrationStatus") === "cancelled") {
    return { blocked: true, reason: "Payment was captured after the registration seat was released" }
  }

  var eventId = registration.getString("event") || ""
  if (!eventId) return { blocked: true, reason: "Payment arrived for a registration with no event" }
  var event
  try { event = store.findRecordById("events", eventId) }
  catch (_) { return { blocked: true, reason: "Payment arrived after the event became unavailable" } }
  if (event.getBool("isDeleted")) return { blocked: true, reason: "Payment arrived after the event was archived" }
  if (event.getString("status") === "cancelled") return { blocked: true, reason: "Payment arrived after the event was cancelled" }
  return { blocked: false, reason: "" }
}

module.exports = { paymentConfirmationDisposition: paymentConfirmationDisposition }
