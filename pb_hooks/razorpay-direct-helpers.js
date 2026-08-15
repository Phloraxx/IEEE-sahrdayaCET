/// <reference path="../pb_data/types.d.ts" />

var PROVIDER = "razorpay"
var DEFAULT_API_BASE = "https://api.razorpay.com"
var DEFAULT_HOLD_SECONDS = 600

function asObject(value) {
  if (!value) return {}
  if (typeof value === "object" && typeof value.string === "function") {
    try { value = JSON.parse(String(value.string() || "{}")) } catch (_) { return {} }
  } else if (Array.isArray(value)) {
    try {
      var text = ""
      for (var i = 0; i < value.length; i++) text += String.fromCharCode(Number(value[i]) || 0)
      value = JSON.parse(text)
    } catch (_) { return {} }
  } else if (typeof value === "string") {
    try { value = JSON.parse(value) } catch (_) { return {} }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  var copy = {}
  var keys = Object.keys(value)
  for (var k = 0; k < keys.length; k++) copy[keys[k]] = value[keys[k]]
  return copy
}
function mergeObject(current, patch) {
  var result = asObject(current)
  var keys = Object.keys(patch || {})
  for (var i = 0; i < keys.length; i++) result[keys[i]] = patch[keys[i]]
  return result
}

function envBool(name, defaultValue) {
  var raw = String($os.getenv(name) || "").trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true
  return defaultValue
}

function getConfig() {
  var hold = Number($os.getenv("RAZORPAY_CHECKOUT_HOLD_SECONDS") || DEFAULT_HOLD_SECONDS)
  if (!isFinite(hold) || Math.floor(hold) !== hold || hold < 60 || hold > 3600) hold = DEFAULT_HOLD_SECONDS
  return {
    apiBaseUrl: String($os.getenv("RAZORPAY_API_BASE_URL") || DEFAULT_API_BASE).trim().replace(/\/+$/, ""),
    keyId: String($os.getenv("RAZORPAY_KEY_ID") || "").trim(),
    keySecret: String($os.getenv("RAZORPAY_KEY_SECRET") || "").trim(),
    webhookSecret: String($os.getenv("RAZORPAY_WEBHOOK_SECRET") || "").trim(),
    holdSeconds: hold,
    paymentsEnabled: envBool("PAYMENTS_ENABLED", true),
  }
}
function apiConfigured(config) {
  return !!(config && config.apiBaseUrl && config.keyId && config.keySecret)
}

function webhookConfigured(config) {
  return !!(config && config.webhookSecret)
}

function base64Ascii(text) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  var output = ""
  for (var i = 0; i < text.length; i += 3) {
    var a = text.charCodeAt(i)
    var b = i + 1 < text.length ? text.charCodeAt(i + 1) : NaN
    var c = i + 2 < text.length ? text.charCodeAt(i + 2) : NaN
    if (a > 127 || (!isNaN(b) && b > 127) || (!isNaN(c) && c > 127)) {
      throw new Error("Razorpay credentials must be ASCII")
    }
    var triple = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c)
    output += alphabet[(triple >> 18) & 63]
    output += alphabet[(triple >> 12) & 63]
    output += isNaN(b) ? "=" : alphabet[(triple >> 6) & 63]
    output += isNaN(c) ? "=" : alphabet[triple & 63]
  }
  return output
}

function apiRequest(config, path, method, body, headers) {
  var requestHeaders = headers || {}
  requestHeaders.Accept = "application/json"
  requestHeaders.Authorization = "Basic " + base64Ascii(config.keyId + ":" + config.keySecret)
  var options = {
    url: config.apiBaseUrl + path,
    method: method || "GET",
    headers: requestHeaders,
    timeout: 8,
  }
  if (body !== undefined && body !== null) {
    options.body = typeof body === "string" ? body : JSON.stringify(body)
    options.headers["Content-Type"] = "application/json"
  }
  return $http.send(options)
}

function expectedPaise(registration) {
  var paise = registration ? Number(registration.getInt("finalFeePaise") || 0) : 0
  if (!paise && registration) {
    var rupees = Number(registration.get("amount") || 0)
    paise = rupees * 100
  }
  if (!isFinite(paise) || Math.floor(paise) !== paise || paise <= 0 || !Number.isSafeInteger(paise)) return 0
  return paise
}

