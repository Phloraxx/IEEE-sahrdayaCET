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
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      var parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
    } catch (_) {}
  }
  return {}
}

function formatDate(value) {
  var d = new Date(String(value || ""))
  if (isNaN(d.getTime())) return "TBA"
  var day = String(d.getDate()).padStart(2, "0")
  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var hours = d.getHours()
  var minutes = String(d.getMinutes()).padStart(2, "0")
  var ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12
  return day + " " + monthNames[d.getMonth()] + " " + d.getFullYear() + ", " + hours + ":" + minutes + " " + ampm
}

function getEvent(registration) {
  var eventId = registration.getString("event") || ""
  if (!eventId) return null
  try { return $app.findRecordById("events", eventId) } catch (_) { return null }
}

function getBannerUrl(event) {
  if (!event) return ""
  var banner = event.getString("banner") || ""
  if (!banner) return ""
  try { return $app.filesystem().fileUrl(event, banner) } catch (_) { return "" }
}

function sender() {
  var settings = $app.settings()
  return {
    address: String(settings.meta.senderAddress || ""),
    name: String(settings.meta.senderName || "IEEE Sahrdaya Student Branch"),
  }
}

function ticketEmail(registration, event) {
  var name = htmlEscape(registration.getString("userName") || "Student")
  var title = htmlEscape(event ? event.getString("title") : "IEEE Sahrdaya event")
  var venue = htmlEscape(event ? event.getString("venue") : "")
  var date = htmlEscape(event ? formatDate(event.getString("date")) : "TBA")
  var ticketId = htmlEscape(registration.getString("ticketId") || "")
  var ticketHref = siteUrl() + "/ticket/" + encodeURIComponent(registration.getString("ticketId") || "")
  var banner = getBannerUrl(event)
  var bannerHtml = banner
    ? '<img src="' + htmlEscape(banner) + '" alt="' + title + '" style="display:block;width:100%;max-height:280px;object-fit:cover">'
    : '<div style="height:10px;background:#00629B"></div>'

  var html = '<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">' +
    '<div style="max-width:620px;margin:0 auto;padding:28px 16px">' +
    '<div style="overflow:hidden;border:1px solid #e5e7eb;border-radius:24px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.06)">' +
    bannerHtml +
    '<div style="padding:30px">' +
    '<div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#00629B">IEEE Sahrdaya Student Branch</div>' +
    '<h1 style="margin:12px 0 8px;font-size:28px;line-height:1.15">Your ticket is ready</h1>' +
    '<p style="margin:0 0 24px;color:#64748b;line-height:1.6">Hi ' + name + ', your registration for <strong style="color:#111827">' + title + '</strong> is confirmed.</p>' +
    '<div style="border:1px solid #e5e7eb;border-radius:18px;padding:18px 20px;background:#f8fafc">' +
    '<div style="font-size:20px;font-weight:800;margin-bottom:12px">' + title + '</div>' +
    '<div style="font-size:14px;line-height:1.8;color:#475569"><strong>Date:</strong> ' + date + '<br><strong>Venue:</strong> ' + (venue || 'TBA') + '<br><strong>Ticket:</strong> <span style="font-family:monospace">' + ticketId + '</span></div>' +
    '</div>' +
    '<div style="text-align:center;margin:28px 0 8px"><a href="' + htmlEscape(ticketHref) + '" style="display:inline-block;background:#00629B;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:12px">View your ticket</a></div>' +
    '<p style="margin:22px 0 0;font-size:13px;color:#64748b;line-height:1.6">Open the ticket on your phone and show its QR code at the venue for check-in.</p>' +
    '</div></div><p style="text-align:center;color:#94a3b8;font-size:12px;margin:18px 0 0">IEEE Sahrdaya Student Branch · Sahrdaya College of Engineering & Technology</p></div></body></html>'

  return {
    subject: "Your ticket for " + (event ? event.getString("title") : "IEEE Sahrdaya event"),
    html: html,
    text: "Hi " + (registration.getString("userName") || "Student") + ",\n\nYour registration for " + (event ? event.getString("title") : "the event") + " is confirmed.\nTicket: " + registration.getString("ticketId") + "\nDate: " + (event ? formatDate(event.getString("date")) : "TBA") + "\nVenue: " + (event ? event.getString("venue") : "TBA") + "\n\nView ticket: " + ticketHref,
  }
}

function paidAmount(registration) {
  var data = asObject(registration.get("paymentData"))
  var exact = Number(data.payableAmount)
  if (isFinite(exact) && exact > 0) return exact.toFixed(2)
  var paise = Number(data.payableAmountPaise)
  if (isFinite(paise) && paise > 0) return (paise / 100).toFixed(2)
  return Number(registration.getInt("amount") || 0).toFixed(2)
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
  if (kind === "receipt" && (registration.getString("paymentStatus") !== "paid" || (registration.getInt("amount") || 0) <= 0 || !registration.getString("ticketId"))) return null

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
  if (registration.getString("paymentStatus") === "paid" && (registration.getInt("amount") || 0) > 0 && registration.getString("ticketId")) {
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
