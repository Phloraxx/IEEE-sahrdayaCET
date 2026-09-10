/// <reference path="../pb_data/types.d.ts" />

function publishError(event) {
  if (!event.getString("title") || !event.getString("date") || !event.getString("society")) {
    return { code: "EVENT_INCOMPLETE", message: "Title, date and host society are required before publishing" }
  }
  if (event.getString("attendanceMode") !== "online" && !event.getString("venue")) {
    return { code: "EVENT_INCOMPLETE", message: "A venue is required before publishing an onsite or hybrid event" }
  }
  var registrationStart = Date.parse(event.getString("registrationStart") || "")
  var registrationDeadline = Date.parse(event.getString("registrationDeadline") || "")
  if (isFinite(registrationStart) && isFinite(registrationDeadline) && registrationStart >= registrationDeadline) {
    return { code: "INVALID_REGISTRATION_WINDOW", message: "Registration start must be before the deadline" }
  }
  if (event.getString("registrationMode") === "external" && !event.getString("externalFormUrl")) {
    return { code: "EXTERNAL_FORM_REQUIRED", message: "External registration requires a form URL" }
  }
  return null
}

module.exports = { publishError: publishError }
