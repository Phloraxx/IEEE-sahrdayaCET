/// <reference path="../pb_data/types.d.ts" />

// Community Roles V2 authorization core.
// Titles live in Execom/assignments; security is evaluated only through
// capability + scope. Legacy admin/chair/content roles remain compatible
// during the migration period.

var ROLE_CAPABILITIES = {
  branch_chair: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
    "events.approve", "events.publish", "events.cancel", "events.complete", "registrations.view",
    "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
    "societies.view", "societies.edit", "assignments.manage", "content.manage",
    "execom.manage", "reports.view", "certificates.view", "certificates.manage_templates",
    "certificates.issue", "certificates.revoke"
  ],
  branch_vice_chair: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
    "events.approve", "events.publish", "events.cancel", "events.complete", "registrations.view",
    "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
    "societies.view", "societies.edit", "assignments.manage", "content.manage",
    "reports.view", "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.revoke"
  ],
  branch_secretary: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
    "events.approve", "events.publish", "events.cancel", "events.complete", "registrations.view",
    "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
    "societies.view", "assignments.manage", "content.manage", "reports.view",
    "certificates.view", "certificates.manage_templates", "certificates.issue"
  ],
  branch_joint_secretary: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit", "events.complete",
    "registrations.view", "registrations.manage", "registrations.manual", "checkin.manage",
    "societies.view", "content.manage", "reports.view", "certificates.view", "certificates.issue"
  ],
  branch_treasurer: [
    "workspace.view", "events.view", "registrations.view", "finance.view", "finance.manage",
    "finance.approve", "reports.view"
  ],
  branch_counselor: [
    "workspace.view", "events.view", "events.approve", "events.publish", "events.cancel", "events.complete",
    "registrations.view", "finance.view", "societies.view", "assignments.manage",
    "execom.manage", "reports.view", "certificates.view", "certificates.manage_templates",
    "certificates.issue", "certificates.revoke"
  ],
  branch_faculty_coordinator: [
    "workspace.view", "events.view", "events.approve", "events.publish", "events.cancel", "events.complete",
    "registrations.view", "finance.view", "societies.view", "assignments.manage",
    "reports.view", "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.revoke"
  ],
  branch_content: ["workspace.view", "events.view", "societies.view", "content.manage"],
  branch_webmaster: ["workspace.view", "events.view", "societies.view", "content.manage", "reports.view"],

  society_faculty: [
    "workspace.view", "events.view", "events.edit", "events.submit", "events.approve", "events.complete",
    "registrations.view", "checkin.manage", "finance.view", "societies.view", "societies.edit",
    "assignments.manage", "reports.view", "certificates.view", "certificates.manage_templates",
    "certificates.issue", "certificates.revoke"
  ],
  society_chair: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
    "events.cancel", "registrations.view", "registrations.manage", "registrations.manual",
    "checkin.manage", "finance.view", "societies.view", "societies.edit",
    "assignments.manage", "content.manage", "reports.view", "certificates.view", "certificates.manage_templates",
    "certificates.issue", "certificates.revoke"
  ],
  society_vice_chair: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
    "events.cancel", "registrations.view", "registrations.manage", "registrations.manual",
    "checkin.manage", "finance.view", "societies.view", "assignments.manage",
    "content.manage", "reports.view", "certificates.view", "certificates.issue"
  ],
  society_secretary: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.submit", "events.complete",
    "registrations.view", "registrations.manage", "registrations.manual", "checkin.manage",
    "societies.view", "content.manage", "reports.view", "certificates.view", "certificates.issue"
  ],
  society_treasurer: [
    "workspace.view", "events.view", "registrations.view", "finance.view", "finance.manage",
    "finance.approve", "societies.view", "reports.view"
  ],
  society_content: ["workspace.view", "events.view", "societies.view", "content.manage"],
  society_team: ["workspace.view", "events.view", "societies.view"],

  event_lead: [
    "workspace.view", "events.view", "events.edit", "events.submit", "events.complete", "registrations.view",
    "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
    "assignments.manage", "content.manage", "reports.view", "certificates.view", "certificates.issue"
  ],
  event_registration: [
    "workspace.view", "events.view", "registrations.view", "registrations.manage",
    "registrations.manual"
  ],
  event_checkin: ["workspace.view", "events.view", "checkin.manage"],
  event_content: ["workspace.view", "events.view", "content.manage"],
  event_finance: [
    "workspace.view", "events.view", "registrations.view", "finance.view", "finance.manage",
    "finance.approve"
  ]
}

var ALL_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
  "events.approve", "events.publish", "events.cancel", "events.complete", "registrations.view",
  "registrations.manage", "registrations.manual", "checkin.manage", "finance.view",
  "finance.manage", "finance.approve", "societies.view", "societies.edit",
  "assignments.manage", "content.manage", "execom.manage", "reports.view", "technical.manage",
  "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.revoke"
]

var LEGACY_CHAIR_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.submit",
  "events.publish", "events.cancel", "events.complete", "registrations.view", "registrations.manage",
  "registrations.manual", "checkin.manage", "finance.view", "societies.view", "societies.edit",
  "reports.view", "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.revoke"
]

function authRole(auth) {
  if (!auth || !auth.id) return ""
  try {
    if (typeof auth.isSuperuser === "function" && auth.isSuperuser()) return "admin"
  } catch (_) {}
  try { return auth.getString("role") || "" } catch (_) { return "" }
}

function contains(values, value) {
  return Array.isArray(values) && values.indexOf(value) !== -1
}

function recordDate(record, name) {
  var raw = ""
  try { raw = record.getString(name) || "" } catch (_) { raw = "" }
  if (!raw) return null
  var time = Date.parse(raw)
  return isFinite(time) ? time : null
}

function assignmentActive(record, nowMs) {
  if (!record) return false
  try { if (!record.getBool("active")) return false } catch (_) { return false }
  var now = typeof nowMs === "number" ? nowMs : Date.now()
  var start = recordDate(record, "startsAt")
  var end = recordDate(record, "endsAt")
  if (start !== null && start > now) return false
  if (end !== null && end < now) return false
  return true
}

function assignmentScope(record) {
  return {
    type: record.getString("scopeType") || "",
    societyId: record.getString("society") || "",
    eventId: record.getString("event") || ""
  }
}

function scopeMatches(record, context) {
  var scope = assignmentScope(record)
  if (scope.type === "branch") return true
  context = context || {}
  if (scope.type === "society") {
    return !!scope.societyId && scope.societyId === String(context.societyId || "")
  }
  if (scope.type === "event") {
    return !!scope.eventId && scope.eventId === String(context.eventId || "")
  }
  return false
}

function activeAssignments(app, auth) {
  if (!app || !auth || !auth.id) return []
  var rows = []
  try {
    rows = app.findRecordsByFilter(
      "organization_assignments",
      "user = {:user} && active = true",
      "startsAt,created",
      0,
      0,
      { user: auth.id }
    )
  } catch (_) {
    return []
  }
  var now = Date.now()
  return rows.filter(function (row) { return assignmentActive(row, now) })
}

function legacyChairOwnsSociety(app, auth, societyId) {
  if (authRole(auth) !== "chair" || !societyId) return false
  try {
    var society = app.findRecordById("societies", societyId)
    var chairs = society.getStringSlice("chairs") || []
    return chairs.indexOf(auth.id) !== -1
  } catch (_) { return false }
}

function legacyHasCapability(app, auth, capability, context) {
  var role = authRole(auth)
  if (role === "admin") return true
  if (role === "content") return capability === "workspace.view" || capability === "content.manage"
  if (role !== "chair" || !contains(LEGACY_CHAIR_CAPABILITIES, capability)) return false
  if (capability === "workspace.view") return true
  return legacyChairOwnsSociety(app, auth, String((context || {}).societyId || ""))
}

function hasCapability(app, auth, capability, context) {
  if (!auth || !auth.id || !capability) return false
  if (legacyHasCapability(app, auth, capability, context)) return true
  var rows = activeAssignments(app, auth)
  for (var i = 0; i < rows.length; i++) {
    var roleCode = rows[i].getString("roleCode") || ""
    var capabilities = ROLE_CAPABILITIES[roleCode] || []
    if (contains(capabilities, capability) && scopeMatches(rows[i], context || {})) return true
  }
  return false
}

function eventContext(app, event) {
  if (!event) return { eventId: "", societyId: "" }
  return {
    eventId: event.id || "",
    societyId: event.getString("society") || ""
  }
}

function hasEventCapability(app, auth, capability, event) {
  return hasCapability(app, auth, capability, eventContext(app, event))
}

function effectiveCapabilities(app, auth) {
  if (!auth || !auth.id) return []
  var role = authRole(auth)
  if (role === "admin") return ALL_CAPABILITIES.slice()
  var out = []
  function add(value) { if (out.indexOf(value) === -1) out.push(value) }
  if (role === "content") { add("workspace.view"); add("content.manage") }
  if (role === "chair") {
    for (var c = 0; c < LEGACY_CHAIR_CAPABILITIES.length; c++) add(LEGACY_CHAIR_CAPABILITIES[c])
  }
  var rows = activeAssignments(app, auth)
  for (var i = 0; i < rows.length; i++) {
    var caps = ROLE_CAPABILITIES[rows[i].getString("roleCode") || ""] || []
    for (var j = 0; j < caps.length; j++) add(caps[j])
  }
  return out.sort()
}

