/// <reference path="../pb_data/types.d.ts" />

// Terminal event states must not gain new active registrations. Completed events
// remain correctable for historical attendance/certificate workflows, but a
// cancelled or archived event cannot create or restore an active seat.
onRecordCreate(function (e) {
  var helper = require(__hooks + "/registration-event-state-helpers.js")
  var decision = helper.activeRegistrationEventState($app, e.record)
  if (!decision.ok) throw new BadRequestError(decision.message)
  e.next()
}, "registrations")

onRecordUpdate(function (e) {
  var oldRecord = e.record.original()
  var oldStatus = oldRecord.getString("registrationStatus") || ""
  var newStatus = e.record.getString("registrationStatus") || ""
  if (oldStatus === "cancelled" && newStatus !== "cancelled") {
    var helper = require(__hooks + "/registration-event-state-helpers.js")
    var decision = helper.activeRegistrationEventState($app, e.record)
    if (!decision.ok) throw new BadRequestError(decision.message)
  }
  e.next()
}, "registrations")
