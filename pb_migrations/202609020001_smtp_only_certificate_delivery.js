/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  try { app.delete(app.findCollectionByNameOrId("mail_delivery_events")) } catch (_) {}

  try {
    var outbox = app.findCollectionByNameOrId("notification_outbox")
    try { outbox.removeIndex("idx_notification_outbox_provider_message") } catch (_) {}
    var providerFields = [
      "deliveryProvider", "providerMessageId", "providerSendSequence", "providerMessageHeader",
      "providerStatus", "providerUpdatedAt", "deliveredAt", "providerError",
    ]
    for (var i = 0; i < providerFields.length; i++) {
      var field = outbox.fields.getByName(providerFields[i])
      if (field) outbox.fields.removeById(field.id)
    }
    app.save(outbox)
  } catch (_) {}

  try {
    var batches = app.findCollectionByNameOrId("certificate_batches")
    var batchFields = ["deliveredCount", "deliveryIssueCount"]
    for (var j = 0; j < batchFields.length; j++) {
      var batchField = batches.fields.getByName(batchFields[j])
      if (batchField) batches.fields.removeById(batchField.id)
    }
    app.save(batches)
  } catch (_) {}
}, (app) => {
  var outbox = app.findCollectionByNameOrId("notification_outbox")
  var batches = app.findCollectionByNameOrId("certificate_batches")
  if (!outbox.fields.getByName("deliveryProvider")) outbox.fields.add(new SelectField({ name: "deliveryProvider", values: ["smtp", "resend"], maxSelect: 1 }))
  if (!outbox.fields.getByName("providerMessageId")) outbox.fields.add(new TextField({ name: "providerMessageId", max: 240 }))
  if (!outbox.fields.getByName("providerSendSequence")) outbox.fields.add(new NumberField({ name: "providerSendSequence", min: 0 }))
  if (!outbox.fields.getByName("providerMessageHeader")) outbox.fields.add(new TextField({ name: "providerMessageHeader", max: 500 }))
  if (!outbox.fields.getByName("providerStatus")) outbox.fields.add(new SelectField({ name: "providerStatus", values: ["accepted", "sent", "delivered", "delayed", "bounced", "failed", "suppressed", "complained"], maxSelect: 1 }))
  if (!outbox.fields.getByName("providerUpdatedAt")) outbox.fields.add(new DateField({ name: "providerUpdatedAt" }))
  if (!outbox.fields.getByName("deliveredAt")) outbox.fields.add(new DateField({ name: "deliveredAt" }))
  if (!outbox.fields.getByName("providerError")) outbox.fields.add(new TextField({ name: "providerError", max: 4000 }))
  try { outbox.addIndex("idx_notification_outbox_provider_message", false, "providerMessageId", "") } catch (_) {}
  app.save(outbox)
  if (!batches.fields.getByName("deliveredCount")) batches.fields.add(new NumberField({ name: "deliveredCount", min: 0 }))
  if (!batches.fields.getByName("deliveryIssueCount")) batches.fields.add(new NumberField({ name: "deliveryIssueCount", min: 0 }))
  app.save(batches)

  var events = null
  try { events = app.findCollectionByNameOrId("mail_delivery_events") } catch (_) {}
  if (!events) {
    events = new Collection({
      type: "base", name: "mail_delivery_events",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { type: "relation", name: "outbox", collectionId: outbox.id, maxSelect: 1, cascadeDelete: true },
        { type: "select", name: "provider", values: ["resend"], maxSelect: 1, required: true },
        { type: "text", name: "providerEventId", required: true, max: 240 },
        { type: "text", name: "providerMessageId", required: true, max: 240 },
        { type: "text", name: "eventType", required: true, max: 120 },
        { type: "date", name: "eventCreatedAt" },
        { type: "text", name: "payloadHash", required: true, max: 128 },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_mail_delivery_events_provider_event ON mail_delivery_events (provider, providerEventId)',
        'CREATE INDEX idx_mail_delivery_events_message ON mail_delivery_events (provider, providerMessageId)',
      ],
    })
    app.save(events)
  }
})
