/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(function (e) {
  var value = e.record.getString("defaultWhatsappLink") || ""
  if (value && !/^https?:\/\//i.test(value)) {
    throw e.badRequestError("defaultWhatsappLink must start with http:// or https://")
  }
  e.next()
}, "societies")

onRecordUpdateRequest(function (e) {
  var value = e.record.getString("defaultWhatsappLink") || ""
  if (value && !/^https?:\/\//i.test(value)) {
    throw e.badRequestError("defaultWhatsappLink must start with http:// or https://")
  }
  var auth = null
  try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (_) { auth = null }
  var authz = require(__hooks + "/workspace-authorization.js")
  if (authz.authRole(auth) !== "admin") {
    var oldRecord = $app.findRecordById("societies", e.record.id)
    if (!authz.hasCapability($app, auth, "societies.edit", { societyId: e.record.id })) {
      throw e.forbiddenError("You cannot edit this society")
    }
    var protectedFields = ["name", "slug", "isHidden", "chairs"]
    for (var i = 0; i < protectedFields.length; i++) {
      var field = protectedFields[i]
      var before = field === "chairs" ? JSON.stringify(oldRecord.getStringSlice(field) || []) : String(oldRecord.get(field) || "")
      var after = field === "chairs" ? JSON.stringify(e.record.getStringSlice(field) || []) : String(e.record.get(field) || "")
      if (before !== after) throw e.forbiddenError("Only platform administrators may change society identity, visibility, or leadership bindings")
    }
  }
  e.next()
}, "societies")
