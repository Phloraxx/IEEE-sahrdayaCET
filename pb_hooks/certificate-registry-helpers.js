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

function eventPayload(event) {
  return event ? { id: event.id, title: event.getString("title") || "Untitled event" } : { id: "", title: "Unknown event" }
}

function emptySummary() {
  return { total: 0, active: 0, revoked: 0, superseded: 0, emailReady: 0, missingEmail: 0, accepted: 0, failed: 0, notQueued: 0 }
}

function certificateEventAccess(app, auth, requestedEventId) {
  var ids = []
  if (requestedEventId) {
    ids.push(requestedEventId)
  } else {
    var distinctEvents = arrayOf(new DynamicModel({ eventId: "" }))
    app.db().newQuery(
      "SELECT DISTINCT event AS eventId FROM certificates WHERE COALESCE(event, '') <> '' ORDER BY event ASC"
    ).all(distinctEvents)
    for (var i = 0; i < distinctEvents.length; i++) {
      var id = String(distinctEvents[i].eventId || "")
      if (id) ids.push(id)
    }
  }

  var access = { ids: [], registrationIds: [], sendIds: [], byId: {} }
  for (var j = 0; j < ids.length; j++) {
    var eventId = ids[j]
    var event = eventRecord(app, eventId)
    if (!event || !canViewEvent(app, auth, event)) continue
    var item = {
      event: event,
      registrationView: canViewRegistrations(app, auth, event),
      send: canSendCertificates(app, auth, event),
    }
    access.ids.push(eventId)
    if (item.registrationView) access.registrationIds.push(eventId)
    if (item.send) access.sendIds.push(eventId)
    access.byId[eventId] = item
  }
  return access
}

function bindIds(params, prefix, values) {
  var placeholders = []
  for (var i = 0; i < values.length; i++) {
    var key = prefix + i
    params[key] = values[i]
    placeholders.push("{:" + key + "}")
  }
  return placeholders.join(",") || "NULL"
}

function baseWhere(access, status, certificateType, search, params, prefix) {
  var parts = ["c.event IN (" + bindIds(params, prefix + "View", access.ids) + ")"]
  if (status && status !== "all") {
    params[prefix + "Status"] = status
    parts.push("c.status = {:" + prefix + "Status}")
  }
  if (certificateType && certificateType !== "all") {
    params[prefix + "Type"] = certificateType
    parts.push("c.certificateType = {:" + prefix + "Type}")
  }
  if (search) {
    var searchKey = prefix + "Search"
    params[searchKey] = search.toLowerCase()
    var term = "{:" + searchKey + "}"
    var searchParts = [
      "instr(lower(COALESCE(c.recipientNameSnapshot, '')), " + term + ") > 0",
      "instr(lower(COALESCE(c.credentialId, '')), " + term + ") > 0",
      "instr(lower(COALESCE(NULLIF(c.eventTitleSnapshot, ''), ev.title, '')), " + term + ") > 0",
      "instr(lower(COALESCE(c.issuerNameSnapshot, '')), " + term + ") > 0",
    ]
    if (access.registrationIds.length) {
      searchParts.push(
        "(c.event IN (" + bindIds(params, prefix + "Registration", access.registrationIds) + ")" +
        " AND instr(lower(COALESCE(c.recipientEmailSnapshot, '')), " + term + ") > 0)"
      )
    }
    parts.push("(" + searchParts.join(" OR ") + ")")
  }
  return parts.join(" AND ")
}

function deliveryExpression() {
  return "CASE" +
    " WHEN trim(COALESCE(c.recipientEmailSnapshot, '')) = '' THEN 'missing_email'" +
    " WHEN COALESCE(NULLIF(c.status, ''), 'active') <> 'active' AND n.id IS NULL THEN 'not_active'" +
    " WHEN n.id IS NULL THEN 'not_queued'" +
    " WHEN trim(COALESCE(n.status, '')) = 'sent' THEN 'accepted'" +
    " WHEN trim(COALESCE(n.status, '')) = '' THEN 'pending'" +
    " ELSE trim(n.status) END"
}