function receiptForRegistration(registrationId) {
  var id = String(registrationId || "").replace(/[^a-zA-Z0-9_-]/g, "")
  return ("ieee_reg_" + id).slice(0, 40)
}

function holdExpiresAt(config, nowMs) {
  var base = typeof nowMs === "number" ? nowMs : Date.now()
  return new Date(base + (config.holdSeconds * 1000)).toISOString()
}
function providerIso(seconds) {
  var value = Number(seconds)
  if (!isFinite(value) || value <= 0) return ""
  try { return new Date(value * 1000).toISOString() } catch (_) { return "" }
}

function validateOrder(raw, registration) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid Razorpay order response" }
  var id = String(raw.id || "").trim()
  var amount = Number(raw.amount)
  var currency = String(raw.currency || "").trim().toUpperCase()
  var receipt = String(raw.receipt || "").trim()
  var status = String(raw.status || "").trim()
  if (id.indexOf("order_") !== 0) return { ok: false, error: "Invalid Razorpay order id" }
  if (amount !== expectedPaise(registration) || currency !== "INR") return { ok: false, error: "Razorpay order amount or currency mismatch" }
  if (receipt !== receiptForRegistration(registration.id)) return { ok: false, error: "Razorpay order receipt mismatch" }
  if (status !== "created" && status !== "attempted" && status !== "paid") return { ok: false, error: "Invalid Razorpay order status" }
  return { ok: true, order: {
    id: id,
    amountPaise: amount,
    currency: currency,
    receipt: receipt,
    status: status,
    attempts: Number(raw.attempts) || 0,
    amountPaid: Number(raw.amount_paid) || 0,
    amountDue: Number(raw.amount_due) || 0,
    createdAt: providerIso(raw.created_at),
  } }
}
function validatePayment(raw, registration, providerOrderId, expectedPaymentId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid Razorpay payment response" }
  var id = String(raw.id || "").trim()
  var orderId = String(raw.order_id || "").trim()
  var amount = Number(raw.amount)
  var amountRefunded = Number(raw.amount_refunded || 0)
  var currency = String(raw.currency || "").trim().toUpperCase()
  var status = String(raw.status || "").trim()
  var allowed = { created: true, authorized: true, captured: true, refunded: true, failed: true }
  if (id.indexOf("pay_") !== 0 || (expectedPaymentId && id !== expectedPaymentId)) return { ok: false, error: "Razorpay payment id mismatch" }
  if (orderId !== providerOrderId) return { ok: false, error: "Razorpay payment order mismatch" }
  if (amount !== expectedPaise(registration) || currency !== "INR") return { ok: false, error: "Razorpay payment amount or currency mismatch" }
  if (!allowed[status]) return { ok: false, error: "Invalid Razorpay payment status" }
  if (!isFinite(amountRefunded) || Math.floor(amountRefunded) !== amountRefunded || amountRefunded < 0 || amountRefunded > amount) {
    return { ok: false, error: "Invalid Razorpay refunded amount" }
  }
  return { ok: true, payment: {
    id: id,
    orderId: orderId,
    amountPaise: amount,
    amountRefundedPaise: amountRefunded,
    currency: currency,
    status: status,
    method: String(raw.method || "").trim(),
    captured: raw.captured === true || status === "captured" || status === "refunded",
    createdAt: providerIso(raw.created_at),
  } }
}
function validateRefund(raw, payment, refund) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid Razorpay refund response" }
  var id = String(raw.id || "").trim()
  var paymentId = String(raw.payment_id || "").trim()
  var amount = Number(raw.amount)
  var currency = String(raw.currency || "").trim().toUpperCase()
  var status = String(raw.status || "").trim()
  if (id.indexOf("rfnd_") !== 0) return { ok: false, error: "Invalid Razorpay refund id" }
  if (!payment || paymentId !== payment.getString("capturedPaymentId")) return { ok: false, error: "Razorpay refund payment mismatch" }
  if (!refund || amount !== Number(refund.getInt("amountPaise") || 0) || currency !== "INR") return { ok: false, error: "Razorpay refund amount or currency mismatch" }
  if (status !== "pending" && status !== "processed" && status !== "failed") return { ok: false, error: "Invalid Razorpay refund status" }
  return { ok: true, refund: { id: id, paymentId: paymentId, amountPaise: amount, currency: currency, status: status, createdAt: providerIso(raw.created_at) } }
}

