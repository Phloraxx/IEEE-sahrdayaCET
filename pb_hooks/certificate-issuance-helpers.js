function body(e) {
  try { return e.requestInfo().body || {} } catch (_) { return {} }
}

function error(e, status, code, message, extra) {
  var payload = { code: code, error: message }
  Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key] })
  return e.json(status, payload)
}

function eventRecord(app, id) {
  try { return app.findRecordById("events", String(id || "")) } catch (_) { return null }
}

function templateRecord(app, id) {
  try { return app.findRecordById("certificate_templates", String(id || "")) } catch (_) { return null }
}

function canIssue(app, auth, event) {
  if (!event) return false
  return require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.issue", event)
}

function publishedTemplate(app, eventId, templateId) {
  var template = templateRecord(app, templateId)
  if (!template || template.getString("event") !== String(eventId || "")) return null
  if (template.getString("status") !== "published") return null
  return template
}
function registrationRows(app, eventId) {
  try {
    return app.findRecordsByFilter(
      "registrations",
      "event = {:event}",
      "id",
      0,
      0,
      { event: eventId }
    )
  } catch (_) { return [] }
}

function activeCertificateMap(app, eventId, certificateType) {
  var rows = []
  try {
    rows = app.findRecordsByFilter(
      "certificates",
      "event = {:event} && certificateType = {:type} && status = 'active'",
      "",
      0,
      0,
      { event: eventId, type: certificateType }
    )
  } catch (_) { rows = [] }
  var map = {}
  rows.forEach(function (row) { map[row.getString("registration") || ""] = row.id })
  return map
}

function rowSnapshot(registration) {
  return {
    id: registration.id,
    name: String(registration.getString("userName") || "").trim(),
    email: String(registration.getString("userEmail") || "").trim(),
    registrationStatus: registration.getString("registrationStatus") || "",
    checkedIn: registration.getBool("checkedIn"),
    checkedInAt: registration.getString("checkedInAt") || "",
  }
}
function candidateForType(row, audienceType, selected) {
  if (audienceType === "selected") return Boolean(selected[row.id])
  if (audienceType === "checked_in") return row.checkedIn === true
  if (audienceType === "confirmed") return row.registrationStatus === "confirmed"
  return false
}

function exclusion(row, activeMap) {
  if (row.registrationStatus === "cancelled") return "cancelled"
  if (!row.name) return "missing_name"
  if (activeMap[row.id]) return "already_issued"
  return ""
}

function buildAudience(app, input) {
  var rules = require(__hooks + "/certificate-issuance-rules.js")
  var config = rules.normalizeAudienceConfig(input.audienceType, input.audienceConfig)
  var errors = rules.audienceInputErrors(input.audienceType, config)
  if (errors.length) return { error: errors.join(". "), config: config }

  var registrations = registrationRows(app, input.eventId)
  var activeMap = activeCertificateMap(app, input.eventId, input.certificateType)
  var selected = {}
  ;(config.registrationIds || []).forEach(function (id) { selected[id] = true })
  var seen = {}
  var recipients = []
  var excluded = []

  registrations.forEach(function (registration) {
    var row = rowSnapshot(registration)
    seen[row.id] = true
    if (!candidateForType(row, input.audienceType, selected)) return
    var reason = exclusion(row, activeMap)
    if (reason) {
      excluded.push({ id: row.id, name: row.name, email: row.email, reason: reason })
      return
    }
    recipients.push({
      id: row.id,
      name: row.name,
      email: row.email,
      emailEligible: rules.validEmail(row.email),
      checkedIn: row.checkedIn,
      checkedInAt: row.checkedInAt,
    })
  })
  if (input.audienceType === "selected") {
    ;(config.registrationIds || []).forEach(function (id) {
      if (!seen[id]) excluded.push({ id: id, name: "", email: "", reason: "not_found" })
    })
  }

  recipients.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0) })
  excluded.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0) })

  var fingerprint = rules.fingerprint({
    eventId: input.eventId,
    templateId: input.template.id,
    templateContentHash: input.template.getString("contentHash") || "",
    certificateType: input.certificateType,
    audienceType: input.audienceType,
    audienceConfig: config,
    recipients: recipients,
  })
  var emailEligibleCount = recipients.filter(function (row) { return row.emailEligible }).length
  var renderWarnings = []
  var templateLayout = rules.objectValue(input.template.get("layout"))
  var canvasWidth = input.template.getFloat("canvasWidth") || 0
  recipients.forEach(function (row) {
    var warnings = rules.nameRenderWarnings(row.name, templateLayout, canvasWidth)
    for (var wi = 0; wi < warnings.length; wi++) {
      var warning = warnings[wi]
      renderWarnings.push({
        registrationId: row.id,
        name: row.name,
        code: warning.code,
        severity: warning.severity,
        message: warning.message,
      })
    }
  })
  return {
    audienceType: input.audienceType,
    audienceConfig: config,
    fingerprint: fingerprint,
    recipients: recipients,
    excluded: excluded,
    recipientCount: recipients.length,
    emailEligibleCount: emailEligibleCount,
    missingEmailCount: recipients.length - emailEligibleCount,
    renderWarnings: renderWarnings,
  }
}