function candidateSql(where) {
  return "SELECT" +
    " c.id AS certificateId," +
    " c.event AS eventId," +
    " COALESCE(NULLIF(c.eventTitleSnapshot, ''), ev.title, '') AS eventTitle," +
    " COALESCE(c.recipientNameSnapshot, '') AS recipientName," +
    " COALESCE(c.recipientEmailSnapshot, '') AS recipientEmail," +
    " COALESCE(c.credentialId, '') AS credentialId," +
    " COALESCE(c.certificateType, '') AS certificateType," +
    " COALESCE(NULLIF(c.status, ''), 'active') AS certificateStatus," +
    " COALESCE(c.issuedAt, '') AS issuedAt," +
    " COALESCE(c.issuerNameSnapshot, '') AS issuerName," +
    " COALESCE(c.batch, '') AS batchId," +
    " COALESCE(n.attempts, 0) AS attempts," +
    " COALESCE(n.sentAt, '') AS sentAt," +
    " COALESCE(n.lastError, '') AS lastError," +
    " COALESCE(c.verificationToken, '') AS verificationToken," +
    " COALESCE(c.created, '') AS createdAt," +
    " " + deliveryExpression() + " AS deliveryStatus" +
    " FROM certificates c" +
    " LEFT JOIN events ev ON ev.id = c.event" +
    " LEFT JOIN notification_outbox n ON n.id = (" +
      "SELECT n2.id FROM notification_outbox n2" +
      " WHERE n2.kind = 'certificate' AND n2.certificate = c.id" +
      " ORDER BY n2.id ASC LIMIT 1" +
    ")" +
    " WHERE " + where
}

function copyParams(input) {
  var out = {}
  Object.keys(input).forEach(function (key) { out[key] = input[key] })
  return out
}

function deliveryClause(delivery, params) {
  if (!delivery || delivery === "all") return ""
  params.deliveryFilter = delivery
  return " WHERE deliveryStatus = {:deliveryFilter}"
}

function registrySummary(app, candidates, baseParams, delivery) {
  var params = copyParams(baseParams)
  var filtered = deliveryClause(delivery, params)
  var model = new DynamicModel({
    total: 0, active: 0, revoked: 0, superseded: 0,
    emailReady: 0, missingEmail: 0, accepted: 0, failed: 0, notQueued: 0,
  })
  app.db().newQuery(
    "WITH candidates AS (" + candidates + ") SELECT" +
      " COUNT(*) AS total," +
      " COALESCE(SUM(CASE WHEN certificateStatus = 'active' THEN 1 ELSE 0 END), 0) AS active," +
      " COALESCE(SUM(CASE WHEN certificateStatus = 'revoked' THEN 1 ELSE 0 END), 0) AS revoked," +
      " COALESCE(SUM(CASE WHEN certificateStatus = 'superseded' THEN 1 ELSE 0 END), 0) AS superseded," +
      " COALESCE(SUM(CASE WHEN deliveryStatus <> 'missing_email' THEN 1 ELSE 0 END), 0) AS emailReady," +
      " COALESCE(SUM(CASE WHEN deliveryStatus = 'missing_email' THEN 1 ELSE 0 END), 0) AS missingEmail," +
      " COALESCE(SUM(CASE WHEN deliveryStatus = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted," +
      " COALESCE(SUM(CASE WHEN deliveryStatus = 'failed' THEN 1 ELSE 0 END), 0) AS failed," +
      " COALESCE(SUM(CASE WHEN deliveryStatus = 'not_queued' THEN 1 ELSE 0 END), 0) AS notQueued" +
      " FROM candidates" + filtered
  ).bind(params).one(model)
  return {
    total: Number(model.total) || 0,
    active: Number(model.active) || 0,
    revoked: Number(model.revoked) || 0,
    superseded: Number(model.superseded) || 0,
    emailReady: Number(model.emailReady) || 0,
    missingEmail: Number(model.missingEmail) || 0,
    accepted: Number(model.accepted) || 0,
    failed: Number(model.failed) || 0,
    notQueued: Number(model.notQueued) || 0,
  }
}

