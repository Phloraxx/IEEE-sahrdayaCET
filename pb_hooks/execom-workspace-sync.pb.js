/// <reference path="../pb_data/types.d.ts" />

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
