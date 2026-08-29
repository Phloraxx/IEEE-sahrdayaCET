/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var batches = app.findCollectionByNameOrId("certificate_batches")

  if (!batches.fields.getByName("idempotencyKey")) {
    batches.fields.add(new TextField({ name: "idempotencyKey", max: 128 }))
  }
  if (!batches.fields.getByName("audienceSnapshot")) {
    batches.fields.add(new JSONField({ name: "audienceSnapshot" }))
  }

  try { batches.removeIndex("idx_certificate_batches_idempotency") } catch (_) {}
  batches.addIndex(
    "idx_certificate_batches_idempotency",
    true,
    "idempotencyKey",
    "idempotencyKey != ''"
  )
  app.save(batches)
}, (app) => {
  var rows = []
  try { rows = app.findRecordsByFilter("certificate_batches", "idempotencyKey != ''", "", 1, 0) } catch (_) {}
  if (rows.length) return

  var batches = app.findCollectionByNameOrId("certificate_batches")
  try { batches.removeIndex("idx_certificate_batches_idempotency") } catch (_) {}
  var snapshot = batches.fields.getByName("audienceSnapshot")
  if (snapshot) batches.fields.removeById(snapshot.id)
  var key = batches.fields.getByName("idempotencyKey")
  if (key) batches.fields.removeById(key.id)
  app.save(batches)
})
