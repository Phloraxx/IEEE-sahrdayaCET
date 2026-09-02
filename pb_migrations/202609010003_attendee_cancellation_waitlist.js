/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var users = app.findCollectionByNameOrId("users")
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")

  function addEventField(name, field) {
    if (!events.fields.getByName(name)) events.fields.add(field)
  }
  addEventField("allowSelfCancellation", new BoolField({ name: "allowSelfCancellation" }))
  addEventField("selfCancellationUntil", new DateField({ name: "selfCancellationUntil" }))
  addEventField("refundRequestUntil", new DateField({ name: "refundRequestUntil" }))
  addEventField("refundPolicy", new TextField({ name: "refundPolicy", max: 4000 }))
  addEventField("waitlistEnabled", new BoolField({ name: "waitlistEnabled" }))
  addEventField("waitlistOfferMinutes", new NumberField({ name: "waitlistOfferMinutes", min: 15, max: 10080 }))
  addEventField("waitlistReservedCount", new NumberField({ name: "waitlistReservedCount", min: 0 }))
  app.save(events)

  var requests = null
  try { requests = app.findCollectionByNameOrId("registration_cancellation_requests") } catch (_) {}
  if (!requests) {
    requests = new Collection({ type: "base", name: "registration_cancellation_requests",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null })
    requests.fields.add(new RelationField({ name: "registration", collectionId: registrations.id, maxSelect: 1, required: true, cascadeDelete: false }))
    requests.fields.add(new RelationField({ name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false }))
    requests.fields.add(new RelationField({ name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: false }))
    requests.fields.add(new SelectField({ name: "kind", values: ["refund"], maxSelect: 1, required: true }))
    requests.fields.add(new TextField({ name: "activeKey", max: 120 }))
    requests.fields.add(new SelectField({ name: "status", values: ["open", "accepted", "resolved", "declined", "withdrawn"], maxSelect: 1, required: true }))
    requests.fields.add(new TextField({ name: "reason", max: 2000 }))
    requests.fields.add(new DateField({ name: "requestedAt", required: true }))
    requests.fields.add(new DateField({ name: "decisionAt" }))
    requests.fields.add(new RelationField({ name: "decisionBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
    requests.fields.add(new TextField({ name: "resolutionNote", max: 2000 }))
    requests.fields.add(new DateField({ name: "resolvedAt" }))
    requests.fields.add(new AutodateField({ name: "created", onCreate: true }))
    requests.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }))
    requests.indexes = [
      'CREATE UNIQUE INDEX idx_cancel_request_active_key ON registration_cancellation_requests (activeKey) WHERE activeKey != ""',
      'CREATE INDEX idx_cancel_request_registration_status ON registration_cancellation_requests (registration, status)',
      'CREATE INDEX idx_cancel_request_event_status ON registration_cancellation_requests (event, status, requestedAt)',
      'CREATE INDEX idx_cancel_request_user_status ON registration_cancellation_requests (user, status, requestedAt)',
    ]
    app.save(requests)
  }

  var waitlist = null
  try { waitlist = app.findCollectionByNameOrId("event_waitlist") } catch (_) {}
  if (!waitlist) {
    waitlist = new Collection({ type: "base", name: "event_waitlist",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null })
    waitlist.fields.add(new RelationField({ name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false }))
    waitlist.fields.add(new RelationField({ name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: false }))
    waitlist.fields.add(new SelectField({ name: "status", values: ["waiting", "offered", "accepted", "declined", "expired", "cancelled"], maxSelect: 1, required: true }))
    waitlist.fields.add(new TextField({ name: "activeKey", max: 120 }))
    waitlist.fields.add(new DateField({ name: "joinedAt", required: true }))
    waitlist.fields.add(new DateField({ name: "offeredAt" }))
    waitlist.fields.add(new DateField({ name: "offerExpiresAt" }))
    waitlist.fields.add(new RelationField({ name: "acceptedRegistration", collectionId: registrations.id, maxSelect: 1, cascadeDelete: false }))
    waitlist.fields.add(new AutodateField({ name: "created", onCreate: true }))
    waitlist.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }))
    waitlist.indexes = [
      'CREATE UNIQUE INDEX idx_waitlist_active_key ON event_waitlist (activeKey) WHERE activeKey != ""',
      'CREATE INDEX idx_waitlist_event_user_status ON event_waitlist (event, user, status)',
      'CREATE INDEX idx_waitlist_event_status_joined ON event_waitlist (event, status, joinedAt, id)',
      'CREATE INDEX idx_waitlist_user_status ON event_waitlist (user, status, joinedAt)',
    ]
    app.save(waitlist)
  }

  var rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].getInt("waitlistOfferMinutes")) rows[i].set("waitlistOfferMinutes", 360)
    rows[i].set("waitlistReservedCount", 0)
    app.saveNoValidate(rows[i])
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("event_waitlist")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("registration_cancellation_requests")) } catch (_) {}
  var events = app.findCollectionByNameOrId("events")
  var names = [
    "allowSelfCancellation", "selfCancellationUntil", "refundRequestUntil", "refundPolicy",
    "waitlistEnabled", "waitlistOfferMinutes", "waitlistReservedCount",
  ]
  for (var i = 0; i < names.length; i++) {
    var field = events.fields.getByName(names[i])
    if (field) events.fields.removeById(field.id)
  }
  app.save(events)
})
