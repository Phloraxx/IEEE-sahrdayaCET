/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/workspace/me", function (e) {
  try {
    var authz = require(__hooks + "/workspace-authorization.js")
    var rows = authz.activeAssignments($app, e.auth)
    var capabilities = authz.effectiveCapabilities($app, e.auth)
    var branchCapabilities = []
    for (var ci = 0; ci < authz.ALL_CAPABILITIES.length; ci++) {
      var capability = authz.ALL_CAPABILITIES[ci]
      if (authz.hasCapability($app, e.auth, capability, {})) branchCapabilities.push(capability)
    }
    var enriched = rows.map(function (row) { return authz.enrichAssignment($app, row) })
    return e.json(200, {
      hasWorkspace: capabilities.length > 0,
      legacyRole: authz.authRole(e.auth),
      capabilities: capabilities,
      branchCapabilities: branchCapabilities,
      assignments: enriched
    })
  } catch (err) {
    return authz.jsonError(e, 500, "WORKSPACE_ME_FAILED", String(err && err.message ? err.message : err))
  }
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/workspace/assignments", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var scopeType = String(e.request.url.query().get("scopeType") || "branch")
  var scopeId = String(e.request.url.query().get("scopeId") || "")
  var societyId = scopeType === "society" ? scopeId : ""
  var eventId = scopeType === "event" ? scopeId : ""
  if (!authz.mayManageAssignments($app, e.auth, scopeType, societyId, eventId)) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You cannot manage assignments in this scope")
  }
  var filter = "scopeType = {:scopeType}"
  var params = { scopeType: scopeType }
  if (scopeType === "society") { filter += " && society = {:scopeId}"; params.scopeId = scopeId }
  if (scopeType === "event") { filter += " && event = {:scopeId}"; params.scopeId = scopeId }
  var rows = $app.findRecordsByFilter("organization_assignments", filter, "-active,roleCode,created", 0, 0, params)
  return e.json(200, { assignments: rows.map(function (row) { return authz.enrichAssignment($app, row) }) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/assignments", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var body = authz.requestBody(e)
  var userId = String(body.userId || "").trim()
  var roleCode = String(body.roleCode || "").trim()
  var scopeType = String(body.scopeType || "").trim()
  var societyId = String(body.societyId || "").trim()
  var eventId = String(body.eventId || "").trim()
  if (!userId || !roleCode || !scopeType) return authz.jsonError(e, 400, "INVALID_ASSIGNMENT", "User, role and scope are required")
  var storedRoleCode = authz.storageRoleCode(roleCode, scopeType)
  if (!storedRoleCode || !authz.validRoleCode(roleCode, scopeType) || authz.roleScopeType(roleCode, scopeType) !== scopeType) {
    return authz.jsonError(e, 400, "ROLE_SCOPE_MISMATCH", "This role does not belong to the selected scope")
  }
  if (scopeType === "branch") { societyId = ""; eventId = "" }
  if (scopeType === "society" && !societyId) return authz.jsonError(e, 400, "SOCIETY_REQUIRED", "Select a society")
  if (scopeType === "event" && !eventId) return authz.jsonError(e, 400, "EVENT_REQUIRED", "Select an event")
  var grantAllowed = authz.mayGrantRole($app, e.auth, roleCode, scopeType, societyId, eventId)
  if (!grantAllowed) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You cannot grant this role")
  }
  try { $app.findRecordById("users", userId) } catch (_) { return authz.jsonError(e, 404, "USER_NOT_FOUND", "User not found") }
  if (societyId) { try { $app.findRecordById("societies", societyId) } catch (_) { return authz.jsonError(e, 404, "SOCIETY_NOT_FOUND", "Society not found") } }
  if (eventId) { try { $app.findRecordById("events", eventId) } catch (_) { return authz.jsonError(e, 404, "EVENT_NOT_FOUND", "Event not found") } }

  var duplicateFilter = "user = {:user} && roleCode = {:role} && scopeType = {:scope} && active = true"
  var duplicateParams = { user: userId, role: storedRoleCode, scope: scopeType }
  if (scopeType === "society") { duplicateFilter += " && society = {:society}"; duplicateParams.society = societyId }
  if (scopeType === "event") { duplicateFilter += " && event = {:event}"; duplicateParams.event = eventId }
  try {
    var duplicate = $app.findFirstRecordByFilter("organization_assignments", duplicateFilter, duplicateParams)
    if (duplicate) return authz.jsonError(e, 409, "ASSIGNMENT_EXISTS", "This active assignment already exists")
  } catch (_) {}

  var collection = $app.findCollectionByNameOrId("organization_assignments")
  var record = new Record(collection, {
    user: userId,
    roleCode: storedRoleCode,
    title: String(body.title || "").trim().slice(0, 180),
    scopeType: scopeType,
    society: societyId,
    event: eventId,
    term: String(body.term || "").trim().slice(0, 80),
    startsAt: String(body.startsAt || "").trim(),
    endsAt: String(body.endsAt || "").trim(),
    active: true,
    source: "manual",
    createdBy: e.auth.id,
    notes: String(body.notes || "").trim().slice(0, 2000),
  })
  helpers.audit($app, {
    eventId: eventId,
    actorId: e.auth.id,
    action: "access.assignment-create",
    note: authz.canonicalRoleCode(roleCode) + " → " + userId,
    entityType: "organization_assignment",
    entityId: record.id,
    after: authz.assignmentPayload(record),
  })
  return e.json(201, { assignment: authz.enrichAssignment($app, record) })
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/workspace/assignments/{id}", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var id = e.request.pathValue("id") || ""
  var record
  try { record = $app.findRecordById("organization_assignments", id) } catch (_) { return authz.jsonError(e, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found") }
  var scopeType = record.getString("scopeType") || ""
  var societyId = record.getString("society") || ""
  var eventId = record.getString("event") || ""
  var roleCode = record.getString("roleCode") || ""
  if (!authz.mayGrantRole($app, e.auth, roleCode, scopeType, societyId, eventId)) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You cannot remove this assignment")
  }
  var before = authz.assignmentPayload(record)
  record.set("active", false)
  $app.save(record)
  helpers.audit($app, {
    eventId: eventId,
    actorId: e.auth.id,
    action: "access.assignment-deactivate",
    note: roleCode + " → " + record.getString("user"),
    entityType: "organization_assignment",
    entityId: record.id,
    before: before,
    after: authz.assignmentPayload(record),
  })
  return e.json(200, { assignment: authz.enrichAssignment($app, record) })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/workspace/users/search", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var q = String(e.request.url.query().get("q") || "").trim()
  var scopeType = String(e.request.url.query().get("scopeType") || "branch")
  var scopeId = String(e.request.url.query().get("scopeId") || "")
  var societyId = scopeType === "society" ? scopeId : ""
  var eventId = scopeType === "event" ? scopeId : ""
  if (!authz.mayManageAssignments($app, e.auth, scopeType, societyId, eventId)) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You cannot search users for this scope")
  }
  if (q.length < 2) return e.json(200, { users: [] })
  var rows = $app.findRecordsByFilter(
    "users", "name ~ {:q} || email ~ {:q} || display_name ~ {:q}", "name", 20, 0, { q: q }
  )
  return e.json(200, { users: rows.map(function (user) {
    return { id: user.id, name: user.getString("name") || user.getString("display_name") || "", email: user.getString("email") || "" }
  }) })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/workspace/profile", function (e) {
  var profile = null
  try { profile = $app.findFirstRecordByFilter("community_profiles", "user = {:user}", { user: e.auth.id }) } catch (_) {}
  if (!profile) return e.json(200, { profile: null })
  return e.json(200, { profile: {
    id: profile.id,
    accountType: profile.getString("accountType") || "",
    srNumber: profile.getString("srNumber") || "",
    department: profile.getString("department") || "",
    semester: profile.getString("semester") || "",
    graduationYear: profile.getString("graduationYear") || "",
    ieeeMemberId: profile.getString("ieeeMemberId") || "",
    ieeeMember: profile.getBool("ieeeMember"),
    institutionalVerified: profile.getBool("institutionalVerified"),
    verifiedAt: profile.getString("verifiedAt") || ""
  } })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/profile", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var body = authz.requestBody(e)
  var accountType = String(body.accountType || "").trim()
  if (["", "student", "faculty", "alumni", "external"].indexOf(accountType) === -1) {
    return authz.jsonError(e, 400, "INVALID_ACCOUNT_TYPE", "Invalid community account type")
  }
  var record = null
  try { record = $app.findFirstRecordByFilter("community_profiles", "user = {:user}", { user: e.auth.id }) } catch (_) {}
  if (!record) record = new Record($app.findCollectionByNameOrId("community_profiles"), { user: e.auth.id })
  record.set("accountType", accountType)
  record.set("srNumber", String(body.srNumber || "").trim().slice(0, 80))
  record.set("department", String(body.department || "").trim().slice(0, 120))
  record.set("semester", String(body.semester || "").trim().slice(0, 40))
  record.set("graduationYear", String(body.graduationYear || "").trim().slice(0, 20))
  record.set("ieeeMemberId", String(body.ieeeMemberId || "").trim().slice(0, 80))
  record.set("ieeeMember", body.ieeeMember === true)
  // institutionalVerified/verifiedBy/verifiedAt are intentionally never accepted from self-service input.
  try { $app.save(record) } catch (err) { return authz.jsonError(e, 400, "PROFILE_SAVE_FAILED", err.message || "Could not save profile") }
  return e.json(200, { success: true, profileId: record.id })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/events/{id}/workflow", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var id = e.request.pathValue("id") || ""
  var event
  try { event = $app.findRecordById("events", id) } catch (_) { return authz.jsonError(e, 404, "EVENT_NOT_FOUND", "Event not found") }
  var body = authz.requestBody(e)
  var action = String(body.action || "").trim()
  var note = String(body.note || "").trim().slice(0, 4000)
  var required = { publish: "events.publish", unpublish: "events.publish", complete: "events.complete" }
  if (!required[action]) return authz.jsonError(e, 400, "INVALID_ACTION", "Unknown event lifecycle action")
  if (!authz.hasEventCapability($app, e.auth, required[action], event)) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You cannot perform this event lifecycle action")
  }
  var before = helpers.eventPayload(event)
  if (action === "publish") {
    if (event.getBool("isDeleted") || ["cancelled", "completed"].indexOf(event.getString("status")) !== -1) {
      return authz.jsonError(e, 409, "EVENT_FINAL", "This event can no longer be published")
    }
    if (event.getString("status") === "published") return authz.jsonError(e, 409, "ALREADY_PUBLISHED", "This event is already published")
    var publishError = require(__hooks + "/event-lifecycle-helpers.js").publishError(event)
    if (publishError) return authz.jsonError(e, 400, publishError.code, publishError.message)
    // Registration availability is separate; publishing does not reopen it.
    event.set("status", "published")
  } else if (action === "unpublish") {
    if (event.getString("status") !== "published") return authz.jsonError(e, 409, "NOT_PUBLISHED", "Only a published event can be returned to draft")
    if (!note) return authz.jsonError(e, 400, "NOTE_REQUIRED", "Explain why the published event is being returned to draft")
    event.set("status", "draft")
    event.set("registrationOpen", false)
  } else if (action === "complete") {
    if (event.getString("status") !== "published") return authz.jsonError(e, 409, "NOT_PUBLISHED", "Only a published event can be completed")
    var effectiveEnd = require(__hooks + "/event-time-helpers.js").eventEndDate(event)
    if (effectiveEnd && !isNaN(effectiveEnd.getTime()) && effectiveEnd.getTime() > Date.now()) {
      return authz.jsonError(e, 409, "EVENT_NOT_ENDED", "The event cannot be completed before its scheduled end")
    }
    event.set("status", "completed")
    event.set("registrationOpen", false)
  }
  // Custom lifecycle commands are internal saves, so record-request guards do
  // not intercept them. Keep normal validation/model hooks instead of bypassing them.
  try { $app.save(event) } catch (err) { return authz.jsonError(e, 400, "WORKFLOW_FAILED", err.message || "Could not update event lifecycle") }
  if (action === "complete") {
    try { require(__hooks + "/attendee-lifecycle-helpers.js").reconcileEventWaitlist($app, event.id, new Date().toISOString()) }
    catch (waitlistErr) { console.log("[workspace] waitlist closeout failed:", waitlistErr) }
  }
  helpers.audit($app, {
    eventId: event.id,
    actorId: e.auth.id,
    action: "event.lifecycle." + action,
    note: note,
    entityType: "event",
    entityId: event.id,
    before: before,
    after: helpers.eventPayload(event),
  })
  return e.json(200, { event: helpers.eventPayload(event) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/workspace/check-in", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var rh = require(__hooks + "/registration-helpers.js")
  var body = authz.requestBody(e)
  var ticketId = String(body.ticketId || "").trim()
  var expectedEventId = String(body.eventId || "").trim()
  if (!ticketId) return authz.jsonError(e, 400, "TICKET_REQUIRED", "Ticket ID is required")
  var expectedEvent = null
  if (expectedEventId) {
    try { expectedEvent = $app.findRecordById("events", expectedEventId) }
    catch (_) { return authz.jsonError(e, 404, "EVENT_NOT_FOUND", "Event not found") }
    if (!authz.hasEventCapability($app, e.auth, "checkin.manage", expectedEvent)) {
      return authz.jsonError(e, 403, "FORBIDDEN", "You are not assigned to check in this event")
    }
  }
  var registration
  try { registration = $app.findFirstRecordByFilter("registrations", "ticketId = {:ticket}", { ticket: ticketId }) }
  catch (_) { return authz.jsonError(e, 404, "REGISTRATION_NOT_FOUND", "Registration not found") }
  var event
  try { event = $app.findRecordById("events", registration.getString("event")) } catch (_) { return authz.jsonError(e, 404, "EVENT_NOT_FOUND", "Event not found") }
  if (expectedEventId && event.id !== expectedEventId) {
    return authz.jsonError(e, 409, "WRONG_EVENT", "This ticket belongs to a different event")
  }
  if (!expectedEvent && !authz.hasEventCapability($app, e.auth, "checkin.manage", event)) {
    return authz.jsonError(e, 403, "FORBIDDEN", "You are not assigned to check in this event")
  }
  if (event.getString("status") !== "published") return authz.jsonError(e, 409, "CHECKIN_NOT_ACTIVE", "Check-in is only available while the event is published")
  if (!event.getBool("checkInEnabled")) return authz.jsonError(e, 409, "CHECKIN_DISABLED", "Check-in is not enabled for this event")
  if (registration.getString("registrationStatus") !== "confirmed") return authz.jsonError(e, 409, "NOT_CONFIRMED", "Registration is not confirmed")
  if (require(__hooks + "/attendance-v2-helpers.js").eventHasSessions($app, event.id)) {
    return authz.jsonError(e, 409, "SESSION_REQUIRED", "This event uses attendance sessions. Select a session in the Attendance console.")
  }
  if (registration.getBool("checkedIn")) return authz.jsonError(e, 409, "ALREADY_CHECKED_IN", "Already checked in")
  var now = new Date().toISOString()
  var before = helpers.registrationSnapshot(registration)
  registration.set("checkedIn", true)
  registration.set("checkedInAt", now)
  $app.saveNoValidate(registration)
  rh.recomputeEventCounters(event.id)
  helpers.audit($app, {
    eventId: event.id,
    registrationId: registration.id,
    actorId: e.auth.id,
    action: "registration.check-in",
    before: before,
    after: helpers.registrationSnapshot(registration),
  })
  return e.json(200, { success: true, message: "Checked in successfully", registration: {
    id: registration.id,
    eventTitle: event.getString("title") || "",
    ticketId: ticketId,
    checkedIn: true,
    checkedInAt: now,
  } })
}, $apis.requireAuth("users"))
