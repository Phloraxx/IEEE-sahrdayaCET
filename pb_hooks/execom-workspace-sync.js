/// <reference path="../pb_data/types.d.ts" />

function execomResolveSocietyId(record) {
  var raw = String(record.getString("society") || "").trim()
  if (!raw) return ""
  try { return $app.findRecordById("societies", raw).id } catch (_) {}
  try { return $app.findFirstRecordByFilter("societies", "slug = {:slug}", { slug: raw }).id } catch (_) {}
  return ""
}

function execomDeactivateAssignment(id) {
  if (!id) return true
  try {
    var assignment = $app.findRecordById("organization_assignments", id)
    if (assignment.getBool("active")) {
      assignment.set("active", false)
      $app.saveNoValidate(assignment)
    }
    return true
  } catch (err) {
    console.log("[workspace] failed to deactivate Execom assignment " + id + ":", err)
    return false
  }
}

function execomClearAssignment(record, existingId) {
  if (!existingId) return true
  if (!execomDeactivateAssignment(existingId)) return false
  record.set("assignment", "")
  try {
    $app.saveNoValidate(record)
    return true
  } catch (err) {
    console.log("[workspace] failed to clear Execom assignment backlink " + record.id + ":", err)
    return false
  }
}

function syncExecomWorkspace(record) {
  if (!record) return
  var authz = require(__hooks + "/workspace-authorization.js")
  var userId = String(record.getString("user") || "").trim()
  var roleCode = String(record.getString("roleCode") || "").trim()
  var existingId = String(record.getString("assignment") || "").trim()
  if (!userId || !roleCode || !authz.validRoleCode(roleCode)) {
    if (existingId && !execomClearAssignment(record, existingId)) return
    return
  }

  var scopeType = authz.roleScopeType(roleCode)
  if (scopeType !== "branch" && scopeType !== "society") {
    if (existingId && !execomClearAssignment(record, existingId)) return
    return
  }
  var societyId = scopeType === "society" ? execomResolveSocietyId(record) : ""
  if (scopeType === "society" && !societyId) {
    if (existingId && !execomClearAssignment(record, existingId)) return
    console.log("[workspace] Execom role not synced because society could not be resolved for " + record.id)
    return
  }

  var existing = null
  if (existingId) {
    try { existing = $app.findRecordById("organization_assignments", existingId) } catch (_) { existing = null }
  }
  var same = existing &&
    existing.getString("user") === userId &&
    existing.getString("roleCode") === roleCode &&
    existing.getString("scopeType") === scopeType &&
    existing.getString("society") === societyId

  if (!same && existing) {
    if (!execomDeactivateAssignment(existing.id)) return
    existing = null
  }
  if (!existing) {
    try {
      existing = $app.findFirstRecordByFilter(
        "organization_assignments",
        "user = {:user} && roleCode = {:role} && scopeType = {:scope} && society = {:society} && source = 'execom' && active = true",
        { user: userId, role: roleCode, scope: scopeType, society: societyId }
      )
    } catch (_) { existing = null }
  }
  if (!existing) {
    existing = new Record($app.findCollectionByNameOrId("organization_assignments"), {
      user: userId,
      roleCode: roleCode,
      scopeType: scopeType,
      society: societyId,
      event: "",
      active: true,
      source: "execom",
    })
  }
  existing.set("title", String(record.getString("position") || "").slice(0, 180))
  existing.set("term", String(record.getString("term") || "").slice(0, 80))
  existing.set("startsAt", record.getString("activeFrom") || "")
  existing.set("endsAt", record.getString("activeUntil") || "")
  existing.set("active", true)
  existing.set("notes", "Synced from Execom record " + record.id)
  try { $app.saveNoValidate(existing) } catch (err) {
    console.log("[workspace] failed to sync Execom assignment " + record.id + ":", err)
    return
  }
  if (record.getString("assignment") !== existing.id) {
    record.set("assignment", existing.id)
    try {
      $app.saveNoValidate(record)
    } catch (err) {
      console.log("[workspace] failed to save Execom assignment backlink " + record.id + ":", err)
    }
  }
}

module.exports = {
  syncExecomWorkspace: syncExecomWorkspace,
  execomDeactivateAssignment: execomDeactivateAssignment
}
