function queryValue(e, name) {
  try { return String(e.request.url.query().get(name) || "").trim() } catch (_) { return "" }
}

function positiveInt(value, fallback, maximum) {
  if (!value) return fallback
  if (!/^\d+$/.test(value)) return null
  var parsed = Number(value)
  if (!isFinite(parsed) || parsed < 1 || parsed > maximum) return null
  return parsed
}

function paymentQuery(e) {
  var page = positiveInt(queryValue(e, "page"), 1, 1000000)
  var perPage = positiveInt(queryValue(e, "perPage"), 40, 100)
  if (page === null || perPage === null) return { error: "Pagination must use positive integer page and perPage values" }
  var attentionValue = queryValue(e, "attention")
  if (attentionValue && attentionValue !== "0" && attentionValue !== "1") {
    return { error: "attention must be 1 or 0" }
  }
  return {
    page: page,
    perPage: perPage,
    search: queryValue(e, "search"),
    attention: attentionValue === "1",
  }
}

function paymentWhere(filters, params) {
  var parts = []
  if (filters.search) {
    params.search = String(filters.search).toLowerCase()
    var term = "{:search}"
    parts.push("(" + [
      "instr(lower(COALESCE(p.providerOrderId, '')), " + term + ") > 0",
      "instr(lower(COALESCE(p.capturedPaymentId, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.userName, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.userEmail, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.userPhone, '')), " + term + ") > 0",
      "instr(lower(COALESCE(r.ticketId, '')), " + term + ") > 0",
      "instr(lower(COALESCE(ev.title, '')), " + term + ") > 0",
    ].join(" OR ") + ")")
  }
  if (filters.attention) {
    parts.push("(COALESCE(p.manualReview, 0) = 1 OR p.status = 'partially_refunded')")
  }
  return parts.length ? parts.join(" AND ") : "1 = 1"
}

function copyParams(input) {
  var out = {}
  Object.keys(input).forEach(function (key) { out[key] = input[key] })
  return out
}

function paymentRows(app, filters) {
  var params = {}
  var where = paymentWhere(filters, params)
  var totalModel = new DynamicModel({ total: 0 })
  app.db().newQuery(
    "SELECT COUNT(*) AS total FROM payments p" +
    " LEFT JOIN registrations r ON r.id = p.registration" +
    " LEFT JOIN events ev ON ev.id = p.event WHERE " + where
  ).bind(params).one(totalModel)

  var pageParams = copyParams(params)
  pageParams.limit = filters.perPage
  pageParams.offset = (filters.page - 1) * filters.perPage
  var rows = arrayOf(new DynamicModel({
    id: "", registrationId: "", eventId: "", attendeeName: "", attendeeEmail: "",
    eventTitle: "", provider: "", status: "", registrationStatus: "", paymentStatus: "",
    finalFeePaise: 0, collectedPaise: 0, refundedPaise: 0, paymentMethod: "",
    providerOrderId: "", capturedPaymentId: "", manualReview: false, reviewReason: "",
    createdAt: "", capturedAt: "",
  }))
  app.db().newQuery(
    "SELECT p.id AS id, p.registration AS registrationId, p.event AS eventId," +
    " COALESCE(r.userName, '') AS attendeeName, COALESCE(r.userEmail, '') AS attendeeEmail," +
    " COALESCE(ev.title, '') AS eventTitle, COALESCE(p.provider, '') AS provider," +
    " COALESCE(p.status, '') AS status, COALESCE(r.registrationStatus, '') AS registrationStatus," +
    " COALESCE(r.paymentStatus, '') AS paymentStatus, COALESCE(p.finalFeePaise, 0) AS finalFeePaise," +
    " COALESCE(p.collectedPaise, 0) AS collectedPaise, COALESCE(p.refundedPaise, 0) AS refundedPaise," +
    " COALESCE(p.paymentMethod, '') AS paymentMethod, COALESCE(p.providerOrderId, '') AS providerOrderId," +
    " COALESCE(p.capturedPaymentId, '') AS capturedPaymentId, COALESCE(p.manualReview, 0) AS manualReview," +
    " COALESCE(p.reviewReason, '') AS reviewReason, COALESCE(p.created, '') AS createdAt," +
    " COALESCE(p.capturedAt, '') AS capturedAt" +
    " FROM payments p LEFT JOIN registrations r ON r.id = p.registration" +
    " LEFT JOIN events ev ON ev.id = p.event WHERE " + where +
    " ORDER BY p.created DESC, p.id DESC LIMIT {:limit} OFFSET {:offset}"
  ).bind(pageParams).all(rows)
  return { rows: rows, total: Number(totalModel.total) || 0 }
}

function rupees(value) {
  var paise = Number(value)
  return isFinite(paise) && paise > 0 ? paise / 100 : 0
}

function projectPaymentRow(row) {
  return {
    id: String(row.id || ""),
    registrationId: String(row.registrationId || ""),
    eventId: String(row.eventId || ""),
    attendeeName: String(row.attendeeName || ""),
    attendeeEmail: String(row.attendeeEmail || ""),
    eventTitle: String(row.eventTitle || ""),
    provider: String(row.provider || "unknown"),
    status: String(row.status || "unknown"),
    registrationStatus: String(row.registrationStatus || ""),
    paymentStatus: String(row.paymentStatus || ""),
    feeAmount: rupees(row.finalFeePaise),
    collectedAmount: rupees(row.collectedPaise),
    refundedAmount: rupees(row.refundedPaise),
    paymentMethod: String(row.paymentMethod || ""),
    providerOrderId: String(row.providerOrderId || ""),
    capturedPaymentId: String(row.capturedPaymentId || ""),
    manualReview: Boolean(row.manualReview),
    reviewReason: String(row.reviewReason || ""),
    createdAt: String(row.createdAt || ""),
    capturedAt: String(row.capturedAt || ""),
  }
}

module.exports = {
  paymentQuery: paymentQuery,
  paymentRows: paymentRows,
  projectPaymentRow: projectPaymentRow,
}
