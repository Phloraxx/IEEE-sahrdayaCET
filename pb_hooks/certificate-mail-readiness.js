function clean(value) {
  return String(value == null ? "" : value).trim()
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value))
}

function safetyState() {
  var mail = require(__hooks + "/mail-delivery.js")
  var deployEnv = clean($os.getenv("DEPLOY_ENV")).toLowerCase() || "unknown"
  var mode = mail.normalizedMode($os.getenv("MAIL_DELIVERY_MODE"), deployEnv)
  if (mode === "disabled") return { ready: false, mode: mode, reason: "delivery_disabled" }
  if (mode === "live") return {
    ready: deployEnv === "production",
    mode: mode,
    reason: deployEnv === "production" ? "" : "live_not_allowed_outside_production",
  }
  if (mode === "allowlist") {
    var allowed = mail.parseEmailList($os.getenv("MAIL_ALLOWLIST"))
    return { ready: allowed.length > 0, mode: mode, reason: allowed.length ? "" : "allowlist_empty" }
  }
  var redirectTo = clean($os.getenv("MAIL_REDIRECT_TO"))
  return { ready: validEmail(redirectTo), mode: mode, reason: validEmail(redirectTo) ? "" : "redirect_target_missing" }
}

function smtpState(app) {
  var settings = app.settings()
  var sender = clean(settings.meta && settings.meta.senderAddress)
  var smtp = settings.smtp || {}
  var host = clean(smtp.host)
  var port = Number(smtp.port || 0)
  var ready = smtp.enabled === true && host.length > 0 && isFinite(port) && port > 0 && validEmail(sender)
  return {
    provider: "smtp",
    transportReady: ready,
    trackingReady: false,
    trackingMode: "accepted_only",
    reason: ready ? "" : "smtp_not_configured",
  }
}

function messageFor(state) {
  if (!state.safetyReady) {
    if (state.deliveryMode === "disabled") return "Mail delivery is disabled in this environment."
    return "Mail safety configuration is incomplete for this environment."
  }
  if (!state.transportReady) return "SMTP is not fully configured in PocketBase."
  return "SMTP is ready. Gmail can confirm handoff, but not final inbox delivery."
}

function readiness(app) {
  var safety = safetyState()
  var smtp = smtpState(app)
  var state = {
    provider: "smtp",
    deliveryMode: safety.mode,
    safetyReady: safety.ready,
    transportReady: smtp.transportReady,
    trackingReady: false,
    trackingMode: "accepted_only",
    readyToQueue: safety.ready && smtp.transportReady,
    reason: safety.reason || smtp.reason || "",
  }
  state.message = messageFor(state)
  return state
}

module.exports = { readiness: readiness }
