/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var events = app.findCollectionByNameOrId("events")
  var users = app.findCollectionByNameOrId("users")
  function add(name, field) {
    if (!events.fields.getByName(name)) events.fields.add(field)
  }
  add("attendanceQualificationLocked", new BoolField({ name: "attendanceQualificationLocked" }))
  add("attendanceQualificationVersion", new NumberField({ name: "attendanceQualificationVersion", min: 0 }))
  add("attendanceQualificationLockedAt", new DateField({ name: "attendanceQualificationLockedAt" }))
  add("attendanceQualificationLockedBy", new RelationField({
    name: "attendanceQualificationLockedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false,
  }))
  add("attendanceQualificationSnapshot", new JSONField({ name: "attendanceQualificationSnapshot" }))
  app.save(events)
}, (app) => {
  var events = app.findCollectionByNameOrId("events")
  ;[
    "attendanceQualificationSnapshot",
    "attendanceQualificationLockedBy",
    "attendanceQualificationLockedAt",
    "attendanceQualificationVersion",
    "attendanceQualificationLocked",
  ].forEach(function (name) {
    var field = events.fields.getByName(name)
    if (field) events.fields.removeById(field.id)
  })
  app.save(events)
})
