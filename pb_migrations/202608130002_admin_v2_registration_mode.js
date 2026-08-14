/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var events = app.findCollectionByNameOrId("events")
  var paymentProvider = events.fields.getByName("paymentProvider")
  if (paymentProvider) {
    paymentProvider.values = ["kotak", "slice", "razorpay"]
    paymentProvider.required = false
  }
  var registrationMode = events.fields.getByName("registrationMode")
  if (!registrationMode) {
    registrationMode = new SelectField({
      name: "registrationMode",
      values: ["internal", "external", "closed"],
      maxSelect: 1,
    })
    events.fields.add(registrationMode)
  }
  app.save(events)

  var rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var existing = row.getString("registrationMode")
    if (existing === "internal" || existing === "external" || existing === "closed") continue
    var mode = row.getString("externalFormUrl") ? "external" : (row.getBool("registrationOpen") ? "internal" : "closed")
    row.set("registrationMode", mode)
    row.set("registrationOpen", mode !== "closed")
    app.saveNoValidate(row)
  }
  // Keep optional until every event writer sends this field explicitly.
  registrationMode = events.fields.getByName("registrationMode")
  registrationMode.required = false
  app.save(events)
}, (app) => {
  var events = app.findCollectionByNameOrId("events")
  var field = events.fields.getByName("registrationMode")
  if (field) events.fields.removeById(field.id)
  app.save(events)
})
