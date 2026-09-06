migrate(function (app) {
  var events = app.findCollectionByNameOrId("events")
  var field = events.fields.getByName("paymentProvider")
  if (field) {
    events.fields.removeById(field.id)
    app.save(events)
  }
}, function (app) {
  var events = app.findCollectionByNameOrId("events")
  if (!events.fields.getByName("paymentProvider")) {
    events.fields.add(new SelectField({
      name: "paymentProvider",
      values: ["razorpay", "kotak"],
      maxSelect: 1,
    }))
    app.save(events)
  }
})
