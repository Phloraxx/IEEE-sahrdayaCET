function clean(value) {
  return String(value || "").trim()
}

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function parseEmailList(raw) {
  var parts = clean(raw).split(/[;,\s]+/)
  var seen = {}
  var result = []
  for (var i = 0; i < parts.length; i++) {
    var email = normalizeEmail(parts[i])
    if (!email || seen[email]) continue
    seen[email] = true
    result.push(email)
  }
  return result
}

function normalizedMode(rawMode, deployEnv) {
  var env = clean(deployEnv).toLowerCase()
  var mode = clean(rawMode).toLowerCase()
  if (!mode) return env === "production" ? "live" : "disabled"
  if (["disabled", "allowlist", "redirect", "live"].indexOf(mode) === -1) return "disabled"
  return mode
}

function resolveDelivery(options) {
  options = options || {}
  var deployEnv = clean(options.deployEnv).toLowerCase() || "unknown"
  var recipient = clean(options.recipient)
  var normalizedRecipient = normalizeEmail(recipient)
  var requestedMode = clean(options.mode).toLowerCase()
  var mode = normalizedMode(requestedMode, deployEnv)
  if (!recipient) return { allowed: false, mode: mode, reason: "recipient_missing" }
  if (requestedMode && requestedMode !== mode && mode === "disabled") {
    return { allowed: false, mode: mode, reason: "invalid_mode" }
  }

  if (mode === "disabled") return { allowed: false, mode: mode, reason: "delivery_disabled" }

  if (mode === "live") {
    if (deployEnv !== "production") {
      return { allowed: false, mode: mode, reason: "live_not_allowed_outside_production" }
    }
    return { allowed: true, mode: mode, recipient: recipient, originalRecipient: recipient, deployEnv: deployEnv }
  }

  if (mode === "allowlist") {
    var allowed = parseEmailList(options.allowlist)
    if (allowed.indexOf(normalizedRecipient) === -1) {
      return { allowed: false, mode: mode, reason: "recipient_not_allowlisted" }
    }
    return { allowed: true, mode: mode, recipient: recipient, originalRecipient: recipient, deployEnv: deployEnv }
  }

  var redirectTo = clean(options.redirectTo)
  if (!redirectTo) return { allowed: false, mode: mode, reason: "redirect_target_missing" }
  return { allowed: true, mode: mode, recipient: redirectTo, originalRecipient: recipient, deployEnv: deployEnv }
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
function currentResolution(recipient) {
  return resolveDelivery({
    deployEnv: $os.getenv("DEPLOY_ENV"),
    mode: $os.getenv("MAIL_DELIVERY_MODE"),
    allowlist: $os.getenv("MAIL_ALLOWLIST"),
    redirectTo: $os.getenv("MAIL_REDIRECT_TO"),
    recipient: recipient,
  })
}

function prepare(recipient, template) {
  var resolution = currentResolution(recipient)
  if (!resolution.allowed) {
    var err = new Error("Mail delivery blocked by safety policy: " + resolution.reason)
    err.code = "MAIL_DELIVERY_BLOCKED"
    err.mailDeliveryPermanent = true
    err.mailDeliveryReason = resolution.reason
    throw err
  }

  template = template || {}
  if (resolution.mode === "live") {
    return {
      recipient: resolution.recipient,
      subject: clean(template.subject),
      html: String(template.html || ""),
      text: String(template.text || ""),
      mode: resolution.mode,
    }
  }

  var envLabel = clean(resolution.deployEnv || "non-production").toUpperCase()
  var intended = resolution.originalRecipient
  var prefix = "[" + envLabel + " TEST] "
  var bannerText = envLabel + " TEST DELIVERY — intended recipient: " + intended
  var bannerHtml = '<div style="padding:12px 16px;margin:0 0 16px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;font:600 13px Arial,sans-serif">' + escapeHtml(bannerText) + "</div>"

  return {
    recipient: resolution.recipient,
    subject: prefix + clean(template.subject),
    html: bannerHtml + String(template.html || ""),
    text: bannerText + "\n\n" + String(template.text || ""),
    mode: resolution.mode,
  }
}

module.exports = {
  normalizeEmail: normalizeEmail,
  parseEmailList: parseEmailList,
  normalizedMode: normalizedMode,
  resolveDelivery: resolveDelivery,
  currentResolution: currentResolution,
  prepare: prepare,
}
