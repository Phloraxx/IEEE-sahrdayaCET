/// <reference path="../pb_data/types.d.ts" />

// Canonical paid-registration API. New paid registrations are PayGate v4 only;
// historical registrations from retired providers remain finance history and
// cannot silently start a new checkout through this route.

routerAdd("POST", "/api/app/registrations/{id}/payment", function (e) {
  var pg = require(__hooks + "/paygate-helpers.js")
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!pg.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
  var data = pg.asObject(registration.get("paymentData"))
  if (data.provider !== pg.PAYGATE_PROVIDER) return e.json(409, { code: "PAYMENT_PROVIDER_RETIRED", error: "This historical registration is not on the current PayGate payment flow. Contact the organizer for resolution." })
  var result = pg.createPaymentForRegistration(registration)
  return e.json(result.status, result.body)
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/app/registrations/{id}/payment", function (e) {
  var pg = require(__hooks + "/paygate-helpers.js")
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!pg.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
  var data = pg.asObject(registration.get("paymentData"))
  if (data.provider !== pg.PAYGATE_PROVIDER) return e.json(409, { code: "PAYMENT_PROVIDER_RETIRED", error: "This historical registration is not on the current PayGate payment flow. Contact the organizer for resolution." })
  return e.json(200, pg.paymentSession(registration, data, pg.paymentConfigured(pg.getConfig())))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/registrations/{id}/payment/reconcile", function (e) {
  var pg = require(__hooks + "/paygate-helpers.js")
  var id = e.request.pathValue("id") || ""
  var registration
  try { registration = $app.findRecordById("registrations", id) }
  catch (_) { return e.json(404, { code: "REGISTRATION_NOT_FOUND", error: "Registration not found" }) }
  if (!pg.mayAccessRegistration(e.auth, registration)) return e.json(403, { code: "FORBIDDEN", error: "You cannot access this registration" })
  var data = pg.asObject(registration.get("paymentData"))
  if (data.provider !== pg.PAYGATE_PROVIDER) return e.json(409, { code: "PAYMENT_PROVIDER_RETIRED", error: "This historical registration is not on the current PayGate payment flow. Contact the organizer for resolution." })
  var result = pg.reconcilePaymentForRegistration(registration)
  if (result.notify) pg.enqueueRegistrationNotifications(registration.id)
  return e.json(result.status, result.body)
}, $apis.requireAuth("users"))
