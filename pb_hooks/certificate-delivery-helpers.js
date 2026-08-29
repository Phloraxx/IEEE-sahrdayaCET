function clean(value) {
  return String(value == null ? "" : value).trim()
}

function error(e, status, code, message, extra) {
  var payload = { code: code, error: message }
  Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key] })
  return e.json(status, payload)
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value))
}

function eventRecord(app, id) {
  try { return app.findRecordById("events", clean(id)) } catch (_) { return null }
}

function batchRecord(app, id) {
  try { return app.findRecordById("certificate_batches", clean(id)) } catch (_) { return null }
}

function templateRecord(app, id) {
  try { return app.findRecordById("certificate_templates", clean(id)) } catch (_) { return null }
}

function certificateRecord(app, id) {
  try { return app.findRecordById("certificates", clean(id)) } catch (_) { return null }
}

function canView(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.view", event)
}

function canSend(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.send", event)
}

function routeContext(app, e, capability) {
  var eventId = e.request.pathValue("eventId") || ""
  var batchId = e.request.pathValue("batchId") || ""
  var event = eventRecord(app, eventId)
  if (!event) return { status: 404, code: "EVENT_NOT_FOUND", message: "Event not found" }
  var allowed = capability === "send" ? canSend(app, e.auth, event) : canView(app, e.auth, event)
  if (!allowed) return {
    status: 403,
    code: "FORBIDDEN",
    message: capability === "send" ? "You cannot send certificates for this event" : "You cannot view certificate delivery for this event"
  }
  var batch = batchRecord(app, batchId)
  if (!batch || batch.getString("event") !== eventId) return { status: 404, code: "BATCH_NOT_FOUND", message: "Certificate batch not found" }
  return { event: event, batch: batch }
}

function certificateRows(app, batchId) {
  try {
    return app.findRecordsByFilter("certificates", "batch = {:batch}", "credentialId", 0, 0, { batch: batchId })
  } catch (_) { return [] }
}

function outboxRows(app, batchId) {
  try {
    return app.findRecordsByFilter(
      "notification_outbox",
      "kind = 'certificate' && certificateBatch = {:batch}",
      "id",
      0,
      0,
      { batch: batchId }
    )
  } catch (_) { return [] }
}

function outboxForCertificate(app, certificateId) {
  try {
    return app.findFirstRecordByFilter(
      "notification_outbox",
      "kind = 'certificate' && certificate = {:certificate}",
      { certificate: certificateId }
    )
  } catch (_) { return null }
}

function siteUrl() {
  var raw = clean($os.getenv("SITE_URL") || "https://ieeesahrdaya.com")
  return raw.replace(/\/+$/, "") || "https://ieeesahrdaya.com"
}

function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function titleCase(value) {
  return clean(value).replace(/(^|[_\s-]+)([a-z])/g, function (_, prefix, letter) {
    return (prefix ? " " : "") + letter.toUpperCase()
  })
}

function formatIssueDate(value) {
  var date = new Date(clean(value))
  if (isNaN(date.getTime())) return clean(value)
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return String(date.getUTCDate()).padStart(2, "0") + " " + months[date.getUTCMonth()] + " " + date.getUTCFullYear()
}

function interpolationValues(certificate) {
  var name = clean(certificate.getString("recipientNameSnapshot"))
  var verificationUrl = siteUrl() + "/c/" + encodeURIComponent(certificate.getString("verificationToken") || "")
  return {
    name: name,
    firstName: name.split(/\s+/)[0] || "Student",
    eventTitle: clean(certificate.getString("eventTitleSnapshot")),
    credentialId: clean(certificate.getString("credentialId")),
    verificationUrl: verificationUrl,
    certificateType: titleCase(certificate.getString("certificateType")),
    issueDate: formatIssueDate(certificate.getString("issuedAt")),
  }
}

function interpolate(value, values) {
  return String(value || "").replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, function (_, key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] || "") : ""
  })
}

