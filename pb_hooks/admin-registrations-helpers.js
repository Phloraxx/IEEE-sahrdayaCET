function queryValue(e, name) {
  try { return String(e.request.url.query().get(name) || "").trim() } catch (_) { return "" }
}

function error(e, status, code, message) {
  return e.json(status, { code: code, error: message })
}

function positiveInt(value, fallback, maximum) {
  if (!value) return fallback
  if (!/^\d+$/.test(value)) return null
  var parsed = Number(value)
  if (!isFinite(parsed) || parsed < 1 || parsed > maximum) return null
  return parsed
}

function eventRecord(app, id) {
  try { return app.findRecordById("events", id) } catch (_) { return null }
}

function registrationEventAccess(app, auth, requestedEventId) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var events = []
  if (requestedEventId) {
    var requested = eventRecord(app, requestedEventId)
    if (!requested) return { error: { status: 404, code: "EVENT_NOT_FOUND", message: "Event not found" } }
    if (!authz.hasEventCapability(app, auth, "registrations.view", requested)) {
      return { error: { status: 403, code: "FORBIDDEN", message: "You cannot view registrations for this event" } }
    }
    events.push(requested)
  } else {
    try { events = app.findRecordsByFilter("events", "1 = 1", "id", 0, 0) } catch (_) { events = [] }
  }

  var access = []
  for (var i = 0; i < events.length; i++) {
    var event = events[i]
    if (!event || !authz.hasEventCapability(app, auth, "registrations.view", event)) continue
    access.push({
      event: event,
      finance: authz.hasEventCapability(app, auth, "finance.view", event) ||
        authz.hasEventCapability(app, auth, "finance.manage", event),
    })
  }
  return { access: access }
}

function dateBoundary(value) {
  if (!value) return null
  var parsed = Date.parse(value)
  return isFinite(parsed) ? new Date(parsed).toISOString() : false
}

function registrationQuery(e) {
  var page = positiveInt(queryValue(e, "page"), 1, 1000000)
  var perPage = positiveInt(queryValue(e, "perPage"), 40, 500)
  if (page === null || perPage === null) return { error: "Pagination must use positive integer page and perPage values" }

  var attentionValue = queryValue(e, "attention")
  if (attentionValue && attentionValue !== "0" && attentionValue !== "1") {
    return { error: "attention must be 1 or 0" }
  }
  var registeredFromValue = queryValue(e, "registeredFrom") || queryValue(e, "registrationDateFrom")
  var registeredToValue = queryValue(e, "registeredTo") || queryValue(e, "registrationDateTo")
  var registeredFrom = dateBoundary(registeredFromValue)
  var registeredTo = dateBoundary(registeredToValue)
  if (registeredFrom === false || registeredTo === false) return { error: "Registration date bounds must be valid dates" }
  if (registeredFrom !== null && registeredTo !== null && Date.parse(registeredFrom) > Date.parse(registeredTo)) {
    return { error: "registeredFrom cannot be after registeredTo" }
  }

  return {
    page: page,
    perPage: perPage,
    eventId: queryValue(e, "event"),
    status: queryValue(e, "status"),
    paymentStatus: queryValue(e, "paymentStatus") || queryValue(e, "payment"),
    source: queryValue(e, "source"),
    search: queryValue(e, "search"),
    attention: attentionValue === "1",
    registeredFrom: registeredFrom,
    registeredTo: registeredTo,
  }
}

function queryNeedsFinance(filters) {
  return !!(filters.attention || (filters.paymentStatus && filters.paymentStatus !== "all"))
}

function accessForQuery(access, filters) {
  if (!queryNeedsFinance(filters)) return { access: access }
  var financeAccess = []
  for (var i = 0; i < access.length; i++) if (access[i].finance) financeAccess.push(access[i])
  if (!financeAccess.length) {
    return { error: { status: 403, code: "FINANCE_FORBIDDEN", message: "Finance permission is required for payment or attention filters" } }
  }
  return { access: financeAccess }
}

function copyParams(input) {
  var out = {}
  Object.keys(input).forEach(function (key) { out[key] = input[key] })
  return out
}

