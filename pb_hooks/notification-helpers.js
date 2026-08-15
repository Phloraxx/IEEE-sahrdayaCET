/// <reference path="../pb_data/types.d.ts" />

function htmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function siteUrl() {
  var raw = String($os.getenv("SITE_URL") || "https://ieeesahrdaya.com").trim()
  return raw.replace(/\/+$/, "") || "https://ieeesahrdaya.com"
}

function asObject(value) {
  if (!value) return {}
  if (typeof value === "object" && typeof value.string === "function") {
    try { value = JSON.parse(String(value.string() || "{}")) } catch (_) { return {} }
  } else if (Array.isArray(value)) {
    try {
      var jsonText = ""
      for (var bi = 0; bi < value.length; bi++) jsonText += String.fromCharCode(Number(value[bi]) || 0)
      value = JSON.parse(jsonText)
    } catch (_) { return {} }
  } else if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  var copy = {}
  var keys = Object.keys(value)
  for (var i = 0; i < keys.length; i++) copy[keys[i]] = value[keys[i]]
  return copy
}

function formatDate(value) {
  var d = new Date(String(value || ""))
  if (isNaN(d.getTime())) return "TBA"
  // Event operations are based in Kerala. PocketBase runs in UTC, so format
  // mail and receipt timestamps explicitly in India Standard Time instead of
  // inheriting the container timezone. IST has no daylight-saving transition.
  var ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000)
  var day = String(ist.getUTCDate()).padStart(2, "0")
  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var hours = ist.getUTCHours()
  var minutes = String(ist.getUTCMinutes()).padStart(2, "0")
  var ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return day + " " + monthNames[ist.getUTCMonth()] + " " + ist.getUTCFullYear() + ", " + hours + ":" + minutes + " " + ampm + " IST"
}

function formatEventParts(value) {
  var d = new Date(String(value || ""))
  if (isNaN(d.getTime())) return { date: "TBA", time: "TBA" }
  var ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000)
  var monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  var hours = ist.getUTCHours()
  var minutes = String(ist.getUTCMinutes()).padStart(2, "0")
  var ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return {
    date: String(ist.getUTCDate()).padStart(2, "0") + " " + monthNames[ist.getUTCMonth()] + " " + ist.getUTCFullYear(),
    time: hours + ":" + minutes + " " + ampm + " IST",
  }
}

function getEvent(registration) {
  var eventId = registration.getString("event") || ""
  if (!eventId) return null
  try { return $app.findRecordById("events", eventId) } catch (_) { return null }
}

function sender() {
  var settings = $app.settings()
  return {
    address: String(settings.meta.senderAddress || ""),
    name: String(settings.meta.senderName || "IEEE Sahrdaya Student Branch"),
    smtpEnabled: settings.smtp && settings.smtp.enabled === true,
  }
}