function certificateEmail(app, certificate) {
  var template = templateRecord(app, certificate.getString("template"))
  if (!template) throw new Error("Certificate template no longer exists")
  var values = interpolationValues(certificate)
  var subject = interpolate(template.getString("emailSubject") || "Your certificate | {{eventTitle}}", values)
  var authoredText = interpolate(template.getString("emailText") || "Hi {{firstName}},\n\nYour certificate for {{eventTitle}} is ready.\n\nView and verify it: {{verificationUrl}}\nCredential ID: {{credentialId}}", values)
  var verificationUrl = values.verificationUrl
  var pdfUrl = verificationUrl + "/certificate.pdf"
  var bodyHtml = htmlEscape(authoredText).replace(/\r?\n/g, "<br>")
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#17212b">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 14px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border:1px solid #dfe5ea;border-radius:18px;overflow:hidden">' +
    '<tr><td style="padding:28px 30px 18px;border-top:5px solid #00629b">' +
    '<p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#00629b">IEEE Sahrdaya Student Branch</p>' +
    '<h1 style="margin:0;font-size:26px;line-height:1.15;color:#17212b">Your certificate is ready.</h1>' +
    '<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#53616d">' + bodyHtml + '</p>' +
    '</td></tr>' +
    '<tr><td style="padding:4px 30px 28px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f9fb;border:1px solid #e1e8ed;border-radius:12px"><tr><td style="padding:16px 18px">' +
    '<p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#7b8791">Credential ID</p>' +
    '<p style="margin:0;font:700 13px SFMono-Regular,Consolas,monospace;color:#17212b">' + htmlEscape(values.credentialId) + '</p>' +
    '</td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td align="center" style="background:#00629b;border-radius:9px;padding:13px 16px">' +
    '<a href="' + htmlEscape(verificationUrl) + '" style="display:block;color:#fff;text-decoration:none;font-size:13px;font-weight:700">View &amp; verify certificate</a>' +
    '</td></tr></table>' +
    '<p style="margin:13px 0 0;text-align:center;font-size:11px;color:#7b8791"><a href="' + htmlEscape(pdfUrl) + '" style="color:#00629b">Download PDF</a> · Verification remains authoritative if credential status changes.</p>' +
    '</td></tr>' +
    '</table>' +
    '<p style="margin:16px 0 0;font-size:10px;line-height:1.5;color:#8a949c">IEEE Sahrdaya Student Branch · Advancing Technology for Humanity</p>' +
    '</td></tr></table></body></html>'
  return { subject: subject, text: authoredText, html: html }
}

function enqueueCertificate(app, certificate, force) {
  if (!certificate || !certificate.id) return { record: null, created: false }
  if ((certificate.getString("status") || "") !== "active") return { record: null, created: false }
  var recipient = clean(certificate.getString("recipientEmailSnapshot"))
  if (!validEmail(recipient)) return { record: null, created: false }
  var existing = outboxForCertificate(app, certificate.id)
  if (existing) {
    var batchId = certificate.getString("batch") || ""
    if (batchId && existing.getString("certificateBatch") !== batchId) existing.set("certificateBatch", batchId)
    if (force && existing.getString("status") === "failed") {
      existing.set("status", "pending")
      existing.set("attempts", 0)
      existing.set("nextAttemptAt", new Date().toISOString())
      existing.set("lastAttemptAt", "")
      existing.set("sentAt", "")
      existing.set("lastError", "")
      existing.set("recipient", recipient)
    }
    app.save(existing)
    return { record: existing, created: false }
  }

  var record = new Record(app.findCollectionByNameOrId("notification_outbox"))
  record.set("registration", certificate.getString("registration"))
  record.set("certificate", certificate.id)
  record.set("certificateBatch", certificate.getString("batch"))
  record.set("kind", "certificate")
  record.set("status", "pending")
  record.set("recipient", recipient)
  record.set("dedupeKey", "certificate:" + certificate.id)
  record.set("attempts", 0)
  record.set("nextAttemptAt", new Date().toISOString())
  try { app.save(record) }
  catch (err) {
    var raced = outboxForCertificate(app, certificate.id)
    if (raced) return { record: raced, created: false }
    throw err
  }
  return { record: record, created: true }
}

function outboxMap(rows) {
  var result = {}
  for (var i = 0; i < rows.length; i++) result[rows[i].getString("certificate") || ""] = rows[i]
  return result
}

function terminalFailure(row) {
  return row && row.getString("status") === "failed" && (row.getInt("attempts") || 0) >= 8
}

function reconcileBatch(app, batch) {
  if (!batch) return null
  var rows = outboxRows(app, batch.id)
  var queued = rows.length
  var sent = 0
  var failed = 0
  var outstanding = false
  for (var i = 0; i < rows.length; i++) {
    var status = rows[i].getString("status") || "pending"
    if (status === "sent") sent++
    if (status === "failed") failed++
    if (status === "pending" || status === "sending" || (status === "failed" && !terminalFailure(rows[i]))) outstanding = true
  }

  batch.set("queuedCount", queued)
  batch.set("sentCount", sent)
  batch.set("failedCount", failed)
  if (queued > 0) {
    if (!batch.getString("sendStartedAt")) batch.set("sendStartedAt", new Date().toISOString())
    if (outstanding) {
      batch.set("status", "sending")
      batch.set("completedAt", "")
    } else if (failed > 0) {
      batch.set("status", "partial_failure")
      batch.set("completedAt", new Date().toISOString())
    } else if (sent === queued) {
      batch.set("status", "sent")
      if (!batch.getString("completedAt")) batch.set("completedAt", new Date().toISOString())
    }
  }
  app.save(batch)
  return batch
}

