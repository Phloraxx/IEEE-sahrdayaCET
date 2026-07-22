/// <reference path="../pb_data/types.d.ts" />

// The public execom directory is intentionally readable, but contact details
// are private. Record enrichment gives us field-level response privacy without
// splitting the collection or proxying public reads through the web server.
onRecordEnrich(function (e) {
  var auth = null
  try { auth = e.requestInfo && e.requestInfo.auth ? e.requestInfo.auth : null } catch (_) { auth = null }
  var isAdmin = auth && (auth.isSuperuser() || auth.getString("role") === "admin")
  if (!isAdmin) {
    e.record.hide("email")
    e.record.hide("phone")
  }
  e.next()
}, "execom")