function verifyCheckoutSignature(orderId, paymentId, signature, keySecret) {
  var actual = String(signature || "").trim()
  if (!orderId || !paymentId || !actual || !keySecret) return false
  var expected = $security.hs256(String(orderId) + "|" + String(paymentId), String(keySecret))
  return $security.equal(expected, actual)
}

function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  var actual = String(signature || "").trim()
  if (!actual || !webhookSecret) return false
  var expected = $security.hs256(String(rawBody || ""), String(webhookSecret))
  return $security.equal(expected, actual)
}

function createOrderPayload(registration) {
  return {
    amount: expectedPaise(registration),
    currency: "INR",
    receipt: receiptForRegistration(registration.id),
    notes: {
      registration_id: registration.id,
      event_id: registration.getString("event") || "",
      payment_ticket_id: registration.getString("paymentTicketId") || "",
    },
  }
}

function findRemoteOrderByReceipt(config, registration) {
  var receipt = receiptForRegistration(registration.id)
  var response = apiRequest(config, "/v1/orders?receipt=" + encodeURIComponent(receipt) + "&count=20", "GET", null, {})
  if (response.statusCode !== 200 || !response.json || !Array.isArray(response.json.items)) return { ok: false, statusCode: response.statusCode }
  var exact = []
  for (var i = 0; i < response.json.items.length; i++) {
    if (String(response.json.items[i].receipt || "") === receipt) exact.push(response.json.items[i])
  }
  if (exact.length === 0) return { ok: true, order: null }
  if (exact.length !== 1) return { ok: false, error: "Multiple Razorpay orders matched the registration receipt" }
  return { ok: true, order: exact[0] }
}
function createOrRecoverOrder(config, registration) {
  var existing = findRemoteOrderByReceipt(config, registration)
  if (!existing.ok) return { ok: false, statusCode: existing.statusCode, error: existing.error || "Could not check existing Razorpay order" }
  if (existing.order) return { ok: true, raw: existing.order, recovered: true }

  var response
  try {
    response = apiRequest(config, "/v1/orders", "POST", createOrderPayload(registration), {})
  } catch (err) {
    try {
      var recovered = findRemoteOrderByReceipt(config, registration)
      if (recovered.ok && recovered.order) return { ok: true, raw: recovered.order, recovered: true }
    } catch (_) {}
    return { ok: false, error: "Razorpay order creation was interrupted; retry after reconciliation", cause: err }
  }
  if (response.statusCode === 200 || response.statusCode === 201) return { ok: true, raw: response.json, recovered: false }

  try {
    var afterFailure = findRemoteOrderByReceipt(config, registration)
    if (afterFailure.ok && afterFailure.order) return { ok: true, raw: afterFailure.order, recovered: true }
  } catch (_) {}
  return { ok: false, statusCode: response.statusCode, error: "Razorpay could not create the order" }
}

function findLedgerPayment(app, registrationId) {
  try {
    var rows = app.findRecordsByFilter("payments", "registration = {:registration}", "-created", 1, 0, { registration: registrationId })
    return rows.length ? rows[0] : null
  } catch (_) { return null }
}

function compatibilityData(registration, payment, extra) {
  var current = asObject(registration.get("paymentData"))
  var finalPaise = payment ? Number(payment.getInt("finalFeePaise") || 0) : expectedPaise(registration)
  var patch = {
    provider: PROVIDER,
    providerStatus: payment ? payment.getString("status") || "not_initialized" : "not_initialized",
    paymentId: payment ? payment.id : "",
    requestedAmountPaise: finalPaise,
    payableAmountPaise: finalPaise,
    payableAmount: finalPaise > 0 ? (finalPaise / 100).toFixed(2) : "",
    expiresAt: payment ? payment.getString("holdExpiresAt") || "" : "",
    paidAt: payment ? payment.getString("capturedAt") || "" : "",
    razorpayOrderId: payment ? payment.getString("providerOrderId") || "" : "",
    razorpayPaymentId: payment ? payment.getString("capturedPaymentId") || "" : "",
    providerDisplayName: "Razorpay",
    paymentMethod: payment ? payment.getString("paymentMethod") || "" : "",
    amountRefundedPaise: payment ? Number(payment.getInt("refundedPaise") || 0) : 0,
    manualReview: payment ? payment.getBool("manualReview") : false,
    reviewReason: payment ? payment.getString("reviewReason") || "" : "",
    lastSyncedAt: payment ? payment.getString("lastSyncedAt") || "" : "",
  }
  var keys = Object.keys(extra || {})
  for (var i = 0; i < keys.length; i++) patch[keys[i]] = extra[keys[i]]
  return mergeObject(current, patch)
}

