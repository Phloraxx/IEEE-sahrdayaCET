/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var audit = app.findCollectionByNameOrId("admin_audit_log")
  if (!audit.fields.getByName("entityType")) {
    audit.fields.add(new TextField({ name: "entityType", max: 80 }))
  }
  if (!audit.fields.getByName("entityId")) {
    audit.fields.add(new TextField({ name: "entityId", max: 80 }))
  }
  if (!audit.fields.getByName("outcome")) {
    audit.fields.add(new SelectField({
      name: "outcome",
      values: ["success", "failure"],
      maxSelect: 1,
    }))
  }
  if (!audit.fields.getByName("requestId")) {
    audit.fields.add(new TextField({ name: "requestId", max: 120 }))
  }
  audit.addIndex("idx_admin_audit_entity_created", false, "entityType, entityId, created", "")
  app.save(audit)
}, (app) => {
  var audit = app.findCollectionByNameOrId("admin_audit_log")
  try { audit.removeIndex("idx_admin_audit_entity_created") } catch (_) {}
  var fields = ["requestId", "outcome", "entityId", "entityType"]
  for (var i = 0; i < fields.length; i++) {
    var field = audit.fields.getByName(fields[i])
    if (field) audit.fields.removeById(field.id)
  }
  app.save(audit)
})