function previewPayload(audience, template) {
  return {
    template: {
      id: template.id,
      name: template.getString("name") || "",
      version: template.getFloat("version") || 1,
      certificateType: template.getString("certificateType") || "",
      contentHash: template.getString("contentHash") || "",
    },
    audienceType: audience.audienceType,
    audienceConfig: audience.audienceConfig,
    audienceFingerprint: audience.fingerprint,
    recipientCount: audience.recipientCount,
    emailEligibleCount: audience.emailEligibleCount,
    missingEmailCount: audience.missingEmailCount,
    renderWarnings: audience.renderWarnings || [],
    recipients: audience.recipients,
    excluded: audience.excluded,
  }
}

function batchPayload(batch) {
  return {
    id: batch.id,
    eventId: batch.getString("event") || "",
    templateId: batch.getString("template") || "",
    audienceType: batch.getString("audienceType") || "",
    audienceConfig: require(__hooks + "/certificate-issuance-rules.js").objectValue(batch.get("audienceConfig")),
    audienceFingerprint: batch.getString("audienceFingerprint") || "",
    status: batch.getString("status") || "",
    recipientCount: batch.getFloat("recipientCount") || 0,
    issuedCount: batch.getFloat("issuedCount") || 0,
    emailEligibleCount: batch.getFloat("emailEligibleCount") || 0,
    missingEmailCount: batch.getFloat("missingEmailCount") || 0,
    issuedAt: batch.getString("issuedAt") || "",
    note: batch.getString("note") || "",
  }
}

function existingBatch(app, idempotencyKey) {
  var rows = []
  try {
    rows = app.findRecordsByFilter(
      "certificate_batches",
      "idempotencyKey = {:key}",
      "-created",
      1,
      0,
      { key: idempotencyKey }
    )
  } catch (_) { rows = [] }
  return rows.length ? rows[0] : null
}
function certificateTypeCode(value) {
  var codes = {
    participation: "PART",
    completion: "COMP",
    achievement: "ACHV",
    appreciation: "APPR",
    volunteer: "VOL",
    speaker: "SPKR",
  }
  return codes[String(value || "")] || "CERT"
}

function issueYear(event, issuedAt) {
  var eventDate = event.getString("date") || ""
  var match = /^(\d{4})/.exec(eventDate)
  if (match) return match[1]
  return String(new Date(issuedAt).getUTCFullYear())
}

function credentialId(event, certificateType, issuedAt) {
  return "IEEESB-" + issueYear(event, issuedAt) + "-" + certificateTypeCode(certificateType) + "-" + $security.randomString(10).toUpperCase()
}

function verificationToken() {
  return $security.randomString(48)
}

function issuerName(auth) {
  return String((auth && auth.getString("name")) || "IEEE Sahrdaya Student Branch").trim()
}

module.exports = {
  batchPayload: batchPayload,
  body: body,
  buildAudience: buildAudience,
  canIssue: canIssue,
  credentialId: credentialId,
  error: error,
  eventRecord: eventRecord,
  existingBatch: existingBatch,
  issuerName: issuerName,
  previewPayload: previewPayload,
  publishedTemplate: publishedTemplate,
  verificationToken: verificationToken,
}

function certificateSummariesForBatch(app, batchId) {
  var rows = []
  try {
    rows = app.findRecordsByFilter("certificates", "batch = {:batch}", "credentialId", 0, 0, { batch: batchId })
  } catch (_) { rows = [] }
  return rows.map(function (row) {
    return {
      id: row.id,
      registrationId: row.getString("registration") || "",
      recipientName: row.getString("recipientNameSnapshot") || "",
      recipientEmail: row.getString("recipientEmailSnapshot") || "",
      credentialId: row.getString("credentialId") || "",
      status: row.getString("status") || "active",
    }
  })
}

module.exports.certificateSummariesForBatch = certificateSummariesForBatch

function candidateList(app, eventId) {
  var rows = registrationRows(app, eventId).map(rowSnapshot)
  rows.sort(function (a, b) {
    var an = String(a.name || "").toLowerCase()
    var bn = String(b.name || "").toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)
  })
  return rows
}

module.exports.candidateList = candidateList
