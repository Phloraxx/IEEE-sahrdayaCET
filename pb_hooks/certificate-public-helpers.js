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

function certificateByToken(app, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null
  try {
    return app.findFirstRecordByData("certificates", "verificationToken", String(token))
  } catch (_) {
    return null
  }
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

function renderContext(e, app) {
  if (!renderCapability(e)) return null
  var token = String(e.request.pathValue("token") || "")
  var certificate = certificateByToken(app, token)
  if (!certificate) {
    invalid(e)
    return null
  }
  var template = null
  try { template = app.findRecordById("certificate_templates", certificate.getString("template") || "") } catch (_) {}
  if (!template || !template.getString("renderBase")) {
    noStore(e)
    e.json(409, { code: "RENDER_INPUT_UNAVAILABLE", error: "Certificate render input is unavailable" })
    return null
  }
  return { certificate: certificate, template: template }
}

module.exports = {
  certificateByToken: certificateByToken,
  invalid: invalid,
  noStore: noStore,
  renderContext: renderContext,
  verificationPayload: verificationPayload,
}
