/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var events = app.findCollectionByNameOrId("events")

  if (!events.fields.getByName("timezone")) {
    events.fields.add(new TextField({ name: "timezone", max: 80 }))
  }
  if (!events.fields.getByName("attendanceMode")) {
    events.fields.add(new SelectField({
      name: "attendanceMode",
      values: ["onsite", "online", "hybrid"],
      maxSelect: 1,
    }))
  }
  if (!events.fields.getByName("locationAddress")) {
    events.fields.add(new TextField({ name: "locationAddress", max: 500 }))
  }
  app.save(events)

  var rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (!row.getString("timezone")) row.set("timezone", "Asia/Kolkata")
    var mode = row.getString("attendanceMode")
    if (mode !== "onsite" && mode !== "online" && mode !== "hybrid") {
      var venue = String(row.getString("venue") || "").toLowerCase()
      if (/\b(hybrid|mixed mode|online and offline)\b/.test(venue)) mode = "hybrid"
      else if (/\b(online|virtual|google meet|zoom|microsoft teams|webex|meet\.google\.com)\b/.test(venue)) mode = "online"
      else mode = "onsite"
      row.set("attendanceMode", mode)
    }
    app.saveNoValidate(row)
  }

  var privateDetails = null
  try { privateDetails = app.findCollectionByNameOrId("event_private_details") } catch (_) {}
  if (!privateDetails) {
    privateDetails = new Collection({
      type: "base",
      name: "event_private_details",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    })
    privateDetails.fields.add(new RelationField({
      name: "event",
      collectionId: events.id,
      maxSelect: 1,
      required: true,
      cascadeDelete: true,
    }))
    privateDetails.fields.add(new TextField({ name: "virtualJoinUrl", max: 2000 }))
    privateDetails.fields.add(new TextField({ name: "joinInstructions", max: 4000 }))
    privateDetails.indexes = [
      'CREATE UNIQUE INDEX idx_event_private_details_event ON event_private_details (event)',
    ]
    app.save(privateDetails)
  }
}, (app) => {
  try {
    var privateDetails = app.findCollectionByNameOrId("event_private_details")
    app.delete(privateDetails)
  } catch (_) {}

  var events = app.findCollectionByNameOrId("events")
  for (var i = 0; i < ["timezone", "attendanceMode", "locationAddress"].length; i++) {
    var field = events.fields.getByName(["timezone", "attendanceMode", "locationAddress"][i])
    if (field) events.fields.removeById(field.id)
  }
  app.save(events)
})
