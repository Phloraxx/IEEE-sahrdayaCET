/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/app/events/{eventId}/certificates/{certificateId}/revoke", function (e) {
  var h = require(__hooks + "/certificate-lifecycle-helpers.js")
  var input = h.body(e)
  var ctx = h.routeContext($app, e)
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  var why = h.reason(input)
  if (!why) return h.error(e, 400, "REVOCATION_REASON_REQUIRED", "Provide a revocation reason of at least 5 characters")
  var status = ctx.certificate.getString("status") || "active"
  if (status === "revoked") return e.json(200, { idempotent: true, certificate: h.credentialPayload(ctx.certificate) })
  if (status === "superseded") return h.error(e, 409, "CREDENTIAL_SUPERSEDED", "This credential was already superseded by a replacement")

  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var certificate = h.certificateRecord(txApp, ctx.certificate.id)
      var liveStatus = certificate.getString("status") || "active"
      if (liveStatus === "revoked") {
        result = { idempotent: true, certificate: h.credentialPayload(certificate) }
        return
      }
      if (liveStatus !== "active") throw new Error("CREDENTIAL_NOT_ACTIVE")
      var before = h.credentialPayload(certificate)
      certificate.set("status", "revoked")
      certificate.set("revokedAt", new Date().toISOString())
      certificate.set("revokedBy", e.auth.id)
      certificate.set("revocationReason", why)
      txApp.save(certificate)
      h.cancelUnsentDelivery(txApp, certificate, "Credential revoked before delivery: " + why)
      var batch = h.batchRecord(txApp, certificate.getString("batch"))
      if (batch) require(__hooks + "/certificate-delivery-helpers.js").reconcileBatch(txApp, batch)
      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: ctx.event.id,
        registrationId: certificate.getString("registration") || "",
        actorId: e.auth.id,
        action: "certificate.revoke",
        entityType: "certificate",
        entityId: certificate.id,
        note: why,
        before: before,
        after: h.credentialPayload(certificate),
      })
      result = { idempotent: false, certificate: h.credentialPayload(certificate) }
    })
  } catch (err) {
    return h.error(e, 409, "REVOKE_CONFLICT", "The credential changed before it could be revoked")
  }
  return e.json(result.idempotent ? 200 : 201, result)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificates/{certificateId}/supersede", function (e) {
  var h = require(__hooks + "/certificate-lifecycle-helpers.js")
  var issue = require(__hooks + "/certificate-issuance-helpers.js")
  var input = h.body(e)
  var ctx = h.routeContext($app, e)
  if (ctx.status) return h.error(e, ctx.status, ctx.code, ctx.message)
  var why = h.reason(input)
  if (!why) return h.error(e, 400, "REPLACEMENT_REASON_REQUIRED", "Provide a replacement reason of at least 5 characters")

  var currentStatus = ctx.certificate.getString("status") || "active"
  if (currentStatus === "superseded") {
    var priorReplacement = h.existingReplacement($app, ctx.certificate)
    if (priorReplacement) return e.json(200, {
      idempotent: true,
      superseded: h.credentialPayload(ctx.certificate),
      replacement: h.credentialPayload(priorReplacement),
      replacementBatchId: priorReplacement.getString("batch") || "",
    })
  }
  if (currentStatus === "revoked") return h.error(e, 409, "CREDENTIAL_REVOKED", "A revoked credential cannot be replaced; issue a new credential instead")

  var hasName = Object.prototype.hasOwnProperty.call(input, "recipientName")
  var hasEmail = Object.prototype.hasOwnProperty.call(input, "recipientEmail")
  var recipientName = hasName ? String(input.recipientName || "").trim() : ctx.certificate.getString("recipientNameSnapshot")
  var recipientEmail = hasEmail ? String(input.recipientEmail || "").trim() : ctx.certificate.getString("recipientEmailSnapshot")
  if (!recipientName) return h.error(e, 400, "RECIPIENT_NAME_REQUIRED", "Replacement recipient name is required")
  if (!h.validEmail(recipientEmail)) return h.error(e, 400, "INVALID_RECIPIENT_EMAIL", "Replacement recipient email is invalid")
  var template = h.replacementTemplate($app, ctx.event.id, ctx.certificate.getString("certificateType"), ctx.certificate.getString("template"), input.templateId)
  if (!template) return h.error(e, 400, "REPLACEMENT_TEMPLATE_INVALID", "Choose a published template of the same certificate type")

  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var old = h.certificateRecord(txApp, ctx.certificate.id)
      var liveStatus = old.getString("status") || "active"
      if (liveStatus === "superseded") {
        var existing = h.existingReplacement(txApp, old)
        if (!existing) throw new Error("SUPERSEDE_INCOMPLETE")
        result = { idempotent: true, superseded: h.credentialPayload(old), replacement: h.credentialPayload(existing), replacementBatchId: existing.getString("batch") || "" }
        return
      }
      if (liveStatus !== "active") throw new Error("CREDENTIAL_NOT_ACTIVE")
      var txTemplate = h.replacementTemplate(txApp, ctx.event.id, old.getString("certificateType"), old.getString("template"), input.templateId)
      if (!txTemplate) throw new Error("REPLACEMENT_TEMPLATE_INVALID")
      var issuedAt = new Date().toISOString()
      var before = h.credentialPayload(old)
      old.set("status", "superseded")
      old.set("revokedAt", issuedAt)
      old.set("revokedBy", e.auth.id)
      old.set("revocationReason", why)
      txApp.save(old)

      var batch = h.correctionBatch(txApp, {
        event: ctx.event,
        oldCertificate: old,
        template: txTemplate,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        reason: why,
        actor: e.auth,
        issuedAt: issuedAt,
      })
      var replacement = new Record(txApp.findCollectionByNameOrId("certificates"), {
        event: ctx.event.id,
        registration: old.getString("registration"),
        batch: batch.id,
        template: txTemplate.id,
        certificateType: old.getString("certificateType"),
        credentialId: issue.credentialId(ctx.event, old.getString("certificateType"), issuedAt),
        verificationToken: issue.verificationToken(),
        recipientNameSnapshot: recipientName,
        recipientEmailSnapshot: recipientEmail,
        eventTitleSnapshot: ctx.event.getString("title") || old.getString("eventTitleSnapshot"),
        issuerNameSnapshot: h.issuerName(e.auth),
        issuedAt: issuedAt,
        status: "active",
        supersedes: old.id,
        metadataVersion: (old.getInt("metadataVersion") || 1) + 1,
      })
      txApp.save(replacement)
      old.set("supersededBy", replacement.id)
      txApp.save(old)
      h.cancelUnsentDelivery(txApp, old, "Credential superseded before delivery: " + why)
      var oldBatch = h.batchRecord(txApp, old.getString("batch"))
      if (oldBatch) require(__hooks + "/certificate-delivery-helpers.js").reconcileBatch(txApp, oldBatch)

      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: ctx.event.id,
        registrationId: old.getString("registration") || "",
        actorId: e.auth.id,
        action: "certificate.supersede",
        entityType: "certificate",
        entityId: old.id,
        note: why,
        before: before,
        after: { superseded: h.credentialPayload(old), replacement: h.credentialPayload(replacement), replacementBatchId: batch.id },
      })
      result = { idempotent: false, superseded: h.credentialPayload(old), replacement: h.credentialPayload(replacement), replacementBatchId: batch.id }
    })
  } catch (err) {
    var message = String(err && err.message ? err.message : err || "")
    if (message === "REPLACEMENT_TEMPLATE_INVALID") return h.error(e, 409, "REPLACEMENT_TEMPLATE_INVALID", "The selected replacement template is no longer available")
    return h.error(e, 409, "SUPERSEDE_CONFLICT", "The credential changed before a replacement could be created")
  }
  return e.json(result.idempotent ? 200 : 201, result)
}, $apis.requireAuth("users"))
