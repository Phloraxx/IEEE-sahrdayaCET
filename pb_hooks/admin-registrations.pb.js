/// <reference path="../pb_data/types.d.ts" />

// Projected administrative registration reads. Query/scope helpers live in a
// required module so route callbacks do not depend on file-local bindings.

routerAdd("GET", "/api/admin/registrations", function (e) {
  var routeHelpers = require(__hooks + "/admin-registrations-helpers.js")
  var filters = routeHelpers.registrationQuery(e)
  if (filters.error) return routeHelpers.error(e, 400, "INVALID_QUERY", filters.error)
  var accessResult = routeHelpers.registrationEventAccess($app, e.auth, filters.eventId)
  if (accessResult.error) return routeHelpers.error(e, accessResult.error.status, accessResult.error.code, accessResult.error.message)
  var queryAccess = routeHelpers.accessForQuery(accessResult.access || [], filters)
  if (queryAccess.error) {
    return routeHelpers.error(e, queryAccess.error.status, queryAccess.error.code, queryAccess.error.message)
  }
  var access = queryAccess.access || []
  var pageResult
  try { pageResult = routeHelpers.findRegistrationPage($app, access, filters) } catch (_) {
    return routeHelpers.error(e, 500, "REGISTRATIONS_READ_FAILED", "Could not read registrations")
  }
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  var registrations = pageResult.rows.map(function (item) {
    return helpers.registrationAdminProjection(item.record, item.event, item.finance)
  })
  var finance = access.length > 0
  for (var fi = 0; fi < access.length; fi++) finance = finance && access[fi].finance
  var start = (filters.page - 1) * filters.perPage
  return e.json(200, {
    registrations: registrations,
    total: pageResult.total,
    page: filters.page,
    perPage: filters.perPage,
    hasMore: start + registrations.length < pageResult.total,
    finance: finance,
  })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/admin/registrations/{id}", function (e) {
  var routeHelpers = require(__hooks + "/admin-registrations-helpers.js")
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return routeHelpers.error(e, 404, "REGISTRATION_NOT_FOUND", "Registration not found") }
  var event = routeHelpers.eventRecord($app, registration.getString("event") || "")
  if (!event) return routeHelpers.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  var authz = require(__hooks + "/workspace-authorization.js")
  if (!authz.hasEventCapability($app, e.auth, "registrations.view", event)) {
    return routeHelpers.error(e, 403, "FORBIDDEN", "You cannot view this registration")
  }
  var finance = authz.hasEventCapability($app, e.auth, "finance.view", event) ||
    authz.hasEventCapability($app, e.auth, "finance.manage", event)
  var helpers = require(__hooks + "/admin-operations-helpers.js")
  return e.json(200, { registration: helpers.registrationAdminProjection(registration, event, finance) })
}, $apis.requireAuth("users"))
