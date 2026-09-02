function clean(value) {
  return String(value == null ? "" : value).trim()
}

function clampInt(value, fallback, min, max) {
  var parsed = parseInt(String(value || ""), 10)
  if (!isFinite(parsed)) parsed = fallback
  return Math.max(min, Math.min(max, parsed))
}

function query(e, name) {
  try { return clean(e.request.url.query().get(name)) } catch (_) { return "" }
}

function siteUrl() {
  var raw = clean($os.getenv("SITE_URL") || "https://ieeesahrdaya.com")
  return raw.replace(/\/+$/, "") || "https://ieeesahrdaya.com"
}

function eventRecord(app, id) {
  try { return app.findRecordById("events", String(id || "")) } catch (_) { return null }
}

function canViewEvent(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.view", event)
}

function canViewRegistrations(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "registrations.view", event)
}

function canSendCertificates(app, auth, event) {
  return !!event && require(__hooks + "/workspace-authorization.js")
    .hasEventCapability(app, auth, "certificates.send", event)
}

function certificateOutboxMap(app) {
  var rows = app.findRecordsByFilter("notification_outbox", "kind = 'certificate'", "id", 0, 0)
  var out = {}
  for (var i = 0; i < rows.length; i++) {
    var certificateId = rows[i].getString("certificate") || ""
    if (certificateId && !out[certificateId]) out[certificateId] = rows[i]
  }
  return out
}

function deliveryState(certificate, job) {
  var email = clean(certificate.getString("recipientEmailSnapshot"))
  if (!email) return "missing_email"
  if ((certificate.getString("status") || "active") !== "active" && !job) return "not_active"
  if (!job) return "not_queued"
  var status = clean(job.getString("status")) || "pending"
  return status === "sent" ? "accepted" : status
}

function eventPayload(event) {
  return event ? { id: event.id, title: event.getString("title") || "Untitled event" } : { id: "", title: "Unknown event" }
}
function rowPayload(certificate, event, job, access) {
  return {
    certificateId: certificate.id,
    eventId: certificate.getString("event") || "",
    eventTitle: certificate.getString("eventTitleSnapshot") || (event ? event.getString("title") : ""),
    recipientName: certificate.getString("recipientNameSnapshot") || "",
    recipientEmail: access.registrationView ? (certificate.getString("recipientEmailSnapshot") || "") : "",
    credentialId: certificate.getString("credentialId") || "",
    certificateType: certificate.getString("certificateType") || "",
    status: certificate.getString("status") || "active",
    issuedAt: certificate.getString("issuedAt") || "",
    issuerName: certificate.getString("issuerNameSnapshot") || "",
    batchId: certificate.getString("batch") || "",
    deliveryStatus: deliveryState(certificate, job),
    attempts: job ? (job.getInt("attempts") || 0) : 0,
    sentAt: job ? (job.getString("sentAt") || "") : "",
    lastError: access.send ? (job ? (job.getString("lastError") || "") : "") : "",
    verificationUrl: siteUrl() + "/c/" + encodeURIComponent(certificate.getString("verificationToken") || ""),
  }
}

function matchesSearch(row, search) {
  if (!search) return true
  var haystack = [row.recipientName, row.recipientEmail, row.credentialId, row.eventTitle, row.issuerName].join("\n").toLowerCase()
  return haystack.indexOf(search.toLowerCase()) !== -1
}
function summarize(rows) {
  var summary = { total: rows.length, active: 0, revoked: 0, superseded: 0, emailReady: 0, missingEmail: 0, accepted: 0, failed: 0, notQueued: 0 }
  rows.forEach(function (row) {
    if (row.status === "active") summary.active++
    else if (row.status === "revoked") summary.revoked++
    else if (row.status === "superseded") summary.superseded++
    if (row.deliveryStatus === "missing_email") summary.missingEmail++
    else summary.emailReady++
    if (row.deliveryStatus === "accepted") summary.accepted++
    else if (row.deliveryStatus === "failed") summary.failed++
    else if (row.deliveryStatus === "not_queued") summary.notQueued++
  })
  return summary
}

function registry(app, auth, e) {
  var eventId = query(e, "event")
  var status = query(e, "status")
  var certificateType = query(e, "type")
  var delivery = query(e, "delivery")
  var search = query(e, "search")
  var page = clampInt(query(e, "page"), 1, 1, 100000)
  var perPage = clampInt(query(e, "perPage"), 40, 1, 200)
  var filter = "1 = 1"
  var params = {}
  if (eventId) {
    var requestedEvent = eventRecord(app, eventId)
    if (!requestedEvent || !canViewEvent(app, auth, requestedEvent)) return { forbidden: true }
    filter += " && event = {:event}"; params.event = eventId
  }
  if (status && status !== "all") { filter += " && status = {:status}"; params.status = status }
  if (certificateType && certificateType !== "all") { filter += " && certificateType = {:type}"; params.type = certificateType }

  var certificates = app.findRecordsByFilter("certificates", filter, "-issuedAt,-created", 0, 0, params)
  var jobs = certificateOutboxMap(app)
  var eventCache = {}
  var eventAccess = {}
  var eventOptions = {}
  var rows = []

  certificates.forEach(function (certificate) {
    var id = certificate.getString("event") || ""
    if (!Object.prototype.hasOwnProperty.call(eventCache, id)) eventCache[id] = eventRecord(app, id)
    var event = eventCache[id]
    if (!Object.prototype.hasOwnProperty.call(eventAccess, id)) eventAccess[id] = {
      view: canViewEvent(app, auth, event),
      registrationView: canViewRegistrations(app, auth, event),
      send: canSendCertificates(app, auth, event),
    }
    if (!eventAccess[id].view) return
    eventOptions[id] = eventPayload(event)
    var row = rowPayload(certificate, event, jobs[certificate.id] || null, eventAccess[id])
    if (!matchesSearch(row, search)) return
    if (delivery && delivery !== "all") {
      if (delivery === "accepted" && row.deliveryStatus !== "accepted") return
      else if (delivery === "failed" && row.deliveryStatus !== "failed") return
      else if (delivery !== "accepted" && delivery !== "failed" && row.deliveryStatus !== delivery) return
    }
    rows.push(row)
  })
  var total = rows.length
  var start = (page - 1) * perPage
  var paged = rows.slice(start, start + perPage)
  var events = Object.keys(eventOptions).map(function (id) { return eventOptions[id] })
  events.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)) })

  return {
    page: page,
    perPage: perPage,
    total: total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    summary: summarize(rows),
    events: events,
    certificates: paged,
  }
}

module.exports = {
  registry: registry,
}