function registryRows(app, candidates, baseParams, delivery, page, perPage, access) {
  var params = copyParams(baseParams)
  var filtered = deliveryClause(delivery, params)
  var registrationEvents = bindIds(params, "rowRegistration", access.registrationIds)
  var sendEvents = bindIds(params, "rowSend", access.sendIds)
  params.limit = perPage
  params.offset = (page - 1) * perPage
  var dbRows = arrayOf(new DynamicModel({
    certificateId: "", eventId: "", eventTitle: "", recipientName: "", recipientEmail: "",
    credentialId: "", certificateType: "", certificateStatus: "", issuedAt: "", issuerName: "",
    batchId: "", deliveryStatus: "", attempts: 0, sentAt: "", lastError: "",
    verificationToken: "", createdAt: "",
  }))
  app.db().newQuery(
    "WITH candidates AS (" + candidates + ") SELECT" +
      " certificateId, eventId, eventTitle, recipientName," +
      " CASE WHEN eventId IN (" + registrationEvents + ") THEN recipientEmail ELSE '' END AS recipientEmail," +
      " credentialId, certificateType, certificateStatus, issuedAt, issuerName, batchId," +
      " deliveryStatus, attempts, sentAt," +
      " CASE WHEN eventId IN (" + sendEvents + ") THEN lastError ELSE '' END AS lastError," +
      " verificationToken, createdAt" +
      " FROM candidates" + filtered +
      " ORDER BY issuedAt DESC, createdAt DESC LIMIT {:limit} OFFSET {:offset}"
  ).bind(params).all(dbRows)

  return dbRows.map(function (row) {
    var item = access.byId[String(row.eventId || "")] || { registrationView: false, send: false }
    return {
      certificateId: String(row.certificateId || ""),
      eventId: String(row.eventId || ""),
      eventTitle: String(row.eventTitle || ""),
      recipientName: String(row.recipientName || ""),
      recipientEmail: item.registrationView ? String(row.recipientEmail || "") : "",
      credentialId: String(row.credentialId || ""),
      certificateType: String(row.certificateType || ""),
      status: String(row.certificateStatus || "active"),
      issuedAt: String(row.issuedAt || ""),
      issuerName: String(row.issuerName || ""),
      batchId: String(row.batchId || ""),
      deliveryStatus: String(row.deliveryStatus || ""),
      attempts: Number(row.attempts) || 0,
      sentAt: String(row.sentAt || ""),
      lastError: item.send ? String(row.lastError || "") : "",
      verificationUrl: siteUrl() + "/c/" + encodeURIComponent(String(row.verificationToken || "")),
    }
  })
}

function registryEvents(app, access, status, certificateType) {
  if (!access.ids.length) return []
  var params = {}
  var where = baseWhere(access, status, certificateType, "", params, "options")
  var rows = arrayOf(new DynamicModel({ eventId: "" }))
  app.db().newQuery(
    "SELECT DISTINCT c.event AS eventId FROM certificates c WHERE " + where
  ).bind(params).all(rows)
  var events = []
  for (var i = 0; i < rows.length; i++) {
    var item = access.byId[String(rows[i].eventId || "")]
    if (item && item.event) events.push(eventPayload(item.event))
  }
  events.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)) })
  return events
}

function registry(app, auth, e) {
  var eventId = query(e, "event")
  var status = query(e, "status")
  var certificateType = query(e, "type")
  var delivery = query(e, "delivery")
  var search = query(e, "search")
  var page = clampInt(query(e, "page"), 1, 1, 100000)
  var perPage = clampInt(query(e, "perPage"), 40, 1, 200)

  if (eventId) {
    var requestedEvent = eventRecord(app, eventId)
    if (!requestedEvent || !canViewEvent(app, auth, requestedEvent)) return { forbidden: true }
  }

  var access = certificateEventAccess(app, auth, eventId)
  if (!access.ids.length) {
    return { page: page, perPage: perPage, total: 0, totalPages: 1, summary: emptySummary(), events: [], certificates: [] }
  }

  var params = {}
  var where = baseWhere(access, status, certificateType, search, params, "main")
  var candidates = candidateSql(where)
  var summary = registrySummary(app, candidates, params, delivery)
  var rows = registryRows(app, candidates, params, delivery, page, perPage, access)

  return {
    page: page,
    perPage: perPage,
    total: summary.total,
    totalPages: Math.max(1, Math.ceil(summary.total / perPage)),
    summary: summary,
    events: registryEvents(app, access, status, certificateType),
    certificates: rows,
  }
}

module.exports = {
  registry: registry,
}
