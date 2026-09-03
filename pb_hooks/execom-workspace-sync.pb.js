/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

onRecordAfterUpdateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

onRecordDelete(function (e) {
  var sync = require(__hooks + "/execom-workspace-sync.js")
  var assignmentId = e.record.getString("assignment") || ""
  if (assignmentId && !sync.execomDeactivateAssignment(assignmentId)) {
    throw new Error("Failed to revoke the Execom workspace assignment; deletion was blocked")
  }
  e.next()
}, "execom")

onRecordAfterDeleteError(function (e) {
  try {
    require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  } catch (err) {
    console.log("[workspace] failed to restore Execom assignment after delete rollback " + e.record.id + ":", err)
  }
  e.next()
}, "execom")
