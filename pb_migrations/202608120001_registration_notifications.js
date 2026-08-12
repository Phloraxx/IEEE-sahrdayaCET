/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    var existing = null
    try { existing = app.findCollectionByNameOrId("notification_outbox") } catch (_) {}
    if (existing) return

    var registrations = app.findCollectionByNameOrId("registrations")
    var collection = new Collection({
      type: "base",
      name: "notification_outbox",
      listRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && registration.event.society.chairs.id ?= @request.auth.id)',
      viewRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && registration.event.society.chairs.id ?= @request.auth.id)',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "registration", collectionId: registrations.id, maxSelect: 1, required: true, cascadeDelete: true },
        { type: "select", name: "kind", values: ["ticket", "receipt"], maxSelect: 1, required: true },
        { type: "select", name: "status", values: ["pending", "sending", "sent", "failed"], maxSelect: 1, required: true },
        { type: "email", name: "recipient", required: true },
        { type: "text", name: "dedupeKey", required: true, max: 220 },
        { type: "number", name: "attempts", min: 0 },
        { type: "date", name: "nextAttemptAt" },
        { type: "date", name: "lastAttemptAt" },
        { type: "date", name: "sentAt" },
        { type: "text", name: "lastError", max: 4000 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_notification_outbox_dedupe ON notification_outbox (dedupeKey)',
        'CREATE INDEX idx_notification_outbox_status_retry ON notification_outbox (status, nextAttemptAt)',
        'CREATE INDEX idx_notification_outbox_registration ON notification_outbox (registration)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      var collection = app.findCollectionByNameOrId("notification_outbox")
      app.delete(collection)
    } catch (_) {}
  },
)
