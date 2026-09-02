/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/certificates/registry", function (e) {
  var h = require(__hooks + "/certificate-registry-helpers.js")
  var result = h.registry($app, e.auth, e)
  if (result && result.forbidden) {
    return e.json(403, { code: "FORBIDDEN", error: "You cannot view certificates for this event" })
  }
  return e.json(200, result)
}, $apis.requireAuth("users"))