function ticketEmail(registration, event) {
  var rawName = registration.getString("userName") || "Student"
  var rawTitle = event ? event.getString("title") : "IEEE Sahrdaya event"
  var name = htmlEscape(rawName)
  var title = htmlEscape(rawTitle)
  var venue = htmlEscape(event ? event.getString("venue") : "") || "TBA"
  var parts = formatEventParts(event ? event.getString("date") : "")
  var ticketIdRaw = registration.getString("ticketId") || ""
  var ticketId = htmlEscape(ticketIdRaw)
  var ticketHref = siteUrl() + "/ticket/" + encodeURIComponent(ticketIdRaw)
  var qrHref = ticketHref + "/qr.png"
  var feePaise = 0
  try { feePaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) } catch (_) { feePaise = 0 }
  var isPaid = isFinite(feePaise) && feePaise > 0
  var entryValue = isPaid ? "₹" + paidAmount(registration) + " · PAID" : "FREE ENTRY"
  var eventYear = parts.date === "TBA" ? new Date().getFullYear() : parts.date.slice(-4)

  var html = '<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ed;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111315">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Your place at ' + title + ' is confirmed. Your event pass is inside.</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f2ed"><tr><td align="center" style="padding:34px 16px 42px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">' +
    '<tr><td style="padding:0 0 28px;font-size:10px;line-height:1.4;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#00629B">IEEE Sahrdaya Student Branch</td></tr>' +
    '<tr><td style="padding:0 0 34px;border-bottom:1px solid #d8d5cf">' +
    '<div style="font-size:42px;line-height:.98;font-weight:800;letter-spacing:-.055em;color:#111315">You&#39;re in.</div>' +
    '<div style="margin-top:14px;max-width:520px;font-size:15px;line-height:1.7;color:#686866">Hi ' + name + ', your place at <strong style="color:#111315">' + title + '</strong> is confirmed. This email is your event pass.</div>' +
    '</td></tr>' +
    '<tr><td style="padding-top:30px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">' +
    '<tr><td style="background:#111315;padding:30px 30px 26px;color:#fff">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td style="font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#7dd3fc">Event pass</td>' +
    '<td align="right" style="font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#a7f3d0">Confirmed</td>' +
    '</tr></table>' +
    '<div style="padding:32px 0 30px;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-.045em;color:#fff">' + title + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #343638;padding-top:20px"><tr>' +
    '<td width="50%" valign="top" style="padding-top:20px;padding-right:12px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#81858a">Date</div><div style="margin-top:8px;font-size:14px;font-weight:700;color:#fff">' + htmlEscape(parts.date) + '</div></td>' +
    '<td width="50%" valign="top" style="padding-top:20px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#81858a">Time</div><div style="margin-top:8px;font-size:14px;font-weight:700;color:#fff">' + htmlEscape(parts.time) + '</div></td>' +
    '</tr><tr><td colspan="2" valign="top" style="padding-top:22px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#81858a">Venue</div><div style="margin-top:8px;font-size:14px;font-weight:700;line-height:1.5;color:#fff">' + venue + '</div></td></tr></table>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px;border-top:1px solid #343638"><tr>' +
    '<td valign="top" style="padding-top:22px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#81858a">Attendee</div><div style="margin-top:7px;font-size:17px;font-weight:750;color:#fff">' + name + '</div></td>' +
    '<td valign="top" align="right" style="padding-top:22px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#81858a">Entry</div><div style="margin-top:7px;font-size:13px;font-weight:800;color:#7dd3fc">' + htmlEscape(entryValue) + '</div></td>' +
    '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="background:#fff;padding:0 30px 30px">' +
    '<div style="border-top:2px dashed #d8d5cf;height:24px;margin:0 -12px 2px"></div>' +
    '<div style="font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#00629B">Check-in code</div>' +
    '<div style="margin-top:10px;font-size:23px;line-height:1.2;font-weight:800;letter-spacing:-.03em;color:#111315">Show this at check-in.</div>' +
    '<div style="margin-top:9px;font-size:12px;line-height:1.6;color:#777773">Keep this pass on your phone and do not share the QR code.</div>' +
    '<div style="text-align:center;margin:24px 0 4px"><img src="' + htmlEscape(qrHref) + '" width="210" height="210" alt="Ticket QR code" style="display:inline-block;width:210px;height:210px;border:1px solid #e6e3de;background:#fff;padding:8px"></div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-top:1px solid #e6e3de"><tr>' +
    '<td style="padding-top:18px"><div style="font-size:9px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#9a9893">Pass ID</div><div style="margin-top:7px;font-family:SFMono-Regular,Consolas,Liberation Mono,monospace;font-size:12px;font-weight:700;color:#111315">' + ticketId + '</div></td>' +
    '<td align="right" style="padding-top:18px;font-size:10px;font-weight:800;letter-spacing:.17em;text-transform:uppercase;color:#9a9893">IEEE Sahrdaya · ' + htmlEscape(eventYear) + '</td>' +
    '</tr></table>' +
    '</td></tr></table>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:28px 0 0"><a href="' + htmlEscape(ticketHref) + '" style="display:inline-block;background:#00629B;color:#fff;text-decoration:none;font-size:14px;font-weight:800;padding:14px 24px">View your ticket&nbsp;&nbsp;→</a></td></tr>' +
    '<tr><td style="padding:28px 0 0;border-bottom:1px solid #d8d5cf"><div style="padding:0 0 26px;font-size:12px;line-height:1.7;color:#777773">Please arrive a little early for a smooth check-in. Your pass is tied to your registration and should not be shared.</div></td></tr>' +
    '<tr><td style="padding-top:24px;font-size:11px;line-height:1.7;color:#97958f"><strong style="color:#111315">IEEE Sahrdaya Student Branch</strong><br>Advancing Technology for Humanity<br>Sahrdaya College of Engineering &amp; Technology, Kodakara</td></tr>' +
    '</table></td></tr></table></body></html>'

  return {
    subject: "You're in · " + rawTitle,
    html: html,
    text: "You're in.\n\nHi " + rawName + ", your place at " + rawTitle + " is confirmed.\n\nDate: " + parts.date + "\nTime: " + parts.time + "\nVenue: " + (event ? event.getString("venue") || "TBA" : "TBA") + "\nEntry: " + entryValue + "\nPass ID: " + ticketIdRaw + "\n\nView your ticket: " + ticketHref + "\n\nShow the QR code in your ticket at check-in. Do not share your pass.",
  }
}

