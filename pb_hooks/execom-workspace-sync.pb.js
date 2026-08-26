/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

onRecordAfterUpdateSuccess(function (e) {
  require(__hooks + "/execom-workspace-sync.js").syncExecomWorkspace(e.record)
  e.next()
}, "execom")

onRecordAfterDeleteSuccess(function (e) {
  var sync = require(__hooks + "/execom-workspace-sync.js")
  try { sync.execomDeactivateAssignment(e.record.getString("assignment") || "") } catch (_) {}
  e.next()
}, "execom")
