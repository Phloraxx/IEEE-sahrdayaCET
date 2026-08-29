/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/certificates/verify/{token}", function (e) {
  var h = require(__hooks + "/certificate-public-helpers.js")
  var token = String(e.request.pathValue("token") || "")
  var certificate = h.certificateByToken($app, token)
  if (!certificate) return h.invalid(e)
  h.noStore(e)
  return e.json(200, h.verificationPayload(certificate))
})

routerAdd("GET", "/api/app/certificates/render/{token}/manifest", function (e) {
  var h = require(__hooks + "/certificate-public-helpers.js")
  var ctx = h.renderContext(e, $app)
  if (!ctx) return
  var rules = require(__hooks + "/certificate-template-rules.js")
  h.noStore(e)
  return e.json(200, {
    recipientName: ctx.certificate.getString("recipientNameSnapshot") || "",
    credentialId: ctx.certificate.getString("credentialId") || "",
    canvasWidth: ctx.template.getFloat("canvasWidth") || 0,
    canvasHeight: ctx.template.getFloat("canvasHeight") || 0,
    layout: rules.objectValue(ctx.template.get("layout")),
    templateContentHash: ctx.template.getString("contentHash") || "",
  })
})

routerAdd("GET", "/api/app/certificates/render/{token}/render-base", function (e) {
  var h = require(__hooks + "/certificate-public-helpers.js")
  var ctx = h.renderContext(e, $app)
  if (!ctx) return
  var filename = ctx.template.getString("renderBase") || ""
  var contentType = /\.webp$/i.test(filename) ? "image/webp" : "image/png"
  var fs = $app.newFilesystem()
  var reader = null
  try {
    reader = fs.getReader(ctx.template.baseFilesPath() + "/" + filename)
    h.noStore(e)
    return e.stream(200, contentType, reader)
  } finally {
    try { if (reader) reader.close() } catch (_) {}
    try { fs.close() } catch (_) {}
  }
})