function paidAmount(registration) {
  var data = asObject(registration.get("paymentData"))
  var exact = Number(data.payableAmount)
  if (isFinite(exact) && exact > 0) return exact.toFixed(2)
  var paise = Number(data.payableAmountPaise)
  if (isFinite(paise) && paise > 0) return (paise / 100).toFixed(2)
  return require(__hooks + "/registration-helpers.js").registrationAmount(registration).toFixed(2)
}

function receiptNumber(registration) {
  return "RCT-" + String(registration.id || "").toUpperCase()
}

function receiptEmail(registration, event) {
  var name = htmlEscape(registration.getString("userName") || "Student")
  var title = htmlEscape(event ? event.getString("title") : "IEEE Sahrdaya event")
  var data = asObject(registration.get("paymentData"))
  var paidAt = data.paidAt || registration.getString("updated") || new Date().toISOString()
  var amount = paidAmount(registration)
  var receipt = receiptNumber(registration)
  var ticketId = htmlEscape(registration.getString("ticketId") || "")

  var html = '<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">' +
    '<div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="border:1px solid #e5e7eb;border-radius:24px;background:#fff;overflow:hidden">' +
    '<div style="background:#0f172a;padding:26px 30px;color:#fff"><div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#7dd3fc">IEEE Sahrdaya Student Branch</div><h1 style="margin:10px 0 0;font-size:26px">Payment receipt</h1></div>' +
    '<div style="padding:30px"><p style="margin:0 0 22px;color:#64748b;line-height:1.6">Hi ' + name + ', your payment for <strong style="color:#111827">' + title + '</strong> has been received.</p>' +
    '<div style="border:1px solid #e5e7eb;border-radius:18px;padding:20px;background:#f8fafc">' +
    '<div style="font-size:13px;color:#64748b">Amount received</div><div style="font-size:34px;font-weight:800;margin:4px 0 18px">₹' + htmlEscape(amount) + '</div>' +
    '<div style="font-size:14px;line-height:1.9;color:#475569"><strong>Receipt:</strong> ' + htmlEscape(receipt) + '<br><strong>Paid:</strong> ' + htmlEscape(formatDate(paidAt)) + '<br><strong>Registration:</strong> <span style="font-family:monospace">' + htmlEscape(registration.id) + '</span><br><strong>Ticket:</strong> <span style="font-family:monospace">' + ticketId + '</span></div></div>' +
    '<p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6">A PDF copy of this receipt is attached for your records.</p></div></div></div></body></html>'

  return {
    subject: "Payment receipt · " + (event ? event.getString("title") : "IEEE Sahrdaya event"),
    html: html,
    text: "Payment receipt\n\nEvent: " + (event ? event.getString("title") : "IEEE Sahrdaya event") + "\nAmount received: INR " + amount + "\nReceipt: " + receipt + "\nPaid: " + formatDate(paidAt) + "\nRegistration: " + registration.id + "\nTicket: " + registration.getString("ticketId"),
  }
}

