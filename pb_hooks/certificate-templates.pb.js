/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/events/{eventId}/certificate-templates", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canEvent($app, e.auth, event, "certificates.view")) return h.error(e, 403, "FORBIDDEN", "You cannot view certificates for this event")
  var rows = $app.findRecordsByFilter("certificate_templates", "scopeType = 'event' && event = {:event}", "-version,-created", 0, 0, { event: eventId })
  return e.json(200, { templates: rows.map(function (row) { return h.payload(row, e.auth) }) })
}, $apis.requireAuth("users"))

routerAdd("GET", "/api/app/certificate-templates/{id}", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.view")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  return e.json(200, { template: h.payload(ctx.template, e.auth) })
}, $apis.requireAuth("users"))


routerAdd("GET", "/api/app/certificate-templates/{id}/assets/{field}/{filename}", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.view")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  var field = String(e.request.pathValue("field") || "")
  var filename = String(e.request.pathValue("filename") || "")
  var allowed = false
  if (field === "sourceBackground" || field === "renderBase") {
    allowed = ctx.template.getString(field) === filename
  } else if (field === "sourceSignatures") {
    allowed = (ctx.template.getStringSlice(field) || []).indexOf(filename) !== -1
  }
  if (!allowed || !filename) return h.error(e, 404, "ASSET_NOT_FOUND", "Certificate template asset not found")
  var type = /\.png$/i.test(filename) ? "image/png" : (/\.jpe?g$/i.test(filename) ? "image/jpeg" : "application/octet-stream")
  var fs = $app.newFilesystem()
  var reader = null
  try {
    reader = fs.getReader(ctx.template.baseFilesPath() + "/" + filename)
    return e.stream(200, type, reader)
  } finally {
    try { if (reader) reader.close() } catch (_) {}
    try { fs.close() } catch (_) {}
  }
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificate-templates", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canEvent($app, e.auth, event, "certificates.manage_templates")) return h.error(e, 403, "FORBIDDEN", "You cannot create certificate templates for this event")
  var input = h.body(e)
  var name = String(input.name || "").trim().slice(0, 180)
  var certificateType = String(input.certificateType || "participation").trim()
  if (name.length < 3) return h.error(e, 400, "NAME_REQUIRED", "Template name must be at least 3 characters")
  if (h.CERTIFICATE_TYPES.indexOf(certificateType) === -1) return h.error(e, 400, "INVALID_CERTIFICATE_TYPE", "Invalid certificate type")
  var record = new Record($app.findCollectionByNameOrId("certificate_templates"), {
    name: name, scopeType: "event", society: event.getString("society") || "", event: eventId,
    certificateType: certificateType, version: h.nextVersion($app, eventId, name), status: "draft",
    layout: h.defaultLayout(), emailSubject: h.defaultEmailSubject(), emailText: h.defaultEmailText(), emailHtml: "", createdBy: e.auth.id,
  })
  $app.save(record)
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: eventId, actorId: e.auth.id, action: "certificate.template-create",
    entityType: "certificate_template", entityId: record.id,
    after: require(__hooks + "/certificate-template-rules.js").recordSnapshot(record),
  })
  return e.json(201, { template: h.payload(record, e.auth) })
}, $apis.requireAuth("users"))

routerAdd("PATCH", "/api/app/certificate-templates/{id}", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (ctx.template.getString("status") !== "draft") return h.error(e, 409, "TEMPLATE_IMMUTABLE", "Published certificate templates cannot be edited")
  var rules = require(__hooks + "/certificate-template-rules.js")
  var before = rules.recordSnapshot(ctx.template)
  var input = h.body(e)
  try {
    h.applyDraftText(ctx.template, input)
    h.applyUploads(e, ctx.template, input)
    $app.save(ctx.template)
  } catch (err) {
    return h.error(e, 400, "TEMPLATE_UPDATE_FAILED", String(err && err.message ? err.message : err))
  }
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-update",
    entityType: "certificate_template", entityId: ctx.template.id,
    before: before, after: rules.recordSnapshot(ctx.template),
  })
  return e.json(200, { template: h.payload(ctx.template, e.auth) })
}, $apis.requireAuth("users"), $apis.bodyLimit(40 * 1024 * 1024))

