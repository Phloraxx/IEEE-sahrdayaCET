/// <reference path="../pb_data/types.d.ts" />

// Small workspace access model. Organizational positions remain in Execom and
// assignment.title; only these access roles determine capabilities. Historical
// role codes below are aliases so existing records keep working without a data
// rewrite.
var CANONICAL_ROLE_CAPABILITIES = {
  organizer: [
    "workspace.view", "events.view", "events.create", "events.edit", "events.publish",
    "events.cancel", "events.archive", "events.complete", "registrations.view",
    "registrations.manage", "registrations.manual", "checkin.manage", "assignments.manage",
    "societies.view", "societies.edit",
    "reports.view", "certificates.view", "certificates.manage_templates", "certificates.issue",
    "certificates.send", "certificates.revoke"
  ],
  finance: ["workspace.view", "events.view", "finance.view", "finance.manage"],
  registration_staff: ["workspace.view", "events.view", "registrations.view", "registrations.manage", "registrations.manual"],
  checkin_staff: ["workspace.view", "events.view", "checkin.manage"],
  content_editor: ["workspace.view", "events.view", "societies.view", "content.manage"]
}

var ROLE_ALIASES = {
  branch_chair: "organizer",
  branch_vice_chair: "organizer",
  branch_secretary: "organizer",
  branch_joint_secretary: "organizer",
  branch_counselor: "organizer",
  branch_faculty_coordinator: "organizer",
  branch_treasurer: "finance",
  branch_content: "content_editor",
  branch_webmaster: "content_editor",
  society_faculty: "organizer",
  society_chair: "organizer",
  society_vice_chair: "organizer",
  society_secretary: "organizer",
  society_treasurer: "finance",
  society_content: "content_editor",
  event_lead: "organizer",
  event_registration: "registration_staff",
  event_checkin: "checkin_staff",
  event_content: "content_editor",
  event_finance: "finance"
}

// society_team was a genuine view-only historical assignment. It is not
// offered for new grants, but retaining its narrow capabilities avoids
// silently escalating or breaking an existing directory assignment.
var ROLE_CAPABILITIES = {
  organizer: CANONICAL_ROLE_CAPABILITIES.organizer,
  finance: CANONICAL_ROLE_CAPABILITIES.finance,
  registration_staff: CANONICAL_ROLE_CAPABILITIES.registration_staff,
  checkin_staff: CANONICAL_ROLE_CAPABILITIES.checkin_staff,
  content_editor: CANONICAL_ROLE_CAPABILITIES.content_editor,
  society_team: ["workspace.view", "events.view", "societies.view"]
}
Object.keys(ROLE_ALIASES).forEach(function (roleCode) {
  ROLE_CAPABILITIES[roleCode] = CANONICAL_ROLE_CAPABILITIES[ROLE_ALIASES[roleCode]]
})

var ALL_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.publish", "events.cancel",
  "events.archive", "events.complete", "registrations.view", "registrations.manage", "registrations.manual",
  "checkin.manage", "finance.view", "finance.manage", "societies.view", "societies.edit",
  "assignments.manage", "content.manage", "execom.manage", "reports.view", "technical.manage",
  "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.send", "certificates.revoke"
]

var LEGACY_CHAIR_CAPABILITIES = [
  "workspace.view", "events.view", "events.create", "events.edit", "events.publish", "events.cancel",
  "events.archive", "events.complete", "registrations.view", "registrations.manage", "registrations.manual",
  "checkin.manage", "finance.view", "societies.view", "societies.edit", "reports.view", "certificates.view",
  "certificates.manage_templates", "certificates.issue", "certificates.send", "certificates.revoke"
]

var CANONICAL_ROLE_SCOPES = {
  organizer: ["branch", "society", "event"],
  finance: ["branch", "society", "event"],
  registration_staff: ["event"],
  checkin_staff: ["event"],
  content_editor: ["branch", "society", "event"]
}

function canonicalRoleCode(roleCode) {
  roleCode = String(roleCode || "")
  if (Object.prototype.hasOwnProperty.call(CANONICAL_ROLE_CAPABILITIES, roleCode)) return roleCode
  return ROLE_ALIASES[roleCode] || ""
}

