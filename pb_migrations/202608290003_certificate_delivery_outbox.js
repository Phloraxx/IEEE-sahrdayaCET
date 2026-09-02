/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var outbox = app.findCollectionByNameOrId("notification_outbox")
  var batches = app.findCollectionByNameOrId("certificate_batches")
  if (!outbox.fields.getByName("certificateBatch")) {
    outbox.fields.add(new RelationField({
      name: "certificateBatch",
      collectionId: batches.id,
      maxSelect: 1,
      cascadeDelete: false,
    }))
  }
  try { outbox.addIndex("idx_notification_outbox_certificate_batch", false, "certificateBatch", "") } catch (_) {}
  app.save(outbox)
}, (app) => {
  try {
    var outbox = app.findCollectionByNameOrId("notification_outbox")
    try { outbox.removeIndex("idx_notification_outbox_certificate_batch") } catch (_) {}
    var field = outbox.fields.getByName("certificateBatch")
    if (field) outbox.fields.removeById(field.id)
    app.save(outbox)
  } catch (_) {}
})
