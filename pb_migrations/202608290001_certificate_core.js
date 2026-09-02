/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var users = app.findCollectionByNameOrId("users")
  var societies = app.findCollectionByNameOrId("societies")
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")

  var templates = null
  try { templates = app.findCollectionByNameOrId("certificate_templates") } catch (_) {}
  if (!templates) {
    templates = new Collection({
      type: "base",
      name: "certificate_templates",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "name", required: true, max: 180 },
        { type: "select", name: "scopeType", values: ["branch", "society", "event"], maxSelect: 1, required: true },
        { type: "relation", name: "society", collectionId: societies.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: false },
        { type: "select", name: "certificateType", values: ["participation", "completion", "achievement", "appreciation", "volunteer", "speaker"], maxSelect: 1, required: true },
        { type: "number", name: "version", min: 1, required: true },
        { type: "select", name: "status", values: ["draft", "published", "archived"], maxSelect: 1, required: true },
        { type: "file", name: "sourceBackground", maxSelect: 1, maxSize: 26214400, protected: true, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
        { type: "file", name: "sourceSignatures", maxSelect: 6, maxSize: 5242880, protected: true, mimeTypes: ["image/png"] },
        { type: "file", name: "renderBase", maxSelect: 1, maxSize: 26214400, protected: true, mimeTypes: ["image/png", "image/webp"] },
        { type: "number", name: "canvasWidth", min: 1 },
        { type: "number", name: "canvasHeight", min: 1 },
        { type: "json", name: "layout" },
        { type: "text", name: "emailSubject", max: 240 },
        { type: "text", name: "emailHtml", max: 50000 },
        { type: "text", name: "emailText", max: 50000 },
        { type: "relation", name: "createdBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "publishedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "date", name: "publishedAt" },
        { type: "text", name: "contentHash", max: 128 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_certificate_templates_version ON certificate_templates (scopeType, society, event, name, version)',
        'CREATE INDEX idx_certificate_templates_event_status ON certificate_templates (event, status)',
        'CREATE INDEX idx_certificate_templates_society_status ON certificate_templates (society, status)',
      ],
    })
    app.save(templates)
  }

  var batches = null
  try { batches = app.findCollectionByNameOrId("certificate_batches") } catch (_) {}
  if (!batches) {
    batches = new Collection({
      type: "base",
      name: "certificate_batches",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "template", collectionId: templates.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "select", name: "audienceType", values: ["selected", "checked_in", "attendance_qualified", "confirmed"], maxSelect: 1, required: true },
        { type: "json", name: "audienceConfig" },
        { type: "text", name: "audienceFingerprint", max: 128 },
        { type: "select", name: "status", values: ["draft", "issued", "sending", "sent", "partial_failure", "cancelled_before_issue"], maxSelect: 1, required: true },
        { type: "number", name: "recipientCount", min: 0 },
        { type: "number", name: "issuedCount", min: 0 },
        { type: "number", name: "emailEligibleCount", min: 0 },
        { type: "number", name: "queuedCount", min: 0 },
        { type: "number", name: "sentCount", min: 0 },
        { type: "number", name: "failedCount", min: 0 },
        { type: "number", name: "missingEmailCount", min: 0 },
        { type: "relation", name: "createdBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "relation", name: "issuedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "date", name: "issuedAt" },
        { type: "date", name: "sendStartedAt" },
        { type: "date", name: "completedAt" },
        { type: "text", name: "note", max: 4000 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_certificate_batches_event_created ON certificate_batches (event, created)',
        'CREATE INDEX idx_certificate_batches_template_status ON certificate_batches (template, status)',
      ],
    })
    app.save(batches)
  }

  var certificates = null
  try { certificates = app.findCollectionByNameOrId("certificates") } catch (_) {}
  if (!certificates) {
    certificates = new Collection({
      type: "base",
      name: "certificates",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "registration", collectionId: registrations.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "batch", collectionId: batches.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "relation", name: "template", collectionId: templates.id, maxSelect: 1, required: true, cascadeDelete: false },
        { type: "select", name: "certificateType", values: ["participation", "completion", "achievement", "appreciation", "volunteer", "speaker"], maxSelect: 1, required: true },
        { type: "text", name: "credentialId", required: true, max: 120 },
        { type: "text", name: "verificationToken", required: true, max: 160 },
        { type: "text", name: "recipientNameSnapshot", required: true, max: 240 },
        { type: "email", name: "recipientEmailSnapshot" },
        { type: "text", name: "eventTitleSnapshot", required: true, max: 300 },
        { type: "text", name: "issuerNameSnapshot", max: 240 },
        { type: "date", name: "issuedAt", required: true },
        { type: "select", name: "status", values: ["active", "revoked", "superseded"], maxSelect: 1, required: true },
        { type: "date", name: "revokedAt" },
        { type: "relation", name: "revokedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "revocationReason", max: 4000 },
        { type: "number", name: "metadataVersion", min: 1 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_certificates_credential_id ON certificates (credentialId)',
        'CREATE UNIQUE INDEX idx_certificates_verification_token ON certificates (verificationToken)',
        'CREATE UNIQUE INDEX idx_certificates_active_registration_type ON certificates (registration, event, certificateType) WHERE status = \'active\'',
        'CREATE INDEX idx_certificates_event_registration ON certificates (event, registration)',
        'CREATE INDEX idx_certificates_batch_status ON certificates (batch, status)',
      ],
    })
    app.save(certificates)
  }

  if (!certificates.fields.getByName("supersedes")) {
    certificates.fields.add(new RelationField({ name: "supersedes", collectionId: certificates.id, maxSelect: 1, cascadeDelete: false }))
  }
  if (!certificates.fields.getByName("supersededBy")) {
    certificates.fields.add(new RelationField({ name: "supersededBy", collectionId: certificates.id, maxSelect: 1, cascadeDelete: false }))
  }
  app.save(certificates)

  var outbox = app.findCollectionByNameOrId("notification_outbox")
  var kindField = outbox.fields.getByName("kind")
  if (kindField) kindField.values = ["ticket", "receipt", "certificate"]
  if (!outbox.fields.getByName("certificate")) {
    outbox.fields.add(new RelationField({
      name: "certificate",
      collectionId: certificates.id,
      maxSelect: 1,
      cascadeDelete: false,
    }))
  }
  try { outbox.addIndex("idx_notification_outbox_certificate", false, "certificate", "") } catch (_) {}
  app.save(outbox)
}, (app) => {
  var rows = []
  try { rows = app.findRecordsByFilter("certificates", "1 = 1", "", 1, 0) } catch (_) {}
  if (rows.length) return

  try {
    var outbox = app.findCollectionByNameOrId("notification_outbox")
    var certificateField = outbox.fields.getByName("certificate")
    if (certificateField) outbox.fields.removeById(certificateField.id)
    try { outbox.removeIndex("idx_notification_outbox_certificate") } catch (_) {}
    var kindField = outbox.fields.getByName("kind")
    if (kindField) kindField.values = ["ticket", "receipt"]
    app.save(outbox)
  } catch (_) {}

  try { app.delete(app.findCollectionByNameOrId("certificates")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("certificate_batches")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("certificate_templates")) } catch (_) {}
})
