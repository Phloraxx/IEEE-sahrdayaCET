var AUDIENCE_TYPES = ["selected", "checked_in", "confirmed", "attendance_qualified"]

function uniqueSorted(values) {
  var seen = {}
  var out = []
  ;(values || []).forEach(function (value) {
    var id = String(value || "").trim()
    if (!id || seen[id]) return
    seen[id] = true
    out.push(id)
  })
  out.sort()
  return out
}

function objectValue(value) {
  if (!value) return {}
  if (value && typeof value.string === "function") value = value.string()
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function normalizeAudienceConfig(type, input) {
  var raw = objectValue(input)
  if (type === "selected") {
    return { registrationIds: uniqueSorted(raw.registrationIds || []) }
  }
  return {}
}
function validEmail(value) {
  var email = String(value || "").trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function audienceInputErrors(type, config) {
  var errors = []
  if (AUDIENCE_TYPES.indexOf(type) === -1) errors.push("Invalid certificate audience type")
  if (type === "attendance_qualified") errors.push("Attendance-qualified audiences require recorded attendance sessions")
  if (type === "selected" && !(config.registrationIds || []).length) {
    errors.push("Select at least one registration")
  }
  if (type === "selected" && (config.registrationIds || []).length > 2000) {
    errors.push("Selected audience exceeds the supported batch size")
  }
  return errors
}

function fingerprintPayload(input) {
  return {
    eventId: String(input.eventId || ""),
    templateId: String(input.templateId || ""),
    templateContentHash: String(input.templateContentHash || ""),
    certificateType: String(input.certificateType || ""),
    audienceType: String(input.audienceType || ""),
    audienceConfig: normalizeAudienceConfig(input.audienceType, input.audienceConfig),
    recipients: (input.recipients || []).map(function (row) {
      return { id: row.id, name: row.name, email: row.email }
    }),
  }
}
function stableStringify(value) {
  return require(__hooks + "/certificate-template-rules.js").stableStringify(value)
}

function fingerprint(input) {
  return $security.sha256(stableStringify(fingerprintPayload(input)))
}

function issueKey(input) {
  return $security.sha256(stableStringify({
    eventId: String(input.eventId || ""),
    templateId: String(input.templateId || ""),
    audienceType: String(input.audienceType || ""),
    audienceConfig: normalizeAudienceConfig(input.audienceType, input.audienceConfig),
    audienceFingerprint: String(input.audienceFingerprint || ""),
  }))
}

module.exports = {
  AUDIENCE_TYPES: AUDIENCE_TYPES,
  audienceInputErrors: audienceInputErrors,
  fingerprint: fingerprint,
  fingerprintPayload: fingerprintPayload,
  issueKey: issueKey,
  normalizeAudienceConfig: normalizeAudienceConfig,
  objectValue: objectValue,
  uniqueSorted: uniqueSorted,
  validEmail: validEmail,
}