function assignmentPayload(record) {
  return {
    id: record.id,
    userId: record.getString("user") || "",
    roleCode: record.getString("roleCode") || "",
    title: record.getString("title") || "",
    scopeType: record.getString("scopeType") || "",
    societyId: record.getString("society") || "",
    eventId: record.getString("event") || "",
    term: record.getString("term") || "",
    startsAt: record.getString("startsAt") || "",
    endsAt: record.getString("endsAt") || "",
    active: record.getBool("active"),
    source: record.getString("source") || "manual",
    notes: record.getString("notes") || "",
    capabilities: (ROLE_CAPABILITIES[record.getString("roleCode") || ""] || []).slice()
  }
}

function enrichAssignment(app, record) {
  var row = assignmentPayload(record)
  try {
    var user = app.findRecordById("users", row.userId)
    row.userName = user.getString("name") || user.getString("display_name") || ""
    row.userEmail = user.getString("email") || ""
  } catch (_) { row.userName = ""; row.userEmail = "" }
  if (row.societyId) {
    try { row.societyName = app.findRecordById("societies", row.societyId).getString("name") || "" } catch (_) { row.societyName = "" }
  }
  if (row.eventId) {
    try { row.eventTitle = app.findRecordById("events", row.eventId).getString("title") || "" } catch (_) { row.eventTitle = "" }
  }
  return row
}

function requestBody(e) {
  try { return e.requestInfo().body || {} } catch (_) { return {} }
}

function jsonError(e, status, code, message) {
  return e.json(status, { code: code, error: message })
}

function hasHigherScopeAssignmentManager(app, auth, scopeType, societyId, eventId) {
  var rows = activeAssignments(app, auth)
  var eventSocietyId = societyId || ""
  if (scopeType === "event" && eventId && !eventSocietyId) {
    try { eventSocietyId = app.findRecordById("events", eventId).getString("society") || "" } catch (_) {}
  }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var caps = ROLE_CAPABILITIES[row.getString("roleCode") || ""] || []
    if (caps.indexOf("assignments.manage") === -1) continue
    var rowScope = row.getString("scopeType") || ""
    if (rowScope === "branch") return true
    if (scopeType === "event" && rowScope === "society" && row.getString("society") === eventSocietyId) return true
  }
  return false
}

function mayGrantRole(app, auth, roleCode, scopeType, societyId, eventId) {
  if (authRole(auth) === "admin") return true
  if (!validRoleCode(roleCode) || roleScopeType(roleCode) !== scopeType) return false
  if (!mayManageAssignments(app, auth, scopeType, societyId, eventId)) return false
  if (scopeType === "branch") return false

  var higherScopeManager = hasHigherScopeAssignmentManager(app, auth, scopeType, societyId, eventId)
  if (scopeType === "society") {
    if (["society_faculty", "society_chair", "society_treasurer"].indexOf(roleCode) !== -1) return higherScopeManager
    return ["society_vice_chair", "society_secretary", "society_content", "society_team"].indexOf(roleCode) !== -1
  }
  if (scopeType === "event") {
    if (roleCode === "event_lead" || roleCode === "event_finance") return higherScopeManager
    return ["event_registration", "event_checkin", "event_content"].indexOf(roleCode) !== -1
  }
  return false
}

function mayManageAssignments(app, auth, scopeType, societyId, eventId) {
  if (authRole(auth) === "admin") return true
  if (scopeType === "branch") return hasCapability(app, auth, "assignments.manage", {})
  if (scopeType === "society") {
    return hasCapability(app, auth, "assignments.manage", { societyId: societyId || "" })
  }
  if (scopeType === "event") {
    var event = null
    try { event = app.findRecordById("events", eventId || "") } catch (_) { return false }
    return hasEventCapability(app, auth, "assignments.manage", event)
  }
  return false
}

function roleScopeType(roleCode) {
  if (String(roleCode).indexOf("branch_") === 0) return "branch"
  if (String(roleCode).indexOf("society_") === 0) return "society"
  if (String(roleCode).indexOf("event_") === 0) return "event"
  return ""
}

function validRoleCode(roleCode) {
  return Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, roleCode)
}

module.exports = {
  ROLE_CAPABILITIES: ROLE_CAPABILITIES,
  ALL_CAPABILITIES: ALL_CAPABILITIES,
  authRole: authRole,
  assignmentActive: assignmentActive,
  activeAssignments: activeAssignments,
  effectiveCapabilities: effectiveCapabilities,
  eventContext: eventContext,
  hasCapability: hasCapability,
  hasEventCapability: hasEventCapability,
  legacyChairOwnsSociety: legacyChairOwnsSociety,
  assignmentPayload: assignmentPayload,
  enrichAssignment: enrichAssignment,
  requestBody: requestBody,
  jsonError: jsonError,
  mayManageAssignments: mayManageAssignments,
  hasHigherScopeAssignmentManager: hasHigherScopeAssignmentManager,
  mayGrantRole: mayGrantRole,
  roleScopeType: roleScopeType,
  validRoleCode: validRoleCode
}
