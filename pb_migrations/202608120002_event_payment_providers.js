/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  let field = events.fields.getByName("paymentProvider")
  if (!field) {
    field = new SelectField({
      name: "paymentProvider",
      values: ["kotak", "slice", "razorpay"],
      maxSelect: 1,
    })
    events.fields.add(field)
    app.save(events)
  }

  const rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (const row of rows) {
    if (row.getString("paymentProvider")) continue
    row.set("paymentProvider", "kotak")
    // Production contains historical events that predate today's required
    // fields (for example, an event with no society). A normal save validates
    // the entire legacy record and prevents PocketBase from starting. Only
    // persist this additive backfill; leave unrelated legacy data untouched.
    app.saveNoValidate(row)
  }

  field = events.fields.getByName("paymentProvider")
  field.required = true
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  const field = events.fields.getByName("paymentProvider")
  if (field) {
    events.fields.removeById(field.id)
    app.save(events)
  }
})