function paymentSession(registration, payment, config, providerReachable) {
  var data = compatibilityData(registration, payment, {})
  var eventPayload = null
  var eventId = registration.getString("event") || ""
  if (eventId) {
    try {
      var event = $app.findRecordById("events", eventId)
      var banner = event.getString("banner") || ""
      var bannerUrl = ""
      if (banner) try { bannerUrl = $app.filesystem().fileUrl(event, banner) } catch (_) {}
      eventPayload = { id: event.id, title: event.getString("title") || "", date: event.getString("date") || "", endDate: event.getString("endDate") || "", venue: event.getString("venue") || "", bannerUrl: bannerUrl }
    } catch (_) {}
  }
  return {
    registrationId: registration.id,
    registrationStatus: registration.getString("registrationStatus") || "",
    paymentStatus: registration.getString("paymentStatus") || "",
    amount: require(__hooks + "/registration-helpers.js").registrationAmount(registration),
    ticketId: registration.getString("ticketId") || "",
    paymentTicketId: registration.getString("paymentTicketId") || "",
    provider: PROVIDER,
    providerStatus: data.providerStatus || "not_initialized",
    paymentId: data.paymentId || "",
    requestedAmountPaise: Number(data.requestedAmountPaise) || 0,
    payableAmountPaise: Number(data.payableAmountPaise) || 0,
    payableAmount: data.payableAmount || "",
    createdAt: payment ? payment.getString("created") || "" : "",
    expiresAt: data.expiresAt || "",
    paidAt: data.paidAt || "",
    razorpayOrderId: data.razorpayOrderId || "",
    razorpayPaymentId: data.razorpayPaymentId || "",
    razorpayKeyId: config && config.keyId ? config.keyId : "",
    providerDisplayName: "Razorpay",
    manualReview: data.manualReview === true,
    reviewReason: data.reviewReason || "",
    providerReachable: providerReachable !== false,
    lastSyncedAt: data.lastSyncedAt || "",
    attendeeEmail: registration.getString("userEmail") || "",
    attendeePhone: registration.getString("userPhone") || "",
    event: eventPayload,
  }
}
function mayAccessRegistration(auth, registration) {
  if (!auth || !auth.id || !registration) return false
  if (auth.getString("role") === "admin") return true
  return registration.getString("user") === auth.id
}

function enqueueRegistrationNotifications(registrationId) {
  try {
    var registration = $app.findRecordById("registrations", registrationId)
    require(__hooks + "/notification-helpers.js").enqueueForRegistration(registration)
  } catch (err) {
    console.log("[razorpay] notification enqueue failed:", err)
  }
}

module.exports = {
  PROVIDER: PROVIDER,
  asObject: asObject,
  mergeObject: mergeObject,
  getConfig: getConfig,
  apiConfigured: apiConfigured,
  webhookConfigured: webhookConfigured,
  base64Ascii: base64Ascii,
  apiRequest: apiRequest,
  expectedPaise: expectedPaise,
  receiptForRegistration: receiptForRegistration,
  holdExpiresAt: holdExpiresAt,
  validateOrder: validateOrder,
  validatePayment: validatePayment,
  validateRefund: validateRefund,
  verifyCheckoutSignature: verifyCheckoutSignature,
  verifyWebhookSignature: verifyWebhookSignature,
  createOrderPayload: createOrderPayload,
  findRemoteOrderByReceipt: findRemoteOrderByReceipt,
  createOrRecoverOrder: createOrRecoverOrder,
  findLedgerPayment: findLedgerPayment,
  compatibilityData: compatibilityData,
  paymentSession: paymentSession,
  mayAccessRegistration: mayAccessRegistration,
  enqueueRegistrationNotifications: enqueueRegistrationNotifications,
}
