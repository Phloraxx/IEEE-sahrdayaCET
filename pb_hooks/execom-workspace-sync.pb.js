/// <reference path="../pb_data/types.d.ts" />

function normalizeWorkspaceRole(e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var raw = String(e.record.getString("roleCode") || "").trim()
  if (!raw) return e.next()
  var scopeType = String(e.record.getString("society") || "").trim() ? "society" : "branch"
  var stored = authz.storageRoleCode(raw, scopeType)
  if (!stored) throw new BadRequestError("This workspace role does not belong to the selected directory scope")
  e.record.set("roleCode", stored)
  e.next()
}

onRecordCreateRequest(normalizeWorkspaceRole, "execom")
onRecordUpdateRequest(normalizeWorkspaceRole, "execom")

onRecordAfterCreateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

onRecordAfterUpdateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

// The source record has already been durably removed here. If revocation hits a
// transient DB error, authorization still fails closed because the Execom source
// no longer exists; the reconciler will retire the orphaned row on a later pass.
onRecordAfterDeleteSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").deactivateExecomSource(e.record)
  e.next()
}, "execom")

cronAdd("execom-workspace-reconcile", "*/5 * * * *", function () {
  require(__hooks + "/execom-workspace-sync.js").reconcileExecomWorkspace()
})
