var AUDIENCE_TYPES = ["selected", "checked_in", "confirmed", "attendance_qualified"]

var TEMPLATE_STRESS_NAMES = [
  "A. B. Roy",
  "Alexandra Joseph",
  "Mohammed Abdul Rahman Kizhakkedath",
  "Anne-Marie O'Connor",
  "Sourav P Bijoy",
  "José María Fernández",
  "Nivedita Krishnakumar Varghese",
]

function glyphWidthEm(character) {
  if (/\s/.test(character)) return 0.3
  if (/[ilI1.,'`|]/.test(character)) return 0.3
  if (/[MW@%&]/.test(character)) return 0.9
  if (/[A-Z]/.test(character)) return 0.64
  return 0.56
}

function estimatedNameWidthEm(value) {
  var text = String(value || "").trim()
  var total = 0
  for (var i = 0; i < text.length; i++) total += glyphWidthEm(text.charAt(i))
  return total
}

function nameRenderWarnings(name, layout, canvasWidth) {
  name = String(name || "").trim()
  layout = objectValue(layout)
  var nameLayout = objectValue(layout.name)
  var width = Number(canvasWidth || 0)
  var maxWidth = Number(nameLayout.maxWidth || 0)
  var preferred = Number(nameLayout.preferredFontSize || 0)
  var minimum = Number(nameLayout.minFontSize || 0)
  if (!name || width <= 0 || maxWidth <= 0 || preferred <= 0 || minimum <= 0) return []
  var available = width * maxWidth
  var em = estimatedNameWidthEm(name)
  var preferredWidth = em * preferred
  var minimumWidth = em * minimum
  var warnings = []
  if (minimumWidth > available) {
    warnings.push({
      code: "likely_overflow",
      severity: "high",
      name: name,
      message: "Name may not fit even at the configured minimum font size; inspect the rendered credential before issuing.",
    })
  } else if (preferredWidth > available) {
    warnings.push({
      code: "auto_fit",
      severity: "medium",
      name: name,
      message: "Name will require font auto-fit below the preferred size.",
    })
  }
  if (/[^\u0000-\u024F\u1E00-\u1EFF]/.test(name)) {
    warnings.push({
      code: "font_coverage_review",
      severity: "medium",
      name: name,
      message: "Name contains characters outside the built-in Latin stress set; inspect font coverage before issuing.",
    })
  }
  return warnings
}

function templateNameWarnings(layout, canvasWidth) {
  var warnings = []
  for (var i = 0; i < TEMPLATE_STRESS_NAMES.length; i++) {
    var rows = nameRenderWarnings(TEMPLATE_STRESS_NAMES[i], layout, canvasWidth)
    for (var j = 0; j < rows.length; j++) warnings.push(rows[j])
  }
  return warnings
}

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
  TEMPLATE_STRESS_NAMES: TEMPLATE_STRESS_NAMES,
  audienceInputErrors: audienceInputErrors,
  fingerprint: fingerprint,
  fingerprintPayload: fingerprintPayload,
  issueKey: issueKey,
  nameRenderWarnings: nameRenderWarnings,
  templateNameWarnings: templateNameWarnings,
  normalizeAudienceConfig: normalizeAudienceConfig,
  objectValue: objectValue,
  uniqueSorted: uniqueSorted,
  validEmail: validEmail,
}
