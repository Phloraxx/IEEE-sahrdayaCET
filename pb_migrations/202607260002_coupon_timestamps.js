/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const coupons = app.findCollectionByNameOrId("coupons")
  let changed = false

  if (!coupons.fields.getByName("created")) {
    coupons.fields.add(new AutodateField({ name: "created", onCreate: true }))
    changed = true
  }
  if (!coupons.fields.getByName("updated")) {
    coupons.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }))
    changed = true
  }

  if (changed) app.save(coupons)
}, (app) => {
  const coupons = app.findCollectionByNameOrId("coupons")
  const created = coupons.fields.getByName("created")
  const updated = coupons.fields.getByName("updated")
  if (created) coupons.fields.removeById(created.id)
  if (updated) coupons.fields.removeById(updated.id)
  app.save(coupons)
})