function pdfEscape(value) {
  return String(value == null ? "" : value)
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
}

function receiptPdfBytes(registration, event) {
  var data = asObject(registration.get("paymentData"))
  var paidAt = data.paidAt || registration.getString("updated") || new Date().toISOString()
  var refundedPaise = Number(data.amountRefundedPaise || 0)
  var rows = [
    { text: "IEEE Sahrdaya Student Branch", size: 18, bold: true, gap: 28 },
    { text: "PAYMENT RECEIPT", size: 14, bold: true, gap: 26 },
    { text: "Receipt: " + receiptNumber(registration), size: 10, gap: 18 },
    { text: "Event: " + (event ? event.getString("title") : "IEEE Sahrdaya event"), size: 10, gap: 16 },
    { text: "Student: " + (registration.getString("userName") || "Student"), size: 10, gap: 16 },
    { text: "Email: " + (registration.getString("userEmail") || ""), size: 10, gap: 16 },
    { text: "Amount received: INR " + paidAmount(registration), size: 12, bold: true, gap: 22 },
    { text: "Paid: " + formatDate(paidAt), size: 10, gap: 16 },
    { text: "Registration ID: " + registration.id, size: 10, gap: 16 },
    { text: "Ticket ID: " + registration.getString("ticketId"), size: 10, gap: 16 },
    { text: "Venue: " + (event ? event.getString("venue") : "TBA"), size: 10, gap: 16 },
    { text: "This receipt acknowledges payment for event registration.", size: 9, gap: 16 },
  ]
  if (isFinite(refundedPaise) && refundedPaise > 0) {
    rows.splice(8, 0, { text: "Refunded: INR " + (refundedPaise / 100).toFixed(2), size: 10, bold: true, gap: 18 })
  }
  if (registration.getString("paymentStatus") === "refunded") {
    rows.splice(9, 0, { text: "Payment status: REFUNDED", size: 10, bold: true, gap: 18 })
  }

  var y = 760
  var content = "BT\n"
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    content += "/F1 " + row.size + " Tf\n"
    content += "1 0 0 1 54 " + y + " Tm\n(" + pdfEscape(row.text) + ") Tj\n"
    y -= row.gap || 16
  }
  content += "ET\n"

  var objects = []
  objects.push("<< /Type /Catalog /Pages 2 0 R >>")
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>")
  objects.push("<< /Length " + content.length + " >>\nstream\n" + content + "endstream")
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

  var pdf = "%PDF-1.4\n"
  var offsets = [0]
  for (var oi = 0; oi < objects.length; oi++) {
    offsets.push(pdf.length)
    pdf += (oi + 1) + " 0 obj\n" + objects[oi] + "\nendobj\n"
  }
  var xref = pdf.length
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n"
  for (var xi = 1; xi < offsets.length; xi++) {
    pdf += String(offsets[xi]).padStart(10, "0") + " 00000 n \n"
  }
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n"
  return toBytes(pdf)
}


function canManageRegistration(auth, registration) {
  if (!auth || !auth.id || !registration) return false
  if (auth.getString("role") === "admin") return true
  if (auth.getString("role") !== "chair") return false
  try {
    var event = $app.findRecordById("events", registration.getString("event"))
    var society = $app.findRecordById("societies", event.getString("society"))
    var chairs = society.get("chairs")
    if (Array.isArray(chairs)) return chairs.indexOf(auth.id) !== -1
    return String(chairs || "") === auth.id
  } catch (_) { return false }
}

function findOutbox(registrationId, kind) {
  try {
    return $app.findFirstRecordByFilter(
      "notification_outbox",
      "registration = {:registration} && kind = {:kind}",
      { registration: registrationId, kind: kind }
    )
  } catch (_) { return null }
}

