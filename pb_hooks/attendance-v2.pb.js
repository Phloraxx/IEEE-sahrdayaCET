/// <reference path="../pb_data/types.d.ts" />

// Attendance V2 is command-owned state. Raw collection CRUD stays closed by
// schema rules; corrections are append-only records rather than mutations.
onRecordUpdateRequest(function (e) {
  throw new BadRequestError("Attendance records are append-only")
}, "attendance_records")

onRecordDeleteRequest(function (e) {
  throw new BadRequestError("Attendance records are append-only")
}, "attendance_records")

routerAdd("GET", "/api/app/events/{id}/attendance/sessions", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.view", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot view attendance for this event" })
  }
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var sessions = attendance.sessionsForEvent($app, eventId).map(function (session) {
    return attendance.sessionPayload($app, session)
  })
  return e.json(200, { mode: sessions.length ? "sessions" : "legacy", sessions: sessions })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{id}/attendance/sessions", function (e) {
  var eventId = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "Event edit permission is required to manage attendance sessions" })
  }
  var body = authz.requestBody(e)
  var title = String(body.title || "").trim().slice(0, 180)
  var startsAt = String(body.startsAt || "").trim()
  var endsAt = String(body.endsAt || "").trim()
  if (!title) return e.json(400, { code: "TITLE_REQUIRED", error: "Session title is required" })
  if (!startsAt || !isFinite(Date.parse(startsAt))) return e.json(400, { code: "START_REQUIRED", error: "A valid session start time is required" })
  if (endsAt && (!isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt))) {
    return e.json(400, { code: "INVALID_END", error: "Session end must be after its start" })
  }
  var weight = body.attendanceWeight === undefined ? 1 : Number(body.attendanceWeight)
  if (!isFinite(weight) || weight < 0 || weight > 100) return e.json(400, { code: "INVALID_WEIGHT", error: "Attendance weight must be between 0 and 100" })
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var existing = attendance.sessionsForEvent($app, eventId)
  var sortOrder = body.sortOrder === undefined ? existing.length * 10 : Math.max(0, Number(body.sortOrder) || 0)
  var payload = null
  try {
    $app.runInTransaction(function (txApp) {
      var collection = txApp.findCollectionByNameOrId("event_sessions")
      var record = new Record(collection, {
        event: eventId,
        title: title,
        startsAt: startsAt,
        endsAt: endsAt,
        venue: String(body.venue || "").trim().slice(0, 250),
        sortOrder: sortOrder,
        attendanceEnabled: body.attendanceEnabled !== false,
        checkInEnabled: body.checkInEnabled !== false,
        requiredForCertificate: body.requiredForCertificate === true,
        attendanceWeight: weight,
        createdBy: e.auth.id,
      })
      txApp.save(record)
      payload = attendance.sessionPayload(txApp, record)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        actorId: e.auth.id,
        action: "attendance.session.created",
        entityType: "event_session",
        entityId: record.id,
        before: null,
        after: payload,
      })
    })
  } catch (err) {
    return e.json(400, { code: "SESSION_CREATE_FAILED", error: err.message || "Could not create attendance session" })
  }
  return e.json(201, { session: payload })
}, $apis.requireAuth("users"))

