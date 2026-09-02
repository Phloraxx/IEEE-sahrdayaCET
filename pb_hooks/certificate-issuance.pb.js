/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/app/events/{eventId}/certificates/candidates", function (e) {
  var h = require(__hooks + "/certificate-issuance-helpers.js")
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canIssue($app, e.auth, event)) {
    return h.error(e, 403, "FORBIDDEN", "You cannot issue certificates for this event")
  }
  var candidates = h.candidateList($app, eventId).map(function (row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      registrationStatus: row.registrationStatus,
      checkedIn: row.checkedIn,
    }
  })
  return e.json(200, { candidates: candidates })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificates/audience/preview", function (e) {
  var h = require(__hooks + "/certificate-issuance-helpers.js")
  var input = h.body(e)
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canIssue($app, e.auth, event)) return h.error(e, 403, "FORBIDDEN", "You cannot issue certificates for this event")

  var template = h.publishedTemplate($app, eventId, input.templateId)
  if (!template) return h.error(e, 400, "PUBLISHED_TEMPLATE_REQUIRED", "Choose a published certificate template")
  var audienceType = String(input.audienceType || "")
  var audience = h.buildAudience($app, {
    eventId: eventId,
    template: template,
    certificateType: template.getString("certificateType") || "",
    audienceType: audienceType,
    audienceConfig: input.audienceConfig || {},
  })
  if (audience.error) {
    var unavailable = audienceType === "attendance_qualified"
    return h.error(e, unavailable ? 409 : 400, unavailable ? "ATTENDANCE_DATA_UNAVAILABLE" : "INVALID_AUDIENCE", audience.error)
  }
  return e.json(200, h.previewPayload(audience, template))
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/app/events/{eventId}/certificates/issue", function (e) {
  var h = require(__hooks + "/certificate-issuance-helpers.js")
  var rules = require(__hooks + "/certificate-issuance-rules.js")
  var input = h.body(e)
  var eventId = e.request.pathValue("eventId") || ""
  var event = h.eventRecord($app, eventId)
  if (!event) return h.error(e, 404, "EVENT_NOT_FOUND", "Event not found")
  if (!h.canIssue($app, e.auth, event)) return h.error(e, 403, "FORBIDDEN", "You cannot issue certificates for this event")

  var template = h.publishedTemplate($app, eventId, input.templateId)
  if (!template) return h.error(e, 400, "PUBLISHED_TEMPLATE_REQUIRED", "Choose a published certificate template")
  var audienceType = String(input.audienceType || "")
  var config = rules.normalizeAudienceConfig(audienceType, input.audienceConfig || {})
  var fingerprint = String(input.audienceFingerprint || "")
  if (!fingerprint) return h.error(e, 400, "AUDIENCE_REVIEW_REQUIRED", "Review the audience before issuing certificates")

  var idempotencyKey = rules.issueKey({
    eventId: eventId,
    templateId: template.id,
    audienceType: audienceType,
    audienceConfig: config,
    audienceFingerprint: fingerprint,
  })
  var prior = h.existingBatch($app, idempotencyKey)
  if (prior) {
    return e.json(200, {
      idempotent: true,
      batch: h.batchPayload(prior),
      certificates: h.certificateSummariesForBatch($app, prior.id),
    })
  }
  var result = null
  var freshPreview = null
  try {
    $app.runInTransaction(function (txApp) {
      var existing = h.existingBatch(txApp, idempotencyKey)
      if (existing) {
        result = {
          idempotent: true,
          batch: h.batchPayload(existing),
          certificates: h.certificateSummariesForBatch(txApp, existing.id),
        }
        return
      }

      var txEvent = h.eventRecord(txApp, eventId)
      var txTemplate = h.publishedTemplate(txApp, eventId, template.id)
      if (!txEvent || !txTemplate) throw new Error("PUBLISHED_TEMPLATE_REQUIRED")
      var audience = h.buildAudience(txApp, {
        eventId: eventId,
        template: txTemplate,
        certificateType: txTemplate.getString("certificateType") || "",
        audienceType: audienceType,
        audienceConfig: config,
      })
      if (audience.error) throw new Error("INVALID_AUDIENCE:" + audience.error)
      freshPreview = h.previewPayload(audience, txTemplate)
      if (audience.fingerprint !== fingerprint) throw new Error("AUDIENCE_CHANGED")
      if (!audience.recipientCount) throw new Error("EMPTY_AUDIENCE")

      var issuedAt = new Date().toISOString()
      var batch = new Record(txApp.findCollectionByNameOrId("certificate_batches"), {
        event: eventId,
        template: txTemplate.id,
        audienceType: audienceType,
        audienceConfig: audience.audienceConfig,
        audienceFingerprint: audience.fingerprint,
        audienceSnapshot: { recipients: audience.recipients, excluded: audience.excluded },
        idempotencyKey: idempotencyKey,
        status: "issued",
        recipientCount: audience.recipientCount,
        issuedCount: audience.recipientCount,
        emailEligibleCount: audience.emailEligibleCount,
        queuedCount: 0,
        sentCount: 0,
        failedCount: 0,
        missingEmailCount: audience.missingEmailCount,
        createdBy: e.auth.id,
        issuedBy: e.auth.id,
        issuedAt: issuedAt,
        note: String(input.note || "").trim().slice(0, 4000),
      })
      txApp.save(batch)

      var certificateType = txTemplate.getString("certificateType") || "participation"
      var eventTitle = txEvent.getString("title") || "IEEE Sahrdaya event"
      var issuer = h.issuerName(e.auth)
      audience.recipients.forEach(function (recipient) {
        var certificate = new Record(txApp.findCollectionByNameOrId("certificates"), {
          event: eventId,
          registration: recipient.id,
          batch: batch.id,
          template: txTemplate.id,
          certificateType: certificateType,
          credentialId: h.credentialId(txEvent, certificateType, issuedAt),
          verificationToken: h.verificationToken(),
          recipientNameSnapshot: recipient.name,
          recipientEmailSnapshot: recipient.email,
          eventTitleSnapshot: eventTitle,
          issuerNameSnapshot: issuer,
          issuedAt: issuedAt,
          status: "active",
          metadataVersion: 1,
        })
        txApp.save(certificate)
      })

      require(__hooks + "/admin-operations-helpers.js").audit(txApp, {
        eventId: eventId,
        actorId: e.auth.id,
        action: "certificate.batch-issue",
        entityType: "certificate_batch",
        entityId: batch.id,
        note: batch.getString("note") || "",
        after: h.batchPayload(batch),
      })

      result = {
        idempotent: false,
        batch: h.batchPayload(batch),
        certificates: h.certificateSummariesForBatch(txApp, batch.id),
      }
    })
  } catch (err) {
    var message = err && err.message ? String(err.message) : String(err || "")
    var recovered = h.existingBatch($app, idempotencyKey)
    if (recovered) {
      return e.json(200, {
        idempotent: true,
        batch: h.batchPayload(recovered),
        certificates: h.certificateSummariesForBatch($app, recovered.id),
      })
    }
    if (message === "AUDIENCE_CHANGED") {
      return h.error(e, 409, "AUDIENCE_CHANGED", "The audience changed after review. Review it again before issuing.", { preview: freshPreview })
    }
    if (message === "EMPTY_AUDIENCE") return h.error(e, 400, "EMPTY_AUDIENCE", "No eligible recipients remain in this audience")
    if (message === "PUBLISHED_TEMPLATE_REQUIRED") return h.error(e, 409, "PUBLISHED_TEMPLATE_REQUIRED", "The selected template is no longer published")
    if (message.indexOf("INVALID_AUDIENCE:") === 0) return h.error(e, 400, "INVALID_AUDIENCE", message.slice(17))
    return h.error(e, 409, "ISSUE_CONFLICT", "Certificates could not be issued because the audience changed or already contains an active credential")
  }
  return e.json(201, result)
}, $apis.requireAuth("users"))