function storageRoleCode(roleCode, scopeType) {
  var canonical = canonicalRoleCode(roleCode)
  if (String(roleCode || "") === "society_team" && scopeType === "society") return "society_team"
  if (!canonical || !contains(CANONICAL_ROLE_SCOPES[canonical], scopeType)) return ""
  if (Object.prototype.hasOwnProperty.call(ROLE_ALIASES, roleCode)) {
    return roleScopeType(roleCode, scopeType) === scopeType ? roleCode : ""
  }
  var preferred = {
    branch: { organizer: "branch_secretary", finance: "branch_treasurer", content_editor: "branch_content" },
    society: { organizer: "society_chair", finance: "society_treasurer", content_editor: "society_content" },
    event: { organizer: "event_lead", finance: "event_finance", registration_staff: "event_registration", checkin_staff: "event_checkin", content_editor: "event_content" }
  }
  return preferred[scopeType] && preferred[scopeType][canonical] || ""
}

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
  var execomIntegrity = null
  try { execomIntegrity = require(__hooks + "/execom-workspace-sync.js") } catch (_) {}
  return rows.filter(function (row) {
    if (!assignmentActive(row, now)) return false
    if (!validRoleCode(row.getString("roleCode") || "", row.getString("scopeType") || "")) return false
    if ((row.getString("source") || "") !== "execom") return true
    if (!execomIntegrity || typeof execomIntegrity.assignmentSourceCurrent !== "function") return false
    try { return execomIntegrity.assignmentSourceCurrent(app, row) } catch (_) { return false }
  })
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
    var capabilities = ROLE_CAPABILITIES[roleCode] || ROLE_CAPABILITIES[canonicalRoleCode(roleCode)] || []
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
    var caps = ROLE_CAPABILITIES[rows[i].getString("roleCode") || ""] || ROLE_CAPABILITIES[canonicalRoleCode(rows[i].getString("roleCode") || "")] || []
    for (var j = 0; j < caps.length; j++) add(caps[j])
  }
  return out.sort()
}

function assignmentPayload(record) {
  var roleCode = record.getString("roleCode") || ""
  return {
    id: record.id,
    userId: record.getString("user") || "",
    roleCode: roleCode,
    accessRole: canonicalRoleCode(roleCode),
    title: record.getString("title") || "",
    scopeType: record.getString("scopeType") || "",
    societyId: record.getString("society") || "",
    eventId: record.getString("event") || "",
    term: record.getString("term") || "",
    startsAt: record.getString("startsAt") || "",
    endsAt: record.getString("endsAt") || "",
    active: record.getBool("active"),
    source: record.getString("source") || "manual",
    sourceExecomId: record.getString("sourceExecom") || "",
    notes: record.getString("notes") || "",
    capabilities: (ROLE_CAPABILITIES[roleCode] || ROLE_CAPABILITIES[canonicalRoleCode(roleCode)] || []).slice()
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
    var caps = ROLE_CAPABILITIES[row.getString("roleCode") || ""] || ROLE_CAPABILITIES[canonicalRoleCode(row.getString("roleCode") || "")] || []
    if (caps.indexOf("assignments.manage") === -1) continue
    var rowScope = row.getString("scopeType") || ""
    if (rowScope === "branch") return true
    if (scopeType === "event" && rowScope === "society" && row.getString("society") === eventSocietyId) return true
  }
  return false
}

function mayGrantRole(app, auth, roleCode, scopeType, societyId, eventId) {
  if (authRole(auth) === "admin") return true
  var accessRole = canonicalRoleCode(roleCode)
  if (!validRoleCode(roleCode, scopeType) || roleScopeType(roleCode, scopeType) !== scopeType) return false
  if (!mayManageAssignments(app, auth, scopeType, societyId, eventId)) return false
  if (scopeType === "branch") return false

  var higherScopeManager = hasHigherScopeAssignmentManager(app, auth, scopeType, societyId, eventId)
  if (scopeType === "society") {
    if (["organizer", "finance"].indexOf(accessRole) !== -1) return higherScopeManager
    return accessRole === "content_editor"
  }
  if (scopeType === "event") {
    if (["organizer", "finance"].indexOf(accessRole) !== -1) return higherScopeManager
    return ["registration_staff", "checkin_staff", "content_editor"].indexOf(accessRole) !== -1
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
  var scopeType = arguments.length > 1 ? String(arguments[1] || "") : ""
  var raw = String(roleCode || "")
  if (raw.indexOf("branch_") === 0) return "branch"
  if (raw.indexOf("society_") === 0) return "society"
  if (raw.indexOf("event_") === 0) return "event"
  var canonical = canonicalRoleCode(raw)
  if (canonical && scopeType && contains(CANONICAL_ROLE_SCOPES[canonical], scopeType)) return scopeType
  return ""
}

function validRoleCode(roleCode, scopeType) {
  if (Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, roleCode)) {
    if (!scopeType) return true
    return roleScopeType(roleCode, scopeType) === scopeType
  }
  var canonical = canonicalRoleCode(roleCode)
  return !!canonical && (!scopeType || contains(CANONICAL_ROLE_SCOPES[canonical], scopeType))
}

module.exports = {
  ROLE_CAPABILITIES: ROLE_CAPABILITIES,
  CANONICAL_ROLE_CAPABILITIES: CANONICAL_ROLE_CAPABILITIES,
  ROLE_ALIASES: ROLE_ALIASES,
  ALL_CAPABILITIES: ALL_CAPABILITIES,
  authRole: authRole,
  assignmentActive: assignmentActive,
  activeAssignments: activeAssignments,
  effectiveCapabilities: effectiveCapabilities,
  eventContext: eventContext,
  hasCapability: hasCapability,
  hasEventCapability: hasEventCapability,
  canonicalRoleCode: canonicalRoleCode,
  storageRoleCode: storageRoleCode,
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
