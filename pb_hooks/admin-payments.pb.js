/// <reference path="../pb_data/types.d.ts" />

// Branch-wide finance ledger projection. Browser clients never join the raw
// registrations collection; attendee identity is projected server-side after
// branch finance authorization succeeds.
routerAdd("GET", "/api/admin/payments", function (e) {
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasCapability($app, e.auth, "finance.view", {})) {
    return e.json(403, { code: "FORBIDDEN", error: "Branch finance access is required to view the payment desk" })
  }
  var helpers = require(__hooks + "/admin-payments-helpers.js")
  var filters = helpers.paymentQuery(e)
  if (filters.error) return e.json(400, { code: "INVALID_QUERY", error: filters.error })
  var result
  try { result = helpers.paymentRows($app, filters) }
  catch (_) { return e.json(500, { code: "PAYMENTS_READ_FAILED", error: "Could not read payment records" }) }
  var payments = result.rows.map(function (row) { return helpers.projectPaymentRow(row) })
  var start = (filters.page - 1) * filters.perPage
  return e.json(200, {
    payments: payments,
    total: result.total,
    page: filters.page,
    perPage: filters.perPage,
    hasMore: start + payments.length < result.total,
  })
}, $apis.requireAuth("users"))
