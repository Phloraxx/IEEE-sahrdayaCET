/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var users = app.findCollectionByNameOrId("users")
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")

  // Historical production schema drifted from the baseline: the UI already
  // exposes "cancelled", so make the stored select accept it too.
  var eventStatus = events.fields.getByName("status")
  if (eventStatus) {
    eventStatus.values = ["draft", "published", "completed", "cancelled"]
    app.save(events)
  }

  var paymentProvider = events.fields.getByName("paymentProvider")
  if (paymentProvider) {
    paymentProvider.values = ["kotak", "slice", "razorpay"]
    paymentProvider.required = true
    app.save(events)
  }

  // Manual/walk-in registrations may not have an IEEE website account. Public
  // self-service registrations still always provide a user relation.
  var userField = registrations.fields.getByName("user")
  if (userField) userField.required = false

  var paymentStatus = registrations.fields.getByName("paymentStatus")
  if (paymentStatus) {
    paymentStatus.values = ["pending", "paid", "failed", "not_required", "refunded"]
  }

  if (!registrations.fields.getByName("registrationSource")) {
    registrations.fields.add(new SelectField({
      name: "registrationSource",
      values: ["self_service", "admin"],
      maxSelect: 1,
    }))
  }
  if (!registrations.fields.getByName("internalNotes")) {
    registrations.fields.add(new TextField({ name: "internalNotes", max: 4000 }))
  }
  if (!registrations.fields.getByName("createdBy")) {
    registrations.fields.add(new RelationField({
      name: "createdBy",
      collectionId: users.id,
      maxSelect: 1,
      cascadeDelete: false,
    }))
  }
  app.save(registrations)

  // Preserve the active duplicate guard for account-backed registrations while
  // allowing multiple unrelated walk-ins with an empty user relation.
  try { registrations.removeIndex("idx_registrations_user_event") } catch (_) {}
  registrations.addIndex(
    "idx_registrations_user_event",
    true,
    "user, event",
    "user != '' AND registrationStatus != 'cancelled'",
  )
  registrations.addIndex(
    "idx_registrations_manual_email_event",
    true,
    "event, userEmail",
    "user = '' AND userEmail != '' AND registrationStatus != 'cancelled'",
  )
  registrations.addIndex(
    "idx_registrations_event_payment_status",
    false,
    "event, paymentStatus, registrationStatus",
    "",
  )
  registrations.addIndex(
    "idx_registrations_source",
    false,
    "registrationSource",
    "",
  )
  app.save(registrations)

  // Existing records predate registrationSource. Backfill without validating
  // unrelated legacy rows.
  var existing = app.findRecordsByFilter("registrations", "registrationSource = ''", "", 0, 0)
  for (var i = 0; i < existing.length; i++) {
    existing[i].set("registrationSource", "self_service")
    app.saveNoValidate(existing[i])
  }

  var audit = null
  try { audit = app.findCollectionByNameOrId("admin_audit_log") } catch (_) {}
  if (!audit) {
    audit = new Collection({
      type: "base",
      name: "admin_audit_log",
      listRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
      viewRule: '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "registration", collectionId: registrations.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "actor", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "action", required: true, max: 160 },
        { type: "text", name: "note", max: 4000 },
        { type: "json", name: "before" },
        { type: "json", name: "after" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        'CREATE INDEX idx_admin_audit_event_created ON admin_audit_log (event, created)',
        'CREATE INDEX idx_admin_audit_registration_created ON admin_audit_log (registration, created)',
        'CREATE INDEX idx_admin_audit_actor_created ON admin_audit_log (actor, created)',
      ],
    })
    app.save(audit)
  }
}, (app) => {
  try {
    var audit = app.findCollectionByNameOrId("admin_audit_log")
    app.delete(audit)
  } catch (_) {}

  var registrations = app.findCollectionByNameOrId("registrations")
  try { registrations.removeIndex("idx_registrations_manual_email_event") } catch (_) {}
  try { registrations.removeIndex("idx_registrations_event_payment_status") } catch (_) {}
  try { registrations.removeIndex("idx_registrations_source") } catch (_) {}
  try { registrations.removeIndex("idx_registrations_user_event") } catch (_) {}
  registrations.addIndex(
    "idx_registrations_user_event",
    true,
    "user, event",
    "registrationStatus != 'cancelled'",
  )
  var fields = ["registrationSource", "internalNotes", "createdBy"]
  for (var i = 0; i < fields.length; i++) {
    var field = registrations.fields.getByName(fields[i])
    if (field) registrations.fields.removeById(field.id)
  }
  var userField = registrations.fields.getByName("user")
  if (userField) userField.required = true
  app.save(registrations)
})
