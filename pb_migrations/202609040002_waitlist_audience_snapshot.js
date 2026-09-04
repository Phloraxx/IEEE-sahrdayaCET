/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var waitlist = app.findCollectionByNameOrId("event_waitlist")
  if (!waitlist.fields.getByName("programmeCode")) {
    waitlist.fields.add(new TextField({ name: "programmeCode", max: 80 }))
  }
  if (!waitlist.fields.getByName("semester")) {
    waitlist.fields.add(new SelectField({
      name: "semester",
      values: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
      maxSelect: 1,
    }))
  }
  app.save(waitlist)
}, (app) => {
  var waitlist = app.findCollectionByNameOrId("event_waitlist")
  var names = ["programmeCode", "semester"]
  for (var i = 0; i < names.length; i++) {
    var field = waitlist.fields.getByName(names[i])
    if (field) waitlist.fields.removeById(field.id)
  }
  app.save(waitlist)
})