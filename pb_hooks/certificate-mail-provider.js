function clean(value) {
  return String(value == null ? "" : value).trim()
}

function providerName() {
  var value = clean($os.getenv("CERTIFICATE_MAIL_PROVIDER")).toLowerCase()
  return value === "resend" ? "resend" : "smtp"
}

function resendConfig() {
  return {
    apiBaseUrl: clean($os.getenv("RESEND_API_BASE_URL") || "https://api.resend.com").replace(/\/+$/, ""),
    apiKey: clean($os.getenv("RESEND_API_KEY")),
    from: clean($os.getenv("RESEND_FROM")),
  }
}

function permanentError(message, code) {
  var err = new Error(message)
  err.code = code || "MAIL_PROVIDER_CONFIGURATION"
  err.mailDeliveryPermanent = true
  return err
}

function responseMessage(response) {
  if (response && response.json && typeof response.json === "object") {
    return clean(response.json.message || response.json.error || response.json.name)
  }
  return ""
}

function sendWithResend(delivery, idempotencyKey) {
  var config = resendConfig()
  if (!config.apiKey || !config.from) throw permanentError("Resend certificate mail provider is not fully configured", "RESEND_NOT_CONFIGURED")
  var response = $http.send({
    url: config.apiBaseUrl + "/emails",
    method: "POST",
    timeout: 10,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + config.apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": clean(idempotencyKey),
    },
    body: JSON.stringify({
      from: config.from,
      to: [delivery.recipient],
      subject: delivery.subject,
      html: delivery.html,
      text: delivery.text,
      tags: [
        { name: "kind", value: "certificate" },
        { name: "outbox", value: record.id },
      ],
    }),
  })
  if ((response.statusCode === 200 || response.statusCode === 201) && response.json && response.json.id) {
    return { provider: "resend", providerMessageId: clean(response.json.id), providerStatus: "accepted" }
  }
  var message = responseMessage(response) || ("Resend returned HTTP " + response.statusCode)
  var err = new Error(message.slice(0, 3900))
  err.code = "RESEND_SEND_FAILED"
  if (response.statusCode >= 400 && response.statusCode < 500 && response.statusCode !== 429) err.mailDeliveryPermanent = true
  throw err
}

function sendWithSmtp(app, from, delivery) {
  if (!from.smtpEnabled) throw permanentError("SMTP delivery is not configured", "SMTP_NOT_CONFIGURED")
  if (!from.address) throw permanentError("Email sender is not configured", "SMTP_SENDER_NOT_CONFIGURED")
  var message = new MailerMessage({
    from: from,
    to: [{ address: delivery.recipient }],
    subject: delivery.subject,
    html: delivery.html,
    text: delivery.text,
  })
  app.newMailClient().send(message)
  return { provider: "smtp", providerMessageId: "", providerStatus: "accepted" }
}

function send(app, record, from, delivery) {
  if (providerName() !== "resend") return sendWithSmtp(app, from, delivery)
  var key = (clean(record.getString("dedupeKey")) || ("certificate:" + record.id)) + ":" + String(record.getInt("providerSendSequence") || 0)
  return sendWithResend(delivery, key)
}

function sendTest(app, from, delivery) {
  if (providerName() !== "resend") return sendWithSmtp(app, from, delivery)
  return sendWithResend(delivery, "certificate-test:" + $security.randomString(24))
}

function terminalIssue(status) {
  return ["bounced", "failed", "suppressed", "complained"].indexOf(clean(status).toLowerCase()) !== -1
}

function retryableProviderIssue(status) {
  return ["bounced", "failed"].indexOf(clean(status).toLowerCase()) !== -1
}

module.exports = {
  providerName: providerName,
  retryableProviderIssue: retryableProviderIssue,
  send: send,
  sendTest: sendTest,
  terminalIssue: terminalIssue,
}
