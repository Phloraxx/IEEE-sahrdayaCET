function objectValue(value) {
  if (!value) return {}
  if (value && typeof value.string === "function") {
    try { value = value.string() } catch (_) { return {} }
  }
  if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function numberIn(value, min, max) {
  var n = Number(value)
  return isFinite(n) && n >= min && n <= max
}

function colorValue(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ""))
}

var ALLOWED_PLACEHOLDERS = [
  "name", "firstName", "eventTitle", "credentialId",
  "verificationUrl", "certificateType", "issueDate"
]

function unknownPlaceholders(value) {
  var out = []
  var re = /{{\s*([A-Za-z0-9_]+)\s*}}/g
  var match
  while ((match = re.exec(String(value || ""))) !== null) {
    if (ALLOWED_PLACEHOLDERS.indexOf(match[1]) === -1 && out.indexOf(match[1]) === -1) out.push(match[1])
  }
  return out
}
function validateLayout(value) {
  var layout = objectValue(value)
  var errors = []
  var name = objectValue(layout.name)
  var credential = objectValue(layout.credentialId)
  var qr = objectValue(layout.qr)

  if (!numberIn(name.x, 0, 1) || !numberIn(name.y, 0, 1)) errors.push("Participant name position is invalid")
  if (!numberIn(name.maxWidth, 0.1, 0.95)) errors.push("Participant name max width is invalid")
  if (!numberIn(name.preferredFontSize, 20, 360)) errors.push("Participant name preferred font size is invalid")
  if (!numberIn(name.minFontSize, 16, Number(name.preferredFontSize || 0))) errors.push("Participant name minimum font size is invalid")
  if (["left", "center", "right"].indexOf(String(name.align || "")) === -1) errors.push("Participant name alignment is invalid")
  if (!colorValue(name.color)) errors.push("Participant name color is invalid")
  if (["noto-sans", "noto-serif"].indexOf(String(name.fontFamily || "")) === -1) errors.push("Participant name font is invalid")

  if (!numberIn(credential.x, 0, 1) || !numberIn(credential.y, 0, 1)) errors.push("Credential ID position is invalid")
  if (!numberIn(credential.fontSize, 12, 120)) errors.push("Credential ID font size is invalid")
  if (["left", "center", "right"].indexOf(String(credential.align || "")) === -1) errors.push("Credential ID alignment is invalid")
  if (!colorValue(credential.color)) errors.push("Credential ID color is invalid")

  if (qr.enabled !== undefined && qr.enabled !== true && qr.enabled !== false) errors.push("QR enabled state is invalid")
  var qrEnabled = qr.enabled === undefined ? true : qr.enabled === true
  if (qrEnabled) {
    if (!numberIn(qr.x, 0, 1) || !numberIn(qr.y, 0, 1)) errors.push("QR position is invalid")
    if (!numberIn(qr.size, 0.04, 0.35)) errors.push("QR size is invalid")
  }
  return { valid: errors.length === 0, errors: errors, layout: layout }
}

function publicationErrors(input) {
  input = input || {}
  var errors = []
  if (!String(input.renderBase || "")) errors.push("A flattened render-base PNG is required")
  if (!numberIn(input.canvasWidth, 1000, 6000) || !numberIn(input.canvasHeight, 700, 6000)) errors.push("Certificate canvas dimensions are invalid")
  if (Number(input.canvasWidth || 0) * Number(input.canvasHeight || 0) > 24000000) errors.push("Certificate canvas is too large")
  var layoutResult = validateLayout(input.layout)
  errors = errors.concat(layoutResult.errors)
  if (!String(input.emailSubject || "").trim()) errors.push("Email subject is required")
  if (!String(input.emailText || "").trim()) errors.push("Email body is required")
  var unknown = unknownPlaceholders(String(input.emailSubject || "") + "\n" + String(input.emailText || ""))
  if (unknown.length) errors.push("Unknown email placeholders: " + unknown.join(", "))
  return errors
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== "object") return value
  var out = {}
  Object.keys(value).sort().forEach(function (key) { out[key] = stableValue(value[key]) })
  return out
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function recordSnapshot(record) {
  return {
    name: record.getString("name") || "",
    scopeType: record.getString("scopeType") || "",
    society: record.getString("society") || "",
    event: record.getString("event") || "",
    certificateType: record.getString("certificateType") || "",
    version: record.getFloat("version") || 0,
    sourceBackground: record.getString("sourceBackground") || "",
    sourceSignatures: record.getStringSlice("sourceSignatures") || [],
    renderBase: record.getString("renderBase") || "",
    canvasWidth: record.getFloat("canvasWidth") || 0,
    canvasHeight: record.getFloat("canvasHeight") || 0,
    layout: objectValue(record.get("layout")),
    emailSubject: record.getString("emailSubject") || "",
    emailText: record.getString("emailText") || "",
    emailHtml: record.getString("emailHtml") || "",
    contentHash: record.getString("contentHash") || "",
    publishedBy: record.getString("publishedBy") || "",
    publishedAt: record.getString("publishedAt") || ""
  }
}

module.exports = {
  ALLOWED_PLACEHOLDERS: ALLOWED_PLACEHOLDERS,
  objectValue: objectValue,
  publicationErrors: publicationErrors,
  recordSnapshot: recordSnapshot,
  stableStringify: stableStringify,
  unknownPlaceholders: unknownPlaceholders,
  validateLayout: validateLayout,
}
