/// <reference path="../pb_data/types.d.ts" />

function findDetails(app, eventId) {
  try {
    return app.findFirstRecordByFilter(
      "event_private_details",
      "event = {:eventId}",
      { eventId: eventId }
    )
  } catch (_) { return null }
}

function attendanceMode(event) {
  var mode = event.getString("attendanceMode") || ""
  if (mode === "onsite" || mode === "online" || mode === "hybrid") return mode
  var venue = String(event.getString("venue") || "").toLowerCase()
  if (/\b(hybrid|mixed mode|online and offline)\b/.test(venue)) return "hybrid"
  if (/\b(online|virtual|google meet|zoom|microsoft teams|webex|meet\.google\.com)\b/.test(venue)) return "online"
  return "onsite"
}

function safeHttpUrl(value) {
  var text = String(value || "").trim()
  if (!text) return ""
  if (!/^https?:\/\//i.test(text)) throw new Error("INVALID_JOIN_URL")
  return text
}

function privateSummary(record) {
  return {
    hasJoinUrl: Boolean(record && record.getString("virtualJoinUrl")),
    hasJoinInstructions: Boolean(record && record.getString("joinInstructions")),
  }
}

function responsePayload(record) {
  return {
    virtualJoinUrl: record ? record.getString("virtualJoinUrl") || "" : "",
    joinInstructions: record ? record.getString("joinInstructions") || "" : "",
  }
}

function confirmedRegistration(app, userId, eventId) {
  try {
    return app.findFirstRecordByFilter(
      "registrations",
      "user = {:userId} && event = {:eventId} && registrationStatus = {:confirmed}",
      { userId: userId, eventId: eventId, confirmed: "confirmed" }
    )
  } catch (_) { return null }
}

module.exports = {
  findDetails: findDetails,
  attendanceMode: attendanceMode,
  safeHttpUrl: safeHttpUrl,
  privateSummary: privateSummary,
  responsePayload: responsePayload,
  confirmedRegistration: confirmedRegistration,
}