function bindEventAccess(params, prefix, access) {
  var placeholders = []
  for (var i = 0; i < access.length; i++) {
    var key = prefix + i
    params[key] = access[i].event.id
    placeholders.push("{:" + key + "}")
  }
  return placeholders.join(",")
}

function registrationWhere(access, filters, params) {
  var parts = ["r.event IN (" + bindEventAccess(params, "event", access) + ")"]
  if (filters.status && filters.status !== "all") {
    params.status = filters.status
    parts.push("r.registrationStatus = {:status}")
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    params.paymentStatus = filters.paymentStatus
    parts.push("r.paymentStatus = {:paymentStatus}")
  }
  if (filters.source && filters.source !== "all") {
    params.source = filters.source
    parts.push("COALESCE(NULLIF(r.registrationSource, ''), 'self_service') = {:source}")
  }
  if (filters.registeredFrom) {
    params.registeredFrom = filters.registeredFrom
    parts.push("julianday(NULLIF(r.registrationDate, '')) >= julianday({:registeredFrom})")
  }
  if (filters.registeredTo) {
    params.registeredTo = filters.registeredTo
    parts.push("julianday(NULLIF(r.registrationDate, '')) <= julianday({:registeredTo})")
  }
  if (filters.search) {
    params.search = String(filters.search).toLowerCase()
    var term = "{:search}"
    parts.push("(" + [
      "instr(lower(COALESCE(r.userName, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.userEmail, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.userPhone, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.ticketId, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.programmeCode, '')), " + term + ") > 0",
      "instr(lower(COALESCE(ev.title, '')), " + term + ") > 0",
    ].join(" OR ") + ")")
  }
  if (filters.attention) {
    params.staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    parts.push("(" + [
      "COALESCE(CASE WHEN json_valid(r.paymentData) THEN json_extract(r.paymentData, '$.manualReview') ELSE 0 END, 0) = 1",
      "(r.registrationStatus = 'cancelled' AND r.paymentStatus = 'paid')",
      "(r.registrationStatus = 'pending' AND r.paymentStatus = 'pending' AND julianday(NULLIF(r.registrationDate, '')) <= julianday({:staleBefore}))",
    ].join(" OR ") + ")")
  }
  return parts.join(" AND ")
}

function findRegistrationPage(app, access, filters) {
  if (!access.length) return { rows: [], total: 0 }
  var params = {}
  var where = registrationWhere(access, filters, params)
  var totalModel = new DynamicModel({ total: 0 })
  app.db().newQuery(
    "SELECT COUNT(*) AS total FROM registrations r LEFT JOIN events ev ON ev.id = r.event WHERE " + where
  ).bind(params).one(totalModel)

  var pageParams = copyParams(params)
  pageParams.limit = filters.perPage
  pageParams.offset = (filters.page - 1) * filters.perPage
  var ids = arrayOf(new DynamicModel({ id: "" }))
  app.db().newQuery(
    "SELECT r.id AS id FROM registrations r LEFT JOIN events ev ON ev.id = r.event WHERE " + where +
    " ORDER BY julianday(NULLIF(r.registrationDate, '')) DESC, r.id DESC" +
    " LIMIT {:limit} OFFSET {:offset}"
  ).bind(pageParams).all(ids)

  var byEvent = {}
  for (var ai = 0; ai < access.length; ai++) byEvent[access[ai].event.id] = access[ai]
  var rows = []
  for (var ri = 0; ri < ids.length; ri++) {
    var record
    try { record = app.findRecordById("registrations", String(ids[ri].id || "")) } catch (_) { record = null }
    if (!record) continue
    var eventId = record.getString("event") || ""
    var item = byEvent[eventId]
    if (item) rows.push({ record: record, event: item.event, finance: item.finance })
  }
  return { rows: rows, total: Number(totalModel.total) || 0 }
}

module.exports = {
  error: error,
  eventRecord: eventRecord,
  registrationEventAccess: registrationEventAccess,
  registrationQuery: registrationQuery,
  accessForQuery: accessForQuery,
  findRegistrationPage: findRegistrationPage,
}
