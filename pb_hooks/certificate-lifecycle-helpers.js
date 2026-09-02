function clean(value) {
  return String(value == null ? "" : value).trim()
}

function body(e) {
  try { return e.requestInfo().body || {} } catch (_) { return {} }
}

function error(e, status, code, message, extra) {
  var payload = { code: code, error: message }
  Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key] })
  return e.json(status, payload)
}

function eventRecord(app, id) {
  try { return app.findRecordById("events", clean(id)) } catch (_) { return null }
}

function certificateRecord(app, id) {
  try { return app.findRecordById("certificates", clean(id)) } catch (_) { return null }
}

function templateRecord(app, id) {
  try { return app.findRecordById("certificate_templates", clean(id)) } catch (_) { return null }
}

function batchRecord(app, id) {
  try { return app.findRecordById("certificate_batches", clean(id)) } catch (_) { return null }
}

function canRevoke(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.revoke", event)
}

function routeContext(app, e) {
  var eventId = clean(e.request.pathValue("eventId"))
  var certificateId = clean(e.request.pathValue("certificateId"))
  var event = eventRecord(app, eventId)
  if (!event) return { status: 404, code: "EVENT_NOT_FOUND", message: "Event not found" }
  if (!canRevoke(app, e.auth, event)) return { status: 403, code: "FORBIDDEN", message: "You cannot revoke or replace certificates for this event" }
  var certificate = certificateRecord(app, certificateId)
  if (!certificate || certificate.getString("event") !== eventId) {
    return { status: 404, code: "CERTIFICATE_NOT_FOUND", message: "Certificate not found" }
  }
  return { event: event, certificate: certificate }
}

function siteUrl() {
  return clean($os.getenv("SITE_URL") || "https://ieeesahrdaya.com").replace(/\/+$/, "") || "https://ieeesahrdaya.com"
}

function validEmail(value) {
  var email = clean(value)
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function reason(input) {
  var value = clean(input && input.reason).slice(0, 4000)
  return value.length >= 5 ? value : ""
}

function credentialPayload(record) {
  return {
    certificateId: record.id,
    eventId: record.getString("event") || "",
    registrationId: record.getString("registration") || "",
    batchId: record.getString("batch") || "",
    templateId: record.getString("template") || "",
    certificateType: record.getString("certificateType") || "",
    recipientName: record.getString("recipientNameSnapshot") || "",
    recipientEmail: record.getString("recipientEmailSnapshot") || "",
    credentialId: record.getString("credentialId") || "",
    status: record.getString("status") || "active",
    issuedAt: record.getString("issuedAt") || "",
    revokedAt: record.getString("revokedAt") || "",
    revocationReason: record.getString("revocationReason") || "",
    supersedesId: record.getString("supersedes") || "",
    supersededById: record.getString("supersededBy") || "",
    metadataVersion: record.getInt("metadataVersion") || 1,
    verificationUrl: siteUrl() + "/c/" + encodeURIComponent(record.getString("verificationToken") || ""),
  }
}

function outboxForCertificate(app, certificateId) {
  try {
    return app.findFirstRecordByFilter("notification_outbox", "kind = 'certificate' && certificate = {:certificate}", { certificate: certificateId })
  } catch (_) { return null }
}

function cancelUnsentDelivery(app, certificate, message) {
  var row = outboxForCertificate(app, certificate.id)
  if (!row || row.getString("status") === "sent") return row
  row.set("status", "failed")
  row.set("attempts", 8)
  row.set("nextAttemptAt", "")
  row.set("lastError", clean(message).slice(0, 3900))
  app.saveNoValidate(row)
  return row
}

function replacementTemplate(app, eventId, certificateType, currentTemplateId, requestedTemplateId) {
  var requested = clean(requestedTemplateId)
  if (!requested) {
    var current = templateRecord(app, currentTemplateId)
    return current && current.getString("renderBase") ? current : null
  }
  var template = templateRecord(app, requested)
  if (!template) return null
  if (template.getString("event") !== eventId) return null
  if (template.getString("certificateType") !== certificateType) return null
  if (template.getString("status") !== "published") return null
  if (!template.getString("renderBase")) return null
  return template
}

function correctionBatch(app, input) {
  var rules = require(__hooks + "/certificate-template-rules.js")
  var fingerprint = $security.sha256(rules.stableStringify({
    kind: "certificate-supersede",
    certificateId: input.oldCertificate.id,
    templateId: input.template.id,
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
  }))
  var idempotencyKey = $security.sha256("certificate-supersede:" + input.oldCertificate.id)
  var registrationId = input.oldCertificate.getString("registration") || ""
  var batch = new Record(app.findCollectionByNameOrId("certificate_batches"), {
    event: input.event.id,
    template: input.template.id,
    audienceType: "selected",
    audienceConfig: { registrationIds: [registrationId] },
    audienceFingerprint: fingerprint,
    audienceSnapshot: { recipients: [{ id: registrationId, name: input.recipientName, email: input.recipientEmail }], excluded: [] },
    idempotencyKey: idempotencyKey,
    status: "issued",
    recipientCount: 1,
    issuedCount: 1,
    emailEligibleCount: input.recipientEmail ? 1 : 0,
    queuedCount: 0,
    sentCount: 0,
    failedCount: 0,
    missingEmailCount: input.recipientEmail ? 0 : 1,
    createdBy: input.actor.id,
    issuedBy: input.actor.id,
    issuedAt: input.issuedAt,
    note: ("Replacement for " + input.oldCertificate.getString("credentialId") + ": " + input.reason).slice(0, 4000),
  })
  app.save(batch)
  return batch
}

function existingReplacement(app, certificate) {
  var id = certificate && certificate.getString("supersededBy")
  return id ? certificateRecord(app, id) : null
}

function issuerName(auth) {
  return clean(auth && auth.getString("name")) || "IEEE Sahrdaya Student Branch"
}

module.exports = {
  batchRecord: batchRecord,
  body: body,
  canRevoke: canRevoke,
  cancelUnsentDelivery: cancelUnsentDelivery,
  certificateRecord: certificateRecord,
  correctionBatch: correctionBatch,
  credentialPayload: credentialPayload,
  error: error,
  eventRecord: eventRecord,
  existingReplacement: existingReplacement,
  issuerName: issuerName,
  reason: reason,
  replacementTemplate: replacementTemplate,
  routeContext: routeContext,
  validEmail: validEmail,
}
