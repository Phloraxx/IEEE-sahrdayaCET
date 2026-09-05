/// <reference path="../pb_data/types.d.ts" />

function activeRegistrationEventState(app, registration) {
  if (!registration || registration.getString("registrationStatus") === "cancelled") {
    return { ok: true }
  }
  var eventId = registration.getString("event") || ""
  if (!eventId) return { ok: true }
  var event
  try { event = app.findRecordById("events", eventId) }
  catch (_) { return { ok: false, message: "Event not found" } }
  if (event.getBool("isDeleted") || event.getString("status") === "cancelled") {
    return { ok: false, message: "Cancelled or archived events cannot receive active registrations" }
  }
  return { ok: true }
}

module.exports = {
  activeRegistrationEventState: activeRegistrationEventState,
}
