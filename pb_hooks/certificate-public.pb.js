/// <reference path="../pb_data/types.d.ts" />

var TOKEN_RE = /^[A-Za-z0-9]{48}$/
var RENDER_HEADER = "X-Certificate-Render-Capability"

function noStore(e) {
  e.response.header().set("Cache-Control", "no-store")
  e.response.header().set("X-Content-Type-Options", "nosniff")
}

function invalid(e) {
  noStore(e)
  return e.json(404, { status: "INVALID" })
}

function certificateByToken(token) {
  if (!TOKEN_RE.test(String(token || ""))) return null
  var rows = []
  try {
    rows = $app.findRecordsByFilter(
      "certificates",
      "verificationToken = {:token}",
      "",
      1,
      0,
      { token: token }
    )
  } catch (_) { rows = [] }
  return rows.length ? rows[0] : null
}

function publicStatus(record) {
  var value = String(record && record.getString("status") || "").toUpperCase()
  return ["ACTIVE", "REVOKED", "SUPERSEDED"].indexOf(value) !== -1 ? value : "INVALID"
}

function verificationPayload(record) {
  return {
    recipientName: record.getString("recipientNameSnapshot") || "",
    event: record.getString("eventTitleSnapshot") || "",
    certificateType: record.getString("certificateType") || "",
    credentialId: record.getString("credentialId") || "",
    issueDate: record.getString("issuedAt") || "",
    issuer: record.getString("issuerNameSnapshot") || "IEEE Sahrdaya Student Branch",
    status: publicStatus(record),
  }
}

function renderCapability(e) {
  var configured = String($os.getenv("CERTIFICATE_RENDER_CAPABILITY_KEY") || "").trim()
  if (configured.length < 32) {
    noStore(e)
    e.json(503, { code: "RENDER_CAPABILITY_UNCONFIGURED", error: "Certificate rendering is unavailable" })
    return false
  }
  var supplied = String(e.request.header.get(RENDER_HEADER) || "")
  if (supplied !== configured) {
    noStore(e)
    e.json(403, { code: "RENDER_CAPABILITY_REQUIRED", error: "Certificate render capability required" })
    return false
  }
  return true
}

function renderContext(e) {
  if (!renderCapability(e)) return null
  var token = String(e.request.pathValue("token") || "")
  var certificate = certificateByToken(token)
  if (!certificate) {
    invalid(e)
    return null
  }
  var template = null
  try { template = $app.findRecordById("certificate_templates", certificate.getString("template") || "") } catch (_) {}
  if (!template || !template.getString("renderBase")) {
    noStore(e)
    e.json(409, { code: "RENDER_INPUT_UNAVAILABLE", error: "Certificate render input is unavailable" })
    return null
  }
  return { certificate: certificate, template: template }
}

routerAdd("GET", "/api/app/certificates/verify/{token}", function (e) {
  var token = String(e.request.pathValue("token") || "")
  var certificate = certificateByToken(token)
  if (!certificate) return invalid(e)
  noStore(e)
  return e.json(200, verificationPayload(certificate))
})

routerAdd("GET", "/api/app/certificates/render/{token}/manifest", function (e) {
  var ctx = renderContext(e)
  if (!ctx) return
  var rules = require(__hooks + "/certificate-template-rules.js")
  noStore(e)
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
  var ctx = renderContext(e)
  if (!ctx) return
  var filename = ctx.template.getString("renderBase") || ""
  var contentType = /\.webp$/i.test(filename) ? "image/webp" : "image/png"
  var fs = $app.newFilesystem()
  var reader = null
  try {
    reader = fs.getReader(ctx.template.baseFilesPath() + "/" + filename)
    noStore(e)
    return e.stream(200, contentType, reader)
  } finally {
    try { if (reader) reader.close() } catch (_) {}
    try { fs.close() } catch (_) {}
  }
})
