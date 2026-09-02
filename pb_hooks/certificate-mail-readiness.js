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
function providerState(app) {
  var provider = require(__hooks + "/certificate-mail-provider.js").providerName()
  if (provider === "resend") {
    var apiKey = clean($os.getenv("RESEND_API_KEY"))
    var from = clean($os.getenv("RESEND_FROM"))
    var capability = clean($os.getenv("CERTIFICATE_MAIL_WEBHOOK_CAPABILITY_KEY"))
    var webhookConfigured = clean($os.getenv("RESEND_WEBHOOK_CONFIGURED")) === "1"
    var trackingReady = capability.length >= 32 && webhookConfigured
    return {
      provider: provider,
      transportReady: apiKey.length >= 8 && from.length > 0,
      trackingReady: trackingReady,
      trackingMode: trackingReady ? "delivery_tracked" : "accepted_only",
      reason: apiKey.length >= 8 && from.length > 0 ? "" : "resend_not_configured",
    }
  }
  var settings = app.settings()
  var sender = clean(settings.meta && settings.meta.senderAddress)
  var smtp = settings.smtp || {}
  var smtpEnabled = smtp.enabled === true
  var smtpHost = clean(smtp.host)
  var smtpPort = Number(smtp.port || 0)
  var smtpReady = smtpEnabled && smtpHost.length > 0 && isFinite(smtpPort) && smtpPort > 0 && validEmail(sender)
  return {
    provider: "smtp",
    transportReady: smtpReady,
    trackingReady: false,
    trackingMode: "accepted_only",
    reason: smtpReady ? "" : "smtp_not_configured",
  }
}
function messageFor(state) {
  if (!state.safetyReady) {
    if (state.deliveryMode === "disabled") return "Mail delivery is disabled in this environment."
    return "Mail safety configuration is incomplete for this environment."
  }
  if (!state.transportReady) return state.provider === "resend"
    ? "Resend is selected but its API key or From address is missing."
    : "SMTP is selected but PocketBase SMTP/sender settings are incomplete."
  if (state.provider === "resend" && !state.trackingReady) {
    return "Resend can accept mail, but delivery-event tracking is not fully configured."
  }
  return state.provider === "resend"
    ? "Resend transport and delivery tracking are ready."
    : "SMTP is ready. Final inbox delivery cannot be confirmed by SMTP alone."
}

function readiness(app) {
  var safety = safetyState()
  var provider = providerState(app)
  var state = {
    provider: provider.provider,
    deliveryMode: safety.mode,
    safetyReady: safety.ready,
    transportReady: provider.transportReady,
    trackingReady: provider.trackingReady,
    trackingMode: provider.trackingMode,
    readyToQueue: safety.ready && provider.transportReady,
    reason: safety.reason || provider.reason || "",
  }
  state.message = messageFor(state)
  return state
}

module.exports = { readiness: readiness }
