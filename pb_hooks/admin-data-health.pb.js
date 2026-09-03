/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/admin/data-health", function (e) {
  if (!e.auth || e.auth.getString("role") !== "admin") {
    return e.json(403, { code: "FORBIDDEN", error: "Administrator access required" })
  }

  var DATA_HEALTH_ROW_LIMIT = 500
  function dataHealthRows(sql, shape) {
    var rows = arrayOf(new DynamicModel(shape))
    $app.db().newQuery(sql).all(rows)
    return rows
  }
  function dataHealthText(value) {
    return value === null || value === undefined ? "" : String(value)
  }
  function dataHealthNumber(value) {
    var number = Number(value)
    return isFinite(number) ? number : 0
  }
  function dataHealthTruncated(issues, key, label, rows) {
    if (rows.length <= DATA_HEALTH_ROW_LIMIT) return
    issues.push({
      id: "truncated:" + key,
      severity: "warning",
      category: "Data Health",
      title: label + " anomaly results truncated",
      detail: "More than " + DATA_HEALTH_ROW_LIMIT + " matching records exist. Resolve the listed issues, then run the check again.",
    })
  }

  var counts = new DynamicModel({
    eventCount: 0,
    registrationCount: 0,
    couponCount: 0,
    notificationCount: 0,
    paymentCount: 0,
    refundCount: 0,
    webhookCount: 0,
  })
  $app.db().newQuery(
    "SELECT " +
    "(SELECT COUNT(*) FROM events WHERE COALESCE(isDeleted, 0) != 1) AS eventCount, " +
    "(SELECT COUNT(*) FROM registrations) AS registrationCount, " +
    "(SELECT COUNT(*) FROM coupons) AS couponCount, " +
    "(SELECT COUNT(*) FROM notification_outbox WHERE status = 'failed' AND attempts >= 8) AS notificationCount, " +
    "(SELECT COUNT(*) FROM payments) AS paymentCount, " +
    "(SELECT COUNT(*) FROM payment_refunds WHERE status = 'failed') AS refundCount, " +
    "(SELECT COUNT(*) FROM payment_webhook_events WHERE status = 'failed' AND attempts >= 8) AS webhookCount"
  ).one(counts)

  var issues = []
  var pendingCheckins = dataHealthRows(
    "SELECT id, COALESCE(userName, '') AS userName, COALESCE(userEmail, '') AS userEmail " +
    "FROM registrations WHERE checkedIn = 1 AND registrationStatus = 'pending' " +
    "ORDER BY registrationDate DESC, id DESC LIMIT 501",
    { id: "", userName: "", userEmail: "" }
  )
  for (var pi = 0; pi < Math.min(pendingCheckins.length, DATA_HEALTH_ROW_LIMIT); pi++) {
    var pending = pendingCheckins[pi]
    var pendingName = dataHealthText(pending.userName) || dataHealthText(pending.userEmail) || dataHealthText(pending.id)
    issues.push({
      id: "checkin:" + pending.id,
      severity: "critical",
      category: "Registration",
      title: pendingName + " is checked in while registration is pending",
      detail: "A pending registration should never be actively checked in.",
      href: "/admin/registrations/" + pending.id,
    })
  }
  dataHealthTruncated(issues, "pending-checkins", "Pending check-in", pendingCheckins)

  var eventDrift = dataHealthRows(
    "WITH actual AS (" +
    " SELECT event AS eventId," +
    " SUM(CASE WHEN COALESCE(registrationStatus, '') != 'cancelled' THEN 1 ELSE 0 END) AS activeCount," +
    " SUM(CASE WHEN registrationStatus = 'confirmed' AND checkedIn = 1 THEN 1 ELSE 0 END) AS checkedCount" +
    " FROM registrations GROUP BY event" +
    ") " +
    "SELECT e.id AS id, COALESCE(e.title, e.id) AS title," +
    " COALESCE(e.registeredCount, 0) AS cachedActive, COALESCE(e.checkedInCount, 0) AS cachedChecked," +
    " COALESCE(a.activeCount, 0) AS actualActive, COALESCE(a.checkedCount, 0) AS actualChecked" +
    " FROM events e LEFT JOIN actual a ON a.eventId = e.id" +
    " WHERE COALESCE(e.isDeleted, 0) != 1 AND (" +
    " COALESCE(e.registeredCount, 0) != COALESCE(a.activeCount, 0) OR" +
    " COALESCE(e.checkedInCount, 0) != COALESCE(a.checkedCount, 0))" +
    " ORDER BY e.date DESC, e.id DESC LIMIT 501",
    { id: "", title: "", cachedActive: 0, cachedChecked: 0, actualActive: 0, actualChecked: 0 }
  )
  for (var ei = 0; ei < Math.min(eventDrift.length, DATA_HEALTH_ROW_LIMIT); ei++) {
    var eventRow = eventDrift[ei]
    if (dataHealthNumber(eventRow.cachedActive) !== dataHealthNumber(eventRow.actualActive)) {
      issues.push({ id: "event-count:" + eventRow.id, severity: "warning", category: "Counters",
        title: dataHealthText(eventRow.title) + ": registration counter drift",
        detail: "Cached " + dataHealthNumber(eventRow.cachedActive) + "; actual active registrations " + dataHealthNumber(eventRow.actualActive) + ".",
        href: "/admin/events/" + eventRow.id })
    }
    if (dataHealthNumber(eventRow.cachedChecked) !== dataHealthNumber(eventRow.actualChecked)) {
      issues.push({ id: "checkin-count:" + eventRow.id, severity: "warning", category: "Counters",
        title: dataHealthText(eventRow.title) + ": check-in counter drift",
        detail: "Cached " + dataHealthNumber(eventRow.cachedChecked) + "; actual confirmed check-ins " + dataHealthNumber(eventRow.actualChecked) + ".",
        href: "/admin/events/" + eventRow.id })
    }
  }
  dataHealthTruncated(issues, "event-counters", "Event counter", eventDrift)

  var couponDrift = dataHealthRows(
    "WITH actual AS (" +
    " SELECT event AS eventId, couponCode AS code, COUNT(*) AS actualUses" +
    " FROM registrations" +
    " WHERE COALESCE(couponCode, '') != '' AND COALESCE(registrationStatus, '') != 'cancelled'" +
    " GROUP BY event, couponCode" +
    ") " +
    "SELECT c.id AS id, c.event AS eventId, COALESCE(c.code, '') AS code," +
    " COALESCE(c.usedCount, 0) AS cachedUses, COALESCE(a.actualUses, 0) AS actualUses" +
    " FROM coupons c LEFT JOIN actual a ON a.eventId = c.event AND a.code = c.code" +
    " WHERE COALESCE(c.usedCount, 0) != COALESCE(a.actualUses, 0)" +
    " ORDER BY c.updated DESC LIMIT 501",
    { id: "", eventId: "", code: "", cachedUses: 0, actualUses: 0 }
  )
  for (var ci = 0; ci < Math.min(couponDrift.length, DATA_HEALTH_ROW_LIMIT); ci++) {
    var coupon = couponDrift[ci]
    issues.push({
      id: "coupon:" + coupon.id,
      severity: "warning",
      category: "Counters",
      title: "Coupon " + dataHealthText(coupon.code) + ": usage counter drift",
      detail: "Cached " + dataHealthNumber(coupon.cachedUses) + "; actual active uses " + dataHealthNumber(coupon.actualUses) + ".",
      href: "/admin/events/" + coupon.eventId,
    })
  }
  dataHealthTruncated(issues, "coupon-counters", "Coupon counter", couponDrift)

  var paymentRows = dataHealthRows(
    "SELECT p.id AS id, p.registration AS registrationId, COALESCE(r.id, '') AS registrationRecordId," +
    " COALESCE(p.provider, '') AS provider, COALESCE(p.status, '') AS status," +
    " COALESCE(p.finalFeePaise, 0) AS finalFeePaise, COALESCE(p.collectedPaise, 0) AS collectedPaise," +
    " COALESCE(p.capturedPaymentId, '') AS capturedPaymentId, COALESCE(r.paymentStatus, '') AS registrationPaymentStatus," +
    " COALESCE(p.holdExpiresAt, '') AS holdExpiresAt, COALESCE(p.lastSyncedAt, '') AS lastSyncedAt," +
    " COALESCE(p.manualReview, 0) AS manualReview, COALESCE(p.reviewReason, '') AS reviewReason" +
    " FROM payments p LEFT JOIN registrations r ON r.id = p.registration" +
    " WHERE r.id IS NULL" +
    " OR (p.provider = 'razorpay' AND p.status IN ('captured','partially_refunded','refunded') AND COALESCE(p.capturedPaymentId, '') = '')" +
    " OR (p.provider = 'razorpay' AND p.status = 'captured' AND COALESCE(p.finalFeePaise, 0) > 0 AND COALESCE(p.collectedPaise, 0) != COALESCE(p.finalFeePaise, 0))" +
    " OR (p.status IN ('captured','partially_refunded') AND COALESCE(r.paymentStatus, '') != 'paid')" +
    " OR (p.status = 'refunded' AND COALESCE(r.paymentStatus, '') != 'refunded')" +
    " OR (p.provider = 'razorpay' AND p.status = 'authorized' AND NULLIF(p.lastSyncedAt, '') IS NOT NULL" +
    "     AND (julianday('now') - julianday(p.lastSyncedAt)) * 86400 > 120)" +
    " OR (p.status IN ('pending','authorized') AND NULLIF(p.holdExpiresAt, '') IS NOT NULL" +
    "     AND (julianday('now') - julianday(p.holdExpiresAt)) * 86400 > 120)" +
    " OR COALESCE(p.manualReview, 0) = 1" +
    " ORDER BY p.updated DESC LIMIT 501",
    { id: "", registrationId: "", registrationRecordId: "", provider: "", status: "", finalFeePaise: 0,
      collectedPaise: 0, capturedPaymentId: "", registrationPaymentStatus: "", holdExpiresAt: "", lastSyncedAt: "",
      manualReview: false, reviewReason: "" }
  )
  var now = Date.now()
  for (var payi = 0; payi < Math.min(paymentRows.length, DATA_HEALTH_ROW_LIMIT); payi++) {
    var payment = paymentRows[payi]
    var registrationId = dataHealthText(payment.registrationId)
    var provider = dataHealthText(payment.provider)
    var status = dataHealthText(payment.status)
    var registrationPaymentStatus = dataHealthText(payment.registrationPaymentStatus)
    var finalPaise = dataHealthNumber(payment.finalFeePaise)
    var collectedPaise = dataHealthNumber(payment.collectedPaise)

    if (!dataHealthText(payment.registrationRecordId)) {
      issues.push({ id: "payment-orphan:" + payment.id, severity: "critical", category: "Payment",
        title: "Payment has no registration", detail: "Ledger record " + payment.id + " points to a missing registration." })
      continue
    }
    if (provider === "razorpay" && (status === "captured" || status === "partially_refunded" || status === "refunded") && !dataHealthText(payment.capturedPaymentId)) {
      issues.push({ id: "payment-id:" + payment.id, severity: "critical", category: "Payment",
        title: "Captured Razorpay ledger is missing its payment ID",
        detail: "Provider-backed financial history must retain the Razorpay payment identifier.", href: "/admin/registrations/" + registrationId })
    }
    if (provider === "razorpay" && status === "captured" && finalPaise > 0 && collectedPaise !== finalPaise) {
      issues.push({ id: "payment-amount:" + payment.id, severity: "critical", category: "Payment",
        title: "Razorpay collection amount does not match the registration fee",
        detail: "Expected " + finalPaise + " paise; ledger collected " + collectedPaise + " paise.", href: "/admin/registrations/" + registrationId })
    }
    if ((status === "captured" || status === "partially_refunded") && registrationPaymentStatus !== "paid") {
      issues.push({ id: "payment-state:" + payment.id, severity: "critical", category: "Payment",
        title: "Ledger and registration disagree about a captured payment",
        detail: "Ledger is " + status + "; registration payment state is " + (registrationPaymentStatus || "empty") + ".",
        href: "/admin/registrations/" + registrationId })
    }
    if (status === "refunded" && registrationPaymentStatus !== "refunded") {
      issues.push({ id: "refund-state:" + payment.id, severity: "critical", category: "Payment",
        title: "Refunded ledger and registration are out of sync",
        detail: "Registration payment state is " + (registrationPaymentStatus || "empty") + ".",
        href: "/admin/registrations/" + registrationId })
    }
    var hold = Date.parse(dataHealthText(payment.holdExpiresAt))
    var lastSynced = Date.parse(dataHealthText(payment.lastSyncedAt))
    if (provider === "razorpay" && status === "authorized" && isFinite(lastSynced) && now - lastSynced > 2 * 60_000) {
      issues.push({ id: "authorized-payment:" + payment.id, severity: "warning", category: "Payment",
        title: "Razorpay payment is authorized but not captured",
        detail: "The payment has remained authorized for over two minutes. Verify Razorpay auto-capture and merchant capture settings before paid registrations go live.",
        href: "/admin/registrations/" + registrationId })
    }
    if ((status === "pending" || status === "authorized") && isFinite(hold) && now - hold > 2 * 60_000) {
      issues.push({ id: "stale-payment:" + payment.id, severity: "warning", category: "Payment",
        title: "Payment hold is stale", detail: "The checkout hold expired more than two minutes ago and should have been reconciled/released.",
        href: "/admin/registrations/" + registrationId })
    }
    if (Boolean(payment.manualReview)) {
      issues.push({ id: "payment-review:" + payment.id, severity: "warning", category: "Payment",
        title: "Payment requires manual review",
        detail: dataHealthText(payment.reviewReason) || "The payment ledger is flagged for administrator review.",
        href: "/admin/registrations/" + registrationId })
    }
  }
  dataHealthTruncated(issues, "payments", "Payment", paymentRows)

  var notificationRows = dataHealthRows(
    "SELECT id, COALESCE(attempts, 0) AS attempts FROM notification_outbox " +
    "WHERE status = 'failed' AND attempts >= 8 ORDER BY lastAttemptAt DESC, id DESC LIMIT 501",
    { id: "", attempts: 0 }
  )
  for (var ni = 0; ni < Math.min(notificationRows.length, DATA_HEALTH_ROW_LIMIT); ni++) {
    issues.push({ id: "notification:" + notificationRows[ni].id, severity: "warning", category: "Notification",
      title: "Notification exhausted retries",
      detail: "Delivery failed after " + dataHealthNumber(notificationRows[ni].attempts) + " attempts." })
  }
  dataHealthTruncated(issues, "notifications", "Notification", notificationRows)

  var refundRows = dataHealthRows(
    "SELECT id, COALESCE(attempts, 0) AS attempts, COALESCE(failureReason, '') AS failureReason " +
    "FROM payment_refunds WHERE status = 'failed' ORDER BY updated DESC LIMIT 501",
    { id: "", attempts: 0, failureReason: "" }
  )
  for (var ri = 0; ri < Math.min(refundRows.length, DATA_HEALTH_ROW_LIMIT); ri++) {
    var refund = refundRows[ri]
    var refundAttempts = dataHealthNumber(refund.attempts)
    issues.push({ id: "refund:" + refund.id, severity: refundAttempts >= 8 ? "critical" : "warning", category: "Refund",
      title: "Razorpay refund failed",
      detail: (dataHealthText(refund.failureReason) || "Provider refund failed.") + " Attempts: " + refundAttempts + "." })
  }
  dataHealthTruncated(issues, "refunds", "Refund", refundRows)

  var webhookRows = dataHealthRows(
    "SELECT id, COALESCE(attempts, 0) AS attempts, COALESCE(eventType, '') AS eventType " +
    "FROM payment_webhook_events WHERE status = 'failed' AND attempts >= 8 ORDER BY updated DESC LIMIT 501",
    { id: "", attempts: 0, eventType: "" }
  )
  for (var wi = 0; wi < Math.min(webhookRows.length, DATA_HEALTH_ROW_LIMIT); wi++) {
    var webhook = webhookRows[wi]
    var webhookAttempts = dataHealthNumber(webhook.attempts)
    issues.push({ id: "webhook:" + webhook.id, severity: "warning", category: "Webhook",
      title: "Razorpay webhook processing exhausted retries",
      detail: (dataHealthText(webhook.eventType) || "Webhook event") + " failed after " + webhookAttempts + " attempts." })
  }
  dataHealthTruncated(issues, "webhooks", "Webhook", webhookRows)

  var rank = { critical: 0, warning: 1 }
  issues.sort(function (a, b) {
    return rank[a.severity] - rank[b.severity] || a.category.localeCompare(b.category)
  })

  return e.json(200, {
    issues: issues,
    checkedAt: new Date().toISOString(),
    counts: {
      events: dataHealthNumber(counts.eventCount),
      registrations: dataHealthNumber(counts.registrationCount),
      coupons: dataHealthNumber(counts.couponCount),
      notifications: dataHealthNumber(counts.notificationCount),
      payments: dataHealthNumber(counts.paymentCount),
      refunds: dataHealthNumber(counts.refundCount),
      webhooks: dataHealthNumber(counts.webhookCount),
    },
  })
}, $apis.requireAuth("users"))
