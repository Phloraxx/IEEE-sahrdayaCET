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
  if (isNaN(d.getTime())) return { date: "TBA", time: "TBA", year: String(new Date().getFullYear()), day: "--", month: "TBA", weekday: "" }
  var ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000)
  var weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  var monthShort = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
  var hours = ist.getUTCHours()
  var minutes = String(ist.getUTCMinutes()).padStart(2, "0")
  var ampm = hours >= 12 ? "pm" : "am"
  hours = hours % 12 || 12
  return {
    date: weekdays[ist.getUTCDay()] + ", " + ist.getUTCDate() + " " + months[ist.getUTCMonth()] + " " + ist.getUTCFullYear(),
    time: String(hours).padStart(2, "0") + ":" + minutes + " " + ampm,
    year: String(ist.getUTCFullYear()),
    day: String(ist.getUTCDate()).padStart(2, "0"),
    month: monthShort[ist.getUTCMonth()],
    weekday: weekdays[ist.getUTCDay()],
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
  var firstNameRaw = String(rawName).trim().split(/\s+/)[0] || "Student"
  var firstName = htmlEscape(firstNameRaw)
  var name = htmlEscape(rawName)
  var title = htmlEscape(rawTitle)
  var venueRaw = event ? event.getString("venue") || "TBA" : "TBA"
  var venue = htmlEscape(venueRaw)
  var parts = formatEventParts(event ? event.getString("date") : "")
  var ticketIdRaw = registration.getString("ticketId") || ""
  var ticketId = htmlEscape(ticketIdRaw)
  var ticketHref = siteUrl() + "/ticket/" + encodeURIComponent(ticketIdRaw)
  var qrHref = ticketHref + "/qr.png"
  var feePaise = 0
  try { feePaise = require(__hooks + "/registration-helpers.js").registrationFinalFeePaise(registration) } catch (_) { feePaise = 0 }
  var isPaid = isFinite(feePaise) && feePaise > 0
  var entryLabel = isPaid ? "PAID · ₹" + paidAmount(registration) : "FREE ENTRY"
  var entryBg = isPaid ? "#eef6ff" : "#eefbf1"
  var entryBorder = isPaid ? "#b8d8f5" : "#b9e7c4"
  var entryColor = isPaid ? "#005f93" : "#18753a"

  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f2f1ed;font-family:Arial,Helvetica,sans-serif;color:#171717">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Your pass for ' + title + ' is ready. Keep the QR handy for check-in.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f1ed"><tr><td align="center" style="padding:30px 14px 38px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:430px">' +
    '<tr><td style="padding:0 2px 22px">' +
    '<p style="margin:0 0 12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00629b;font-weight:700">IEEE Sahrdaya Student Branch</p>' +
    '<h1 style="margin:0;font-size:28px;line-height:1.08;letter-spacing:-.7px;color:#171717">Your pass is ready.</h1>' +
    '<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#636363">' + firstName + ', you&#39;re registered. Keep this email handy when you arrive.</p>' +
    '</td></tr>' +

    '<tr><td>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #d7d5cf;border-radius:18px">' +
    '<tr><td style="padding:5px 5px 11px;background:#e2e0da;border-radius:18px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff;border-radius:14px;overflow:hidden">' +

    '<tr><td style="background:#171717;padding:14px 18px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#7dd3fc;font-weight:700">Event credential</td>' +
    '<td align="right" style="font-size:9px;letter-spacing:1.1px;text-transform:uppercase;color:#86efac;font-weight:700">● Active</td>' +
    '</tr></table></td></tr>' +

    '<tr><td style="background:#fff;padding:0">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="92" valign="top" style="width:92px;background:#00629b;padding:22px 12px 20px;text-align:center;color:#fff">' +
    '<div style="font-size:39px;line-height:.9;font-weight:800;letter-spacing:-2px">' + htmlEscape(parts.day) + '</div>' +
    '<div style="margin-top:8px;font-size:11px;line-height:1;font-weight:800;letter-spacing:1.6px">' + htmlEscape(parts.month) + '</div>' +
    '<div style="margin-top:8px;font-size:9px;line-height:1;font-weight:600;letter-spacing:1px;opacity:.72">' + htmlEscape(parts.year) + '</div>' +
    '</td>' +
    '<td valign="top" style="padding:21px 19px 18px">' +
    '<p style="margin:0 0 8px;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#8b8b91;font-weight:700">' + htmlEscape(parts.weekday || "Event") + ' · ' + htmlEscape(parts.time) + '</p>' +
    '<h2 style="margin:0;font-size:20px;line-height:1.22;letter-spacing:-.25px;color:#171717;font-weight:800">' + title + '</h2>' +
    '<p style="margin:13px 0 0;font-size:12px;line-height:1.45;color:#67676b">' + venue + '</p>' +
    '</td></tr></table>' +
    '</td></tr>' +

    '<tr><td style="background:#fff;padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="17" style="width:17px;height:30px;background:#e2e0da;border-top-right-radius:15px;border-bottom-right-radius:15px;font-size:0;line-height:0">&nbsp;</td>' +
    '<td style="height:30px;vertical-align:middle;background:#fff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px dashed #c8c5bd;height:0;font-size:0;line-height:0">&nbsp;</td></tr></table></td>' +
    '<td width="17" style="width:17px;height:30px;background:#e2e0da;border-top-left-radius:15px;border-bottom-left-radius:15px;font-size:0;line-height:0">&nbsp;</td>' +
    '</tr></table></td></tr>' +

    '<tr><td style="background:#fff;padding:15px 20px 20px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td valign="middle" style="padding:4px 12px 14px 0"><p style="margin:0 0 3px;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;font-weight:700">Issued to</p><p style="margin:0;font-size:15px;line-height:1.3;color:#171717;font-weight:800">' + name + '</p></td>' +
    '<td align="right" valign="middle" style="padding:4px 0 14px"><span style="display:inline-block;background:' + entryBg + ';border:1px solid ' + entryBorder + ';padding:5px 9px;border-radius:999px;font-size:9px;color:' + entryColor + ';font-weight:800;text-transform:uppercase;white-space:nowrap">' + htmlEscape(entryLabel) + '</span></td>' +
    '</tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #eceae5"><tr><td align="center" style="padding-top:20px">' +
    '<p style="margin:0 0 10px;font-size:9px;letter-spacing:1.4px;text-transform:uppercase;color:#00629b;font-weight:800">Check-in</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #d9d7d2;border-radius:12px"><tr><td style="padding:10px"><img src="' + htmlEscape(qrHref) + '" alt="Ticket QR code" width="158" height="158" style="display:block;width:158px;height:158px;border:0"></td></tr></table>' +
    '<p style="margin:12px 0 3px;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;font-weight:700">Pass ID</p>' +
    '<p style="margin:0;font-size:11px;line-height:1.4;font-family:SFMono-Regular,Consolas,Liberation Mono,monospace;color:#3f3f46;font-weight:700;letter-spacing:.45px">' + ticketId + '</p>' +
    '<p style="margin:10px auto 0;max-width:270px;font-size:11px;line-height:1.5;color:#858585">Show this QR at check-in. Your pass is personal.</p>' +
    '</td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px"><tr><td align="center" style="background:#171717;padding:12px 16px;border-radius:8px">' +
    '<a href="' + htmlEscape(ticketHref) + '" style="display:block;font-size:12px;line-height:1.3;color:#fff;font-weight:800;text-decoration:none;letter-spacing:.2px">Open e-ticket&nbsp;&nbsp;→</a>' +
    '</td></tr></table>' +
    '</td></tr>' +
    '</table></td></tr></table>' +
    '</td></tr>' +

    '<tr><td style="padding:17px 2px 0;font-size:11px;line-height:1.55;color:#777">Arrive a little early for a smooth check-in. Please don&#39;t forward this email or share the QR code.</td></tr>' +
    '<tr><td style="padding:24px 2px 0;border-top:1px solid #d9d7d1"><p style="margin:0;font-size:11px;color:#27272a;font-weight:700">IEEE Sahrdaya Student Branch</p><p style="margin:4px 0 0;font-size:10px;color:#a1a1aa">Advancing Technology for Humanity</p></td></tr>' +
    '</table></td></tr></table></body></html>'

  return {
    subject: "Your Ticket for " + rawTitle,
    html: html,
    text: "IEEE SAHRDAYA STUDENT BRANCH\n\nYour pass is ready.\n" + firstNameRaw + ", you're registered.\n\nEvent: " + rawTitle + "\nDate: " + parts.date + "\nTime: " + parts.time + "\nVenue: " + venueRaw + "\nIssued to: " + rawName + "\nEntry: " + entryLabel + "\nPass ID: " + ticketIdRaw + "\n\nOpen e-ticket: " + ticketHref + "\n\nShow the QR at check-in. Please don't forward this email or share the QR code.\n\nIEEE Sahrdaya Student Branch\nAdvancing Technology for Humanity",
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
  try {
    var event = $app.findRecordById("events", registration.getString("event"))
    return require(__hooks + "/workspace-authorization.js").hasEventCapability(
      $app, auth, "registrations.manage", event
    )
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