function batchPayload(batch) {
  return {
    id: batch.id,
    eventId: batch.getString("event") || "",
    templateId: batch.getString("template") || "",
    audienceType: batch.getString("audienceType") || "",
    status: batch.getString("status") || "issued",
    recipientCount: batch.getInt("recipientCount") || 0,
    issuedCount: batch.getInt("issuedCount") || 0,
    emailEligibleCount: batch.getInt("emailEligibleCount") || 0,
    missingEmailCount: batch.getInt("missingEmailCount") || 0,
    queuedCount: batch.getInt("queuedCount") || 0,
    sentCount: batch.getInt("sentCount") || 0,
    failedCount: batch.getInt("failedCount") || 0,
    issuedAt: batch.getString("issuedAt") || "",
    sendStartedAt: batch.getString("sendStartedAt") || "",
    completedAt: batch.getString("completedAt") || "",
    note: batch.getString("note") || "",
  }
}

function deliveryPayload(app, batch) {
  reconcileBatch(app, batch)
  batch = batchRecord(app, batch.id) || batch
  var certificates = certificateRows(app, batch.id)
  var jobs = outboxMap(outboxRows(app, batch.id))
  var rows = certificates.map(function (certificate) {
    var job = jobs[certificate.id] || null
    var email = clean(certificate.getString("recipientEmailSnapshot"))
    var certificateStatus = certificate.getString("status") || "active"
    var deliveryStatus = "not_queued"
    if (!validEmail(email)) deliveryStatus = "missing_email"
    else if (certificateStatus !== "active" && !job) deliveryStatus = "not_active"
    else if (job) deliveryStatus = job.getString("status") || "pending"
    return {
      certificateId: certificate.id,
      recipientName: certificate.getString("recipientNameSnapshot") || "",
      recipientEmail: email,
      credentialId: certificate.getString("credentialId") || "",
      certificateType: certificate.getString("certificateType") || "",
      templateId: certificate.getString("template") || "",
      certificateStatus: certificateStatus,
      revokedAt: certificate.getString("revokedAt") || "",
      revocationReason: certificate.getString("revocationReason") || "",
      supersedesId: certificate.getString("supersedes") || "",
      supersededById: certificate.getString("supersededBy") || "",
      deliveryStatus: deliveryStatus,
      attempts: job ? (job.getInt("attempts") || 0) : 0,
      sentAt: job ? (job.getString("sentAt") || "") : "",
      lastError: job ? (job.getString("lastError") || "") : "",
      verificationUrl: siteUrl() + "/c/" + encodeURIComponent(certificate.getString("verificationToken") || ""),
    }
  })
  return { batch: batchPayload(batch), certificates: rows }
}

function sendCertificateOutbox(app, record) {
  var certificate = certificateRecord(app, record.getString("certificate"))
  if (!certificate) throw new Error("Certificate no longer exists")
  if ((certificate.getString("status") || "") !== "active") {
    var inactive = new Error("Certificate is no longer active")
    inactive.mailDeliveryPermanent = true
    throw inactive
  }
  var fromSettings = app.settings()
  var from = {
    address: String(fromSettings.meta.senderAddress || ""),
    name: String(fromSettings.meta.senderName || "IEEE Sahrdaya Student Branch"),
    smtpEnabled: fromSettings.smtp && fromSettings.smtp.enabled === true,
  }
  if (!from.smtpEnabled) throw new Error("SMTP delivery is not configured")
  if (!from.address) throw new Error("Email sender is not configured")
  var prepared = require(__hooks + "/mail-delivery.js").prepare(record.getString("recipient"), certificateEmail(app, certificate))
  var message = new MailerMessage({
    from: from,
    to: [{ address: prepared.recipient }],
    subject: prepared.subject,
    html: prepared.html,
    text: prepared.text,
  })
  app.newMailClient().send(message)
}

function reconcileForOutbox(app, record) {
  if (!record || record.getString("kind") !== "certificate") return
  var certificate = certificateRecord(app, record.getString("certificate"))
  if (!certificate) return
  var batch = batchRecord(app, certificate.getString("batch"))
  if (batch) reconcileBatch(app, batch)
}

module.exports = {
  batchPayload: batchPayload,
  batchRecord: batchRecord,
  canSend: canSend,
  canView: canView,
  certificateEmail: certificateEmail,
  certificateRows: certificateRows,
  deliveryPayload: deliveryPayload,
  enqueueCertificate: enqueueCertificate,
  error: error,
  eventRecord: eventRecord,
  reconcileBatch: reconcileBatch,
  reconcileForOutbox: reconcileForOutbox,
  routeContext: routeContext,
  sendCertificateOutbox: sendCertificateOutbox,
  validEmail: validEmail,
}