routerAdd("PUT", "/api/app/event-sessions/{id}", function (e) {
  var sessionId = e.request.pathValue("id") || ""
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var session = attendance.sessionRecord($app, sessionId)
  if (!session) return e.json(404, { code: "SESSION_NOT_FOUND", error: "Attendance session not found" })
  var event
  try { event = $app.findRecordById("events", session.getString("event") || "") }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "Event edit permission is required to manage attendance sessions" })
  }
  var body = authz.requestBody(e)
  var title = body.title === undefined ? session.getString("title") : String(body.title || "").trim().slice(0, 180)
  var startsAt = body.startsAt === undefined ? session.getString("startsAt") : String(body.startsAt || "").trim()
  var endsAt = body.endsAt === undefined ? session.getString("endsAt") : String(body.endsAt || "").trim()
  if (!title) return e.json(400, { code: "TITLE_REQUIRED", error: "Session title is required" })
  if (!startsAt || !isFinite(Date.parse(startsAt))) return e.json(400, { code: "START_REQUIRED", error: "A valid session start time is required" })
  if (endsAt && (!isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt))) {
    return e.json(400, { code: "INVALID_END", error: "Session end must be after its start" })
  }
  var weight = body.attendanceWeight === undefined ? session.getFloat("attendanceWeight") : Number(body.attendanceWeight)
  if (!isFinite(weight) || weight < 0 || weight > 100) return e.json(400, { code: "INVALID_WEIGHT", error: "Attendance weight must be between 0 and 100" })
  var after = null
  try {
    $app.runInTransaction(function (txApp) {
      var current = txApp.findRecordById("event_sessions", sessionId)
      var before = attendance.sessionPayload(txApp, current)
      current.set("title", title)
      current.set("startsAt", startsAt)
      current.set("endsAt", endsAt)
      if (body.venue !== undefined) current.set("venue", String(body.venue || "").trim().slice(0, 250))
      if (body.sortOrder !== undefined) current.set("sortOrder", Math.max(0, Number(body.sortOrder) || 0))
      if (body.attendanceEnabled !== undefined) current.set("attendanceEnabled", body.attendanceEnabled === true)
      if (body.checkInEnabled !== undefined) current.set("checkInEnabled", body.checkInEnabled === true)
      if (body.requiredForCertificate !== undefined) current.set("requiredForCertificate", body.requiredForCertificate === true)
      current.set("attendanceWeight", weight)
      txApp.save(current)
      after = attendance.sessionPayload(txApp, current)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: event.id,
        actorId: e.auth.id,
        action: "attendance.session.updated",
        entityType: "event_session",
        entityId: current.id,
        before: before,
        after: after,
      })
    })
  } catch (err) {
    return e.json(400, { code: "SESSION_UPDATE_FAILED", error: err.message || "Could not update attendance session" })
  }
  return e.json(200, { session: after })
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/app/event-sessions/{id}", function (e) {
  var sessionId = e.request.pathValue("id") || ""
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var session = attendance.sessionRecord($app, sessionId)
  if (!session) return e.json(404, { code: "SESSION_NOT_FOUND", error: "Attendance session not found" })
  var event
  try { event = $app.findRecordById("events", session.getString("event") || "") }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "events.edit", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "Event edit permission is required to manage attendance sessions" })
  }
  var deleteFailure = null
  try {
    $app.runInTransaction(function (txApp) {
      var current = txApp.findRecordById("event_sessions", sessionId)
      var used = []
      try { used = txApp.findRecordsByFilter("attendance_records", "session = {:session}", "id", 1, 0, { session: current.id }) } catch (_) {}
      if (used.length) {
        deleteFailure = { status: 409, code: "SESSION_HAS_ATTENDANCE", error: "A session with attendance history cannot be deleted" }
        return
      }
      var before = attendance.sessionPayload(txApp, current)
      txApp.delete(current)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: event.id,
        actorId: e.auth.id,
        action: "attendance.session.deleted",
        entityType: "event_session",
        entityId: sessionId,
        before: before,
        after: null,
      })
    })
  } catch (err) {
    return e.json(400, { code: "SESSION_DELETE_FAILED", error: err.message || "Could not delete attendance session" })
  }
  if (deleteFailure) return e.json(deleteFailure.status, { code: deleteFailure.code, error: deleteFailure.error })
  return e.json(200, { deleted: true })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/workspace/attendance/context", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var events = []
  var rows = []
  try { rows = $app.findRecordsByFilter("events", "isDeleted = false", "date,id", 0, 0) } catch (_) { rows = [] }
  for (var i = 0; i < rows.length; i++) {
    var event = rows[i]
    if (!authz.hasEventCapability($app, e.auth, "checkin.manage", event)) continue
    var sessions = attendance.sessionsForEvent($app, event.id).map(function (session) {
      return attendance.sessionPayload($app, session)
    })
    events.push({
      id: event.id,
      title: event.getString("title") || "",
      date: event.getString("date") || "",
      endDate: event.getString("endDate") || "",
      venue: event.getString("venue") || "",
      status: event.getString("status") || "",
      checkInEnabled: event.getBool("checkInEnabled"),
      checkedInCount: event.getInt("checkedInCount") || 0,
      mode: sessions.length ? "sessions" : "legacy",
      sessions: sessions,
    })
  }
  return e.json(200, { events: events })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/workspace/attendance/sessions/{id}/state", function (e) {
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var session = attendance.sessionRecord($app, e.request.pathValue("id") || "")
  if (!session) return e.json(404, { code: "SESSION_NOT_FOUND", error: "Attendance session not found" })
  var event
  try { event = $app.findRecordById("events", session.getString("event") || "") }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "checkin.manage", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You are not assigned to check in this event" })
  }
  return e.json(200, {
    session: attendance.sessionPayload($app, session),
    recent: attendance.recentAttendance($app, session.id, 20),
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/attendance/check-in", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var body = authz.requestBody(e)
  var ticketId = String(body.ticketId || "").trim()
  var eventId = String(body.eventId || "").trim()
  var sessionId = String(body.sessionId || "").trim()
  var idempotencyKey = String(body.idempotencyKey || "").trim().slice(0, 180)
  var deviceId = String(body.deviceId || "").trim().slice(0, 180)
  if (!ticketId) return e.json(400, { code: "TICKET_REQUIRED", error: "Ticket ID is required" })
  if (!eventId) return e.json(400, { code: "EVENT_REQUIRED", error: "Select an event before scanning" })
  if (!idempotencyKey) return e.json(400, { code: "IDEMPOTENCY_REQUIRED", error: "A scan request identifier is required" })
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  if (!authz.hasEventCapability($app, e.auth, "checkin.manage", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You are not assigned to check in this event" })
  }
  var registration
  try { registration = $app.findFirstRecordByFilter("registrations", "ticketId = {:ticket}", { ticket: ticketId }) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (registration.getString("event") !== eventId) return e.json(409, { code: "WRONG_EVENT", error: "This ticket belongs to a different event" })
  if (event.getString("status") !== "published") return e.json(409, { code: "CHECKIN_NOT_ACTIVE", error: "Check-in is only available while the event is published" })
  if (!event.getBool("checkInEnabled")) return e.json(409, { code: "CHECKIN_DISABLED", error: "Check-in is not enabled for this event" })
  if (registration.getString("registrationStatus") !== "confirmed") return e.json(409, { code: "NOT_CONFIRMED", error: "Registration is not confirmed" })
  if (!attendance.eventHasSessions($app, eventId)) return e.json(409, { code: "LEGACY_EVENT", error: "This event uses the legacy single check-in flow" })
  if (!sessionId) return e.json(400, { code: "SESSION_REQUIRED", error: "Select an attendance session before scanning" })
  var session = attendance.sessionRecord($app, sessionId)
  if (!session || session.getString("event") !== eventId) return e.json(409, { code: "WRONG_SESSION", error: "The selected session does not belong to this event" })
  if (!session.getBool("attendanceEnabled")) return e.json(409, { code: "ATTENDANCE_DISABLED", error: "Attendance is disabled for this session" })
  if (!session.getBool("checkInEnabled")) return e.json(409, { code: "SESSION_CHECKIN_DISABLED", error: "Check-in is disabled for this session" })

  var result = null
  var failure = null
  try {
    $app.runInTransaction(function (txApp) {
      var reg = txApp.findRecordById("registrations", registration.id)
      var currentSession = txApp.findRecordById("event_sessions", sessionId)
      var replay = attendance.idempotencyRecord(txApp, idempotencyKey)
      if (replay) {
        if (replay.getString("registration") !== reg.id || replay.getString("session") !== currentSession.id) {
          failure = { status: 409, code: "IDEMPOTENCY_CONFLICT", error: "This scan request identifier was already used" }
          return
        }
        result = {
          replayed: true,
          recordId: replay.id,
          occurredAt: replay.getString("occurredAt") || "",
          registration: reg,
          session: currentSession,
        }
        return
      }
      var currentEvent = txApp.findRecordById("events", eventId)
      if (currentEvent.getString("status") !== "published") {
        failure = { status: 409, code: "CHECKIN_NOT_ACTIVE", error: "Check-in is only available while the event is published" }
        return
      }
      if (!currentEvent.getBool("checkInEnabled")) {
        failure = { status: 409, code: "CHECKIN_DISABLED", error: "Check-in is not enabled for this event" }
        return
      }
      if (reg.getString("registrationStatus") !== "confirmed") {
        failure = { status: 409, code: "NOT_CONFIRMED", error: "Registration is not confirmed" }
        return
      }
      if (!currentSession.getBool("attendanceEnabled")) {
        failure = { status: 409, code: "ATTENDANCE_DISABLED", error: "Attendance is disabled for this session" }
        return
      }
      if (!currentSession.getBool("checkInEnabled")) {
        failure = { status: 409, code: "SESSION_CHECKIN_DISABLED", error: "Check-in is disabled for this session" }
        return
      }
      var state = attendance.registrationSessionState(txApp, currentSession.id, reg.id)
      if (state.present) {
        failure = { status: 409, code: "ALREADY_PRESENT", error: "Attendee is already present for this session" }
        return
      }
      var occurredAt = new Date().toISOString()
      var record = new Record(txApp.findCollectionByNameOrId("attendance_records"), {
        event: eventId,
        session: currentSession.id,
        registration: reg.id,
        type: "present",
        occurredAt: occurredAt,
        operator: e.auth.id,
        source: "scanner",
        deviceId: deviceId,
        idempotencyKey: idempotencyKey,
        note: "",
      })
      txApp.save(record)
      attendance.applyLegacyArrivalProjection(txApp, reg)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        registrationId: reg.id,
        actorId: e.auth.id,
        action: "attendance.present",
        entityType: "attendance_record",
        entityId: record.id,
        before: { sessionId: currentSession.id, present: false },
        after: { sessionId: currentSession.id, present: true, occurredAt: occurredAt },
      })
      result = { replayed: false, recordId: record.id, occurredAt: occurredAt, registration: reg, session: currentSession }
    })
  } catch (err) {
    console.log("[attendance-v2] check-in failed:", err)
    return e.json(500, { code: "ATTENDANCE_WRITE_FAILED", error: "Could not record attendance" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })
  require(__hooks + "/registration-helpers.js").recomputeEventCounters(eventId)
  var regResult = result.registration
  return e.json(200, {
    success: true,
    replayed: result.replayed,
    message: result.replayed ? "Scan already recorded" : "Attendance recorded",
    registration: {
      id: regResult.id,
      userName: regResult.getString("userName") || "",
      ticketId: regResult.getString("ticketId") || "",
      eventId: eventId,
      eventTitle: event.getString("title") || "",
      sessionId: result.session.id,
      sessionTitle: result.session.getString("title") || "",
      occurredAt: result.occurredAt,
    },
    presentCount: attendance.presentCount($app, result.session.id),
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/attendance/correct", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var attendance = require(__hooks + "/attendance-v2-helpers.js")
  var body = authz.requestBody(e)
  var registrationId = String(body.registrationId || "").trim()
  var sessionId = String(body.sessionId || "").trim()
  var action = String(body.action || "").trim()
  var note = String(body.note || "").trim().slice(0, 2000)
  if (action !== "manual_add" && action !== "manual_remove") return e.json(400, { code: "INVALID_ACTION", error: "Choose manual_add or manual_remove" })
  if (!note) return e.json(400, { code: "NOTE_REQUIRED", error: "A correction reason is required" })
  var session = attendance.sessionRecord($app, sessionId)
  if (!session) return e.json(404, { code: "SESSION_NOT_FOUND", error: "Attendance session not found" })
  var eventId = session.getString("event") || ""
  var event
  try { event = $app.findRecordById("events", eventId) }
  catch (_) { return e.json(404, { code: "EVENT_NOT_FOUND", error: "Event not found" }) }
  if (!authz.hasEventCapability($app, e.auth, "checkin.manage", event)) {
    return e.json(403, { code: "FORBIDDEN", error: "You are not assigned to correct attendance for this event" })
  }
  var registration
  try { registration = $app.findRecordById("registrations", registrationId) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (registration.getString("event") !== eventId) return e.json(409, { code: "WRONG_EVENT", error: "Registration and session belong to different events" })
  if (registration.getString("registrationStatus") !== "confirmed") return e.json(409, { code: "NOT_CONFIRMED", error: "Only confirmed registrations can receive attendance credit" })
  var failure = null
  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var currentSession = txApp.findRecordById("event_sessions", sessionId)
      var currentRegistration = txApp.findRecordById("registrations", registrationId)
      if (currentRegistration.getString("registrationStatus") !== "confirmed") {
        failure = { status: 409, code: "NOT_CONFIRMED", error: "Only confirmed registrations can receive attendance credit" }
        return
      }
      var state = attendance.registrationSessionState(txApp, currentSession.id, currentRegistration.id)
      if (action === "manual_add" && state.present) {
        failure = { status: 409, code: "ALREADY_PRESENT", error: "Attendee is already present for this session" }
        return
      }
      if (action === "manual_remove" && !state.present) {
        failure = { status: 409, code: "NOT_PRESENT", error: "Attendee is not currently present for this session" }
        return
      }
      var occurredAt = new Date().toISOString()
      var record = new Record(txApp.findCollectionByNameOrId("attendance_records"), {
        event: eventId,
        session: currentSession.id,
        registration: currentRegistration.id,
        type: action,
        occurredAt: occurredAt,
        operator: e.auth.id,
        source: "manual",
        deviceId: String(body.deviceId || "").trim().slice(0, 180),
        idempotencyKey: "",
        note: note,
      })
      txApp.save(record)
      if (action === "manual_add") attendance.applyLegacyArrivalProjection(txApp, currentRegistration)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        registrationId: currentRegistration.id,
        actorId: e.auth.id,
        action: "attendance." + action,
        note: note,
        entityType: "attendance_record",
        entityId: record.id,
        before: { sessionId: currentSession.id, present: state.present },
        after: { sessionId: currentSession.id, present: action === "manual_add", occurredAt: occurredAt },
      })
      result = { recordId: record.id, occurredAt: occurredAt }
    })
  } catch (err) {
    console.log("[attendance-v2] correction failed:", err)
    return e.json(500, { code: "ATTENDANCE_WRITE_FAILED", error: "Could not record attendance correction" })
  }
  if (failure) return e.json(failure.status, { code: failure.code, error: failure.error })
  require(__hooks + "/registration-helpers.js").recomputeEventCounters(eventId)
  return e.json(200, {
    corrected: true,
    recordId: result.recordId,
    present: action === "manual_add",
    occurredAt: result.occurredAt,
    presentCount: attendance.presentCount($app, sessionId),
  })
}, $apis.requireAuth("users"))
