/// <reference path="../pb_data/types.d.ts" />

// Keep older chair/admin clients and clean-room fixtures compatible. The
// registration command still locks an explicit provider for every paid
// registration and safely treats a missing legacy event value as Kotak.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  const field = events.fields.getByName("paymentProvider")
  if (!field || field.required === false) return
  field.required = false
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  const field = events.fields.getByName("paymentProvider")
  if (!field || field.required === true) return
  field.required = true
  app.save(events)
})
