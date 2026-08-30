function clean(value) {
  return String(value == null ? "" : value).trim()
}

function knownStatus(eventType) {
  var map = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.failed": "failed",
    "email.suppressed": "suppressed",
    "email.complained": "complained",
  }
  return map[clean(eventType).toLowerCase()] || ""
}

function eventByProviderId(app, providerEventId) {
  try {
    return app.findFirstRecordByFilter(
      "mail_delivery_events",
      "provider = 'resend' && providerEventId = {:id}",
      { id: providerEventId }
    )
  } catch (_) { return null }
}

function outboxByProviderMessage(app, providerMessageId) {
  try {
    return app.findFirstRecordByFilter(
      "notification_outbox",
      "kind = 'certificate' && deliveryProvider = 'resend' && providerMessageId = {:id}",
      { id: providerMessageId }
    )
  } catch (_) { return null }
}

function timestamp(value) {
  var parsed = Date.parse(clean(value))
  return isFinite(parsed) ? parsed : 0
}

function apply(app, input, payloadHash) {
  input = input || {}
  var providerEventId = clean(input.providerEventId)
  var providerMessageId = clean(input.providerMessageId)
  var eventType = clean(input.eventType).toLowerCase()
  var providerStatus = knownStatus(eventType)
  if (!providerEventId || !providerMessageId || !providerStatus) {
    var invalid = new Error("Unsupported or incomplete Resend delivery event")
    invalid.code = "MAIL_EVENT_INVALID"
    throw invalid
  }

  var duplicate = eventByProviderId(app, providerEventId)
  if (duplicate) return { duplicate: true, matched: !!duplicate.getString("outbox"), updated: false }

  var outbox = outboxByProviderMessage(app, providerMessageId)
  var eventRecord = new Record(app.findCollectionByNameOrId("mail_delivery_events"))
  if (outbox) eventRecord.set("outbox", outbox.id)
  eventRecord.set("provider", "resend")
  eventRecord.set("providerEventId", providerEventId)
  eventRecord.set("providerMessageId", providerMessageId)
  eventRecord.set("eventType", eventType)
  eventRecord.set("eventCreatedAt", clean(input.eventCreatedAt))
  eventRecord.set("payloadHash", clean(payloadHash))
  app.save(eventRecord)

  if (!outbox) return { duplicate: false, matched: false, updated: false }
  var incomingAt = timestamp(input.eventCreatedAt) || Date.now()
  var currentAt = timestamp(outbox.getString("providerUpdatedAt"))
  if (currentAt && incomingAt < currentAt) {
    return { duplicate: false, matched: true, updated: false, outOfOrder: true }
  }
  outbox.set("providerStatus", providerStatus)
  outbox.set("providerUpdatedAt", new Date(incomingAt).toISOString())
  if (clean(input.messageId)) outbox.set("providerMessageHeader", clean(input.messageId).slice(0, 500))
  if (providerStatus === "delivered") {
    outbox.set("deliveredAt", new Date(incomingAt).toISOString())
    outbox.set("providerError", "")
  } else if (["bounced", "failed", "suppressed", "complained"].indexOf(providerStatus) !== -1) {
    outbox.set("providerError", clean(input.error || eventType).slice(0, 3900))
  } else if (providerStatus === "sent") {
    outbox.set("providerError", "")
  }
  app.saveNoValidate(outbox)
  try {
    require(__hooks + "/certificate-delivery-helpers.js").reconcileForOutbox(app, outbox)
  } catch (_) {}
  return { duplicate: false, matched: true, updated: true, providerStatus: providerStatus }
}

module.exports = {
  apply: apply,
  knownStatus: knownStatus,
}