function enqueue(registration, kind, force) {
  if (!registration || !registration.id) return null
  if (kind === "ticket" && (registration.getString("registrationStatus") !== "confirmed" || !registration.getString("ticketId"))) return null
  if (kind === "receipt" && ((registration.getString("paymentStatus") !== "paid" && registration.getString("paymentStatus") !== "refunded") || require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) <= 0 || !registration.getString("ticketId"))) return null

  var recipient = String(registration.getString("userEmail") || "").trim()
  if (!recipient) return null
  var existing = findOutbox(registration.id, kind)
  if (existing) {
    if (force) {
      existing.set("status", "pending")
      existing.set("nextAttemptAt", new Date().toISOString())
      existing.set("lastError", "")
      existing.set("recipient", recipient)
      $app.save(existing)
    }
    return existing
  }

  var collection
  try { collection = $app.findCollectionByNameOrId("notification_outbox") } catch (_) { return null }
  var record = new Record(collection)
  record.set("registration", registration.id)
  record.set("kind", kind)
  record.set("status", "pending")
  record.set("recipient", recipient)
  record.set("dedupeKey", registration.id + ":" + kind)
  record.set("attempts", 0)
  record.set("nextAttemptAt", new Date().toISOString())
  try { $app.save(record) } catch (err) {
    var raced = findOutbox(registration.id, kind)
    if (raced) return raced
    throw err
  }
  return record
}

function enqueueForRegistration(registration) {
  if (!registration) return
  if (registration.getString("registrationStatus") === "confirmed" && registration.getString("ticketId")) {
    enqueue(registration, "ticket", false)
  }
  if (registration.getString("paymentStatus") === "paid" && require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) > 0 && registration.getString("ticketId")) {
    enqueue(registration, "receipt", false)
  }
}

function nextRetryIso(attempts) {
  var delays = [60, 300, 900, 3600, 10800, 21600]
  var index = Math.max(0, Math.min(delays.length - 1, Number(attempts || 1) - 1))
  return new Date(Date.now() + delays[index] * 1000).toISOString()
}

function sendOutbox(record) {
  var registration
  try { registration = $app.findRecordById("registrations", record.getString("registration")) }
  catch (_) { throw new Error("Registration no longer exists") }

  var kind = record.getString("kind")
  var event = getEvent(registration)
  var template = kind === "receipt" ? receiptEmail(registration, event) : ticketEmail(registration, event)
  var from = sender()
  if (!from.smtpEnabled) throw new Error("SMTP delivery is not configured")
  if (!from.address) throw new Error("Email sender is not configured")

  var reader = null
  var attachments = {}
  if (kind === "receipt") {
    var filename = "Receipt_" + String(registration.id).toUpperCase() + ".pdf"
    var file = $filesystem.fileFromBytes(receiptPdfBytes(registration, event), filename)
    reader = file.reader.open()
    attachments[filename] = reader
  }

  var message = new MailerMessage({
    from: from,
    to: [{ address: record.getString("recipient") }],
    subject: template.subject,
    html: template.html,
    text: template.text,
    attachments: attachments,
  })

  try {
    $app.newMailClient().send(message)
  } finally {
    if (reader) {
      try { reader.close() } catch (_) {}
    }
  }
}

function snapshot(registrationId) {
  var result = { ticket: null, receipt: null }
  var rows = []
  try {
    rows = $app.findRecordsByFilter("notification_outbox", "registration = {:registration}", "", 20, 0, { registration: registrationId })
  } catch (_) { rows = [] }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var kind = row.getString("kind")
    if (kind !== "ticket" && kind !== "receipt") continue
    result[kind] = {
      status: row.getString("status") || "pending",
      attempts: row.getInt("attempts") || 0,
      sentAt: row.getString("sentAt") || "",
      lastError: row.getString("lastError") || "",
    }
  }
  return result
}

module.exports = {
  asObject: asObject,
  formatDate: formatDate,
  siteUrl: siteUrl,
  paidAmount: paidAmount,
  receiptNumber: receiptNumber,
  receiptPdfBytes: receiptPdfBytes,
  getEvent: getEvent,
  enqueue: enqueue,
  enqueueForRegistration: enqueueForRegistration,
  sendOutbox: sendOutbox,
  nextRetryIso: nextRetryIso,
  snapshot: snapshot,
  canManageRegistration: canManageRegistration,
}
