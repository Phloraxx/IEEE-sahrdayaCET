/// <reference path="../pb_data/types.d.ts" />

// Temporary per-event payment routing while Razorpay UPI Intent activation is pending.
// Existing events remain on Razorpay; Kotak/PayGate is opt-in and can be switched
// back per event without touching registrations that already own a payment session.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  let field = events.fields.getByName("paymentProvider")
  if (!field) {
    field = new SelectField({
      name: "paymentProvider",
      values: ["razorpay", "kotak"],
      maxSelect: 1,
    })
    events.fields.add(field)
    app.save(events)
  } else {
    field.values = ["razorpay", "kotak"]
    field.maxSelect = 1
    field.required = false
    app.save(events)
  }

  const rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (const row of rows) {
    if (row.getString("paymentProvider")) continue
    row.set("paymentProvider", "razorpay")
    app.saveNoValidate(row)
  }

  // Keep the field optional at the schema edge so old imports/scripts that do
  // not know about provider routing still create safe Razorpay-default events.
  field = events.fields.getByName("paymentProvider")
  field.required = false
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  const field = events.fields.getByName("paymentProvider")
  if (field) {
    events.fields.removeById(field.id)
    app.save(events)
  }
})