routerAdd("POST", "/api/app/certificate-templates/{id}/publish", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (ctx.template.getString("status") !== "draft") return h.error(e, 409, "TEMPLATE_NOT_DRAFT", "Only draft templates can be published")
  var rules = require(__hooks + "/certificate-template-rules.js")
  var errors = rules.publicationErrors(rules.recordSnapshot(ctx.template))
  if (errors.length) return e.json(422, { code: "TEMPLATE_NOT_READY", error: "Template is not ready to publish", errors: errors })
  var before = rules.recordSnapshot(ctx.template)
  ctx.template.set("publishedBy", e.auth.id)
  ctx.template.set("publishedAt", new Date().toISOString())
  ctx.template.set("contentHash", h.publishHash(ctx.template))
  ctx.template.set("status", "published")
  $app.save(ctx.template)
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-publish",
    entityType: "certificate_template", entityId: ctx.template.id,
    before: before, after: rules.recordSnapshot(ctx.template),
  })
  return e.json(200, { template: h.payload(ctx.template, e.auth) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/certificate-templates/{id}/test-email", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (ctx.template.getString("status") === "archived") {
    return h.error(e, 409, "TEMPLATE_ARCHIVED", "Archived certificate templates cannot send test email")
  }
  var result = null
  try {
    result = require(__hooks + "/certificate-delivery-helpers.js").sendCertificateTestEmail(
      $app, ctx.template, ctx.event, e.auth
    )
  } catch (err) {
    var code = String(err && err.code ? err.code : "")
    var message = String(err && err.message ? err.message : err)
    if (code === "TEST_EMAIL_ADDRESS_UNAVAILABLE") return h.error(e, 400, code, message)
    if (code === "MAIL_DELIVERY_BLOCKED") return h.error(e, 409, "TEST_EMAIL_BLOCKED", message)
    if (code === "SMTP_NOT_CONFIGURED" || code === "SMTP_SENDER_NOT_CONFIGURED") return h.error(e, 503, "TEST_EMAIL_UNAVAILABLE", message)
    return h.error(e, 503, "TEST_EMAIL_FAILED", "Certificate test email could not be sent")
  }
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-test-email",
    entityType: "certificate_template", entityId: ctx.template.id,
    note: "Sent sample TEST / NOT VALID certificate email to signed-in organizer",
  })
  return e.json(200, { success: true, recipient: result.recipient, deliveryMode: result.deliveryMode, provider: result.provider || "smtp" })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/certificate-templates/{id}/archive", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (ctx.template.getString("status") !== "published") return h.error(e, 409, "TEMPLATE_NOT_PUBLISHED", "Only published templates can be archived")
  var rules = require(__hooks + "/certificate-template-rules.js")
  var before = rules.recordSnapshot(ctx.template)
  ctx.template.set("status", "archived")
  $app.save(ctx.template)
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-archive",
    entityType: "certificate_template", entityId: ctx.template.id,
    before: before, after: rules.recordSnapshot(ctx.template),
  })
  return e.json(200, { template: h.payload(ctx.template, e.auth) })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/certificate-templates/{id}/new-version", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (["published", "archived"].indexOf(ctx.template.getString("status")) === -1) {
    return h.error(e, 409, "TEMPLATE_NOT_VERSIONED", "Publish this draft before creating another version")
  }
  var next
  try { next = h.cloneAsDraft($app, ctx.template, e.auth.id) }
  catch (err) { return h.error(e, 500, "TEMPLATE_CLONE_FAILED", String(err && err.message ? err.message : err)) }
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-version-create",
    entityType: "certificate_template", entityId: next.id,
    note: "Created from template " + ctx.template.id,
    after: require(__hooks + "/certificate-template-rules.js").recordSnapshot(next),
  })
  return e.json(201, { template: h.payload(next, e.auth) })
}, $apis.requireAuth("users"))
routerAdd("DELETE", "/api/app/certificate-templates/{id}", function (e) {
  var h = require(__hooks + "/certificate-template-helpers.js")
  var ctx = h.routeContext(e, "certificates.manage_templates")
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  if (ctx.template.getString("status") !== "draft") return h.error(e, 409, "TEMPLATE_IMMUTABLE", "Published or archived templates cannot be deleted")
  var snapshot = require(__hooks + "/certificate-template-rules.js").recordSnapshot(ctx.template)
  require(__hooks + "/admin-operations-helpers.js").audit($app, {
    eventId: ctx.event.id, actorId: e.auth.id, action: "certificate.template-delete",
    entityType: "certificate_template", entityId: ctx.template.id, before: snapshot,
  })
  $app.delete(ctx.template)
  return e.json(200, { success: true })
}, $apis.requireAuth("users"))
