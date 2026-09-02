/// <reference path="../pb_data/types.d.ts" />

var CREDITING_TYPES = ["present", "entry", "manual_add"]

function sessionsForEvent(app, eventId) {
  try {
    return app.findRecordsByFilter(
      "event_sessions",
      "event = {:eventId}",
      "sortOrder,startsAt,id",
      0,
      0,
      { eventId: String(eventId || "") }
    )
  } catch (_) { return [] }
}

function eventHasSessions(app, eventId) {
  try {
    return app.findRecordsByFilter(
      "event_sessions",
      "event = {:eventId}",
      "id",
      1,
      0,
      { eventId: String(eventId || "") }
    ).length > 0
  } catch (_) { return false }
}

function sessionRecord(app, sessionId) {
  try { return app.findRecordById("event_sessions", String(sessionId || "")) } catch (_) { return null }
}

function sessionPayload(app, session) {
  return {
    id: session.id,
    eventId: session.getString("event") || "",
    title: session.getString("title") || "",
    startsAt: session.getString("startsAt") || "",
    endsAt: session.getString("endsAt") || "",
    venue: session.getString("venue") || "",
    sortOrder: session.getInt("sortOrder") || 0,
    attendanceEnabled: session.getBool("attendanceEnabled"),
    checkInEnabled: session.getBool("checkInEnabled"),
    requiredForCertificate: session.getBool("requiredForCertificate"),
    attendanceWeight: session.getFloat("attendanceWeight") || 0,
    presentCount: presentCount(app, session.id),
  }
}

function attendanceRows(app, sessionId, registrationId) {
  var filter = "session = {:sessionId}"
  var params = { sessionId: String(sessionId || "") }
  if (registrationId) {
    filter += " && registration = {:registrationId}"
    params.registrationId = String(registrationId)
  }
  try {
    return app.findRecordsByFilter(
      "attendance_records",
      filter,
      "occurredAt,created,id",
      0,
      0,
      params
    )
  } catch (_) { return [] }
}

function nextCreditState(current, type) {
  if (CREDITING_TYPES.indexOf(String(type || "")) !== -1) return true
  if (type === "manual_remove") return false
  return !!current
}

function registrationSessionState(app, sessionId, registrationId) {
  var rows = attendanceRows(app, sessionId, registrationId)
  var present = false
  var lastAt = ""
  var lastType = ""
  for (var i = 0; i < rows.length; i++) {
    var type = rows[i].getString("type") || ""
    present = nextCreditState(present, type)
    lastAt = rows[i].getString("occurredAt") || lastAt
    lastType = type || lastType
  }
  return { present: present, lastAt: lastAt, lastType: lastType, recordCount: rows.length }
}

function presentCount(app, sessionId) {
  var rows = attendanceRows(app, sessionId, "")
  var states = {}
  for (var i = 0; i < rows.length; i++) {
    var registrationId = rows[i].getString("registration") || ""
    if (!registrationId) continue
    states[registrationId] = nextCreditState(states[registrationId] === true, rows[i].getString("type") || "")
  }
  var count = 0
  Object.keys(states).forEach(function (registrationId) {
    if (!states[registrationId]) return
    try {
      var registration = app.findRecordById("registrations", registrationId)
      if (registration.getString("registrationStatus") === "confirmed") count++
    } catch (_) {}
  })
  return count
}

function recentAttendance(app, sessionId, limit) {
  var rows = []
  try {
    rows = app.findRecordsByFilter(
      "attendance_records",
      "session = {:sessionId}",
      "-occurredAt,-created,-id",
      Math.max(1, Math.min(50, Number(limit || 20))),
      0,
      { sessionId: String(sessionId || "") }
    )
  } catch (_) { rows = [] }
  var stateCache = {}
  var seenRegistration = {}
  return rows.map(function (row) {
    var registrationId = row.getString("registration") || ""
    var name = ""
    var ticketId = ""
    try {
      var registration = app.findRecordById("registrations", registrationId)
      name = registration.getString("userName") || ""
      ticketId = registration.getString("ticketId") || ""
    } catch (_) {}
    if (stateCache[registrationId] === undefined) {
      stateCache[registrationId] = registrationSessionState(app, sessionId, registrationId).present
    }
    var isLatestForRegistration = !seenRegistration[registrationId]
    seenRegistration[registrationId] = true
    return {
      id: row.id,
      registrationId: registrationId,
      userName: name,
      ticketId: ticketId,
      type: row.getString("type") || "",
      occurredAt: row.getString("occurredAt") || "",
      source: row.getString("source") || "",
      present: stateCache[registrationId] === true,
      isLatestForRegistration: isLatestForRegistration,
    }
  })
}

function idempotencyRecord(app, key) {
  key = String(key || "").trim()
  if (!key) return null
  try {
    return app.findFirstRecordByFilter(
      "attendance_records",
      "idempotencyKey = {:key}",
      { key: key }
    )
  } catch (_) { return null }
}

function applyLegacyArrivalProjection(app, registration) {
  if (!registration || registration.getBool("checkedIn")) return false
  registration.set("checkedIn", true)
  app.saveNoValidate(registration)
  return true
}

module.exports = {
  CREDITING_TYPES: CREDITING_TYPES,
  sessionsForEvent: sessionsForEvent,
  eventHasSessions: eventHasSessions,
  sessionRecord: sessionRecord,
  sessionPayload: sessionPayload,
  nextCreditState: nextCreditState,
  registrationSessionState: registrationSessionState,
  presentCount: presentCount,
  recentAttendance: recentAttendance,
  idempotencyRecord: idempotencyRecord,
  applyLegacyArrivalProjection: applyLegacyArrivalProjection,
}
