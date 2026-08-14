/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var events = app.findCollectionByNameOrId("events")
  var field = events.fields.getByName("paymentProvider")
  if (field) {
    events.fields.removeById(field.id)
    app.save(events)
  }
}, (app) => {
  var events = app.findCollectionByNameOrId("events")
  if (events.fields.getByName("paymentProvider")) return
  events.fields.add(new SelectField({
    name: "paymentProvider",
    values: ["kotak", "slice", "razorpay"],
    maxSelect: 1,
  }))
  app.save(events)
})
