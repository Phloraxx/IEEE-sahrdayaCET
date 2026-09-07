/// <reference path="../pb_data/types.d.ts" />

function objectValue(value) {
  if (!value) return {}
  if (value && typeof value.string === "function") value = value.string()
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function snapshotSessions(value) {
  var raw = objectValue(value)
  return Array.isArray(raw.sessions) ? raw.sessions : []
}

function statusPayload(event) {
  var snapshot = objectValue(event.get("attendanceQualificationSnapshot"))
  var sessions = snapshotSessions(snapshot)
  return {
    locked: event.getBool("attendanceQualificationLocked"),
    version: event.getInt("attendanceQualificationVersion") || 0,
    lockedAt: event.getString("attendanceQualificationLockedAt") || "",
    lockedBy: event.getString("attendanceQualificationLockedBy") || "",
    requiredSessionCount: sessions.filter(function (row) { return row.requiredForCertificate === true }).length,
    sessionCount: sessions.length,
    snapshot: snapshot,
  }
}

function buildSnapshot(app, event, nextVersion, lockedAt) {
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var sessions = attendance.sessionsForEvent(app, event.id)
  if (!sessions.length) return { error: "Attendance qualification requires session attendance" }
  var rows = []
  var required = 0
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i]
    var enabled = session.getBool("attendanceEnabled")
    var requiredForCertificate = session.getBool("requiredForCertificate")
    if (requiredForCertificate && !enabled) {
      return { error: "Certificate-required sessions must have attendance tracking enabled" }
    }
    if (requiredForCertificate) required++
    rows.push({
      id: session.id,
      title: session.getString("title") || "",
      startsAt: session.getString("startsAt") || "",
      endsAt: session.getString("endsAt") || "",
      attendanceEnabled: enabled,
      requiredForCertificate: requiredForCertificate,
      attendanceWeight: session.getFloat("attendanceWeight") || 0,
    })
  }
  if (!required) return { error: "Mark at least one tracked session as required for certificates" }
  return {
    snapshot: {
      version: Number(nextVersion || 0),
      lockedAt: String(lockedAt || ""),
      rule: "all_required_sessions",
      sessions: rows,
    },
  }
}

function registrationQualification(app, event, registration) {
  var status = statusPayload(event)
  var sessions = snapshotSessions(status.snapshot)
  if (!status.locked || !sessions.length || !status.requiredSessionCount) {
    return {
      available: false,
      qualified: false,
      version: status.version,
      rule: "all_required_sessions",
      reason: "attendance_qualification_unlocked",
      requiredSessionCount: status.requiredSessionCount,
      requiredPresentCount: 0,
      totalWeight: 0,
      attendedWeight: 0,
      sessions: [],
    }
  }
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var details = []
  var requiredPresent = 0
  var totalWeight = 0
  var attendedWeight = 0
  for (var i = 0; i < sessions.length; i++) {
    var meta = sessions[i]
    if (meta.attendanceEnabled !== true) continue
    var state = attendance.registrationSessionState(app, String(meta.id || ""), registration.id)
    var weight = Number(meta.attendanceWeight || 0)
    totalWeight += weight
    if (state.present) attendedWeight += weight
    if (meta.requiredForCertificate === true && state.present) requiredPresent++
    details.push({
      id: String(meta.id || ""),
      title: String(meta.title || ""),
      requiredForCertificate: meta.requiredForCertificate === true,
      attendanceWeight: weight,
      present: state.present === true,
    })
  }
  var confirmed = registration.getString("registrationStatus") === "confirmed"
  var qualified = confirmed && requiredPresent === status.requiredSessionCount
  return {
    available: true,
    qualified: qualified,
    version: status.version,
    rule: "all_required_sessions",
    reason: qualified ? "qualified" : (confirmed ? "missing_required_attendance" : "registration_not_confirmed"),
    requiredSessionCount: status.requiredSessionCount,
    requiredPresentCount: requiredPresent,
    totalWeight: totalWeight,
    attendedWeight: attendedWeight,
    sessions: details,
  }
}

module.exports = {
  objectValue: objectValue,
  statusPayload: statusPayload,
  buildSnapshot: buildSnapshot,
  registrationQualification: registrationQualification,
}
