/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/events/{eventId}/certificate-batches", function (e) {
  var h = require(__hooks + "/certificate-delivery-helpers.js")
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canView($app, e.auth, event)) return h.error(e, 403, "FORBIDDEN", "You cannot view certificates for this event")
  var rows = []
  try { rows = $app.findRecordsByFilter("certificate_batches", "event = {:event} && status != 'draft'", "-issuedAt", 0, 0, { event: eventId }) }
  catch (_) { rows = [] }
  return e.json(200, { batches: rows.map(function (batch) {
    h.reconcileBatch($app, batch)
    return h.batchPayload(batch)
  }) })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/app/events/{eventId}/certificate-batches/{batchId}/delivery", function (e) {
  var h = require(__hooks + "/certificate-delivery-helpers.js")
  var ctx = h.routeContext($app, e, "view")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  return e.json(200, h.deliveryPayload($app, ctx.batch))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificate-batches/{batchId}/send", function (e) {
  var h = require(__hooks + "/certificate-delivery-helpers.js")
  var ctx = h.routeContext($app, e, "send")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (["issued", "sending", "partial_failure", "sent"].indexOf(ctx.batch.getString("status") || "") === -1) {
    return h.error(e, 409, "BATCH_NOT_ISSUED", "Only issued certificate batches can be sent")
  }
  var created = 0
  var eligible = 0
  var certificates = h.certificateRows($app, ctx.batch.id)
  try {
    $app.runInTransaction(function (txApp) {
      for (var i = 0; i < certificates.length; i++) {
        var live = txApp.findRecordById("certificates", certificates[i].id)
        if ((live.getString("status") || "") !== "active" || !h.validEmail(live.getString("recipientEmailSnapshot"))) continue
        eligible++
        var queued = h.enqueueCertificate(txApp, live, false)
        if (queued.created) created++
      }
      var liveBatch = txApp.findRecordById("certificate_batches", ctx.batch.id)
      if (eligible > 0 && !liveBatch.getString("sendStartedAt")) liveBatch.set("sendStartedAt", new Date().toISOString())
      txApp.save(liveBatch)
      h.reconcileBatch(txApp, liveBatch)
      if (eligible > 0) {
        require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
          eventId: ctx.event.id,
          actorId: e.auth.id,
          action: "certificate.batch-send",
          entityType: "certificate_batch",
          entityId: liveBatch.id,
          note: created ? ("Queued " + created + " certificate email(s)") : "Send command replayed without duplicate jobs",
          after: h.batchPayload(liveBatch),
        })
      }
    })
  } catch (err) {
    return h.error(e, 409, "SEND_CONFLICT", String(err && err.message ? err.message : err))
  }
  if (!eligible) return h.error(e, 409, "NO_EMAIL_ELIGIBLE", "This batch has no active credentials with valid email snapshots")
  var fresh = h.batchRecord($app, ctx.batch.id)
  return e.json(created ? 202 : 200, {
    idempotent: created === 0,
    queuedNow: created,
    delivery: h.deliveryPayload($app, fresh),
  })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificate-batches/{batchId}/retry-failed", function (e) {
  var h = require(__hooks + "/certificate-delivery-helpers.js")
  var ctx = h.routeContext($app, e, "send")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  var retried = 0
  var certificates = h.certificateRows($app, ctx.batch.id)
  try {
    $app.runInTransaction(function (txApp) {
      for (var i = 0; i < certificates.length; i++) {
        var live = txApp.findRecordById("certificates", certificates[i].id)
        if ((live.getString("status") || "") !== "active" || !h.validEmail(live.getString("recipientEmailSnapshot"))) continue
        var before = h.enqueueCertificate(txApp, live, false).record
        if (!before || before.getString("status") !== "failed") continue
        h.enqueueCertificate(txApp, live, true)
        retried++
      }
      var liveBatch = txApp.findRecordById("certificate_batches", ctx.batch.id)
      h.reconcileBatch(txApp, liveBatch)
    })
  } catch (err) {
    return h.error(e, 409, "RETRY_CONFLICT", String(err && err.message ? err.message : err))
  }
  if (!retried) return h.error(e, 409, "NO_FAILED_DELIVERIES", "There are no failed certificate emails to retry")
  return e.json(202, { retried: retried, delivery: h.deliveryPayload($app, h.batchRecord($app, ctx.batch.id)) })
}, $apis.requireAuth("users"))
