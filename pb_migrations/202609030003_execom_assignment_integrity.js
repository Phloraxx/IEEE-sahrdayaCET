/// <reference path="../pb_data/types.d.ts" />

function hasIndex(collection, name) {
  var indexes = collection.indexes || []
  for (var i = 0; i < indexes.length; i++) {
    if (String(indexes[i]).indexOf(name) !== -1) return true
  }
  return false
}

migrate((app) => {
  var execom = app.findCollectionByNameOrId("execom")
  var assignments = app.findCollectionByNameOrId("organization_assignments")

  if (!assignments.fields.getByName("sourceExecom")) {
    assignments.fields.add(new RelationField({
      name: "sourceExecom",
      collectionId: execom.id,
      maxSelect: 1,
      cascadeDelete: false,
    }))
    app.save(assignments)
  }

  // Backfill only trustworthy one-to-one backlinks. If legacy data reused an
  // assignment row across multiple Execom records, keep the first stable link
  // and clear later backlinks so the runtime reconciler can mint distinct rows.
  var claimedAssignments = {}
  var rows = app.findRecordsByFilter("execom", "1 = 1", "id", 0, 0)
  for (var i = 0; i < rows.length; i++) {
    var member = rows[i]
    var assignmentId = String(member.getString("assignment") || "").trim()
    if (!assignmentId) continue

    var assignment = null
    try { assignment = app.findRecordById("organization_assignments", assignmentId) } catch (_) {}
    var source = assignment ? (assignment.getString("source") || "") : ""
    var sourceExecom = assignment ? (assignment.getString("sourceExecom") || "") : ""
    var trustworthy = assignment && source === "execom" &&
      (!sourceExecom || sourceExecom === member.id) &&
      (!claimedAssignments[assignmentId] || claimedAssignments[assignmentId] === member.id)

    if (!trustworthy) {
      app.db().newQuery("UPDATE execom SET assignment = '' WHERE id = {:id}")
        .bind({ id: member.id }).execute()
      continue
    }

    claimedAssignments[assignmentId] = member.id
    app.db().newQuery("UPDATE organization_assignments SET sourceExecom = {:source} WHERE id = {:id}")
      .bind({ source: member.id, id: assignmentId }).execute()
  }

  assignments = app.findCollectionByNameOrId("organization_assignments")
  if (!hasIndex(assignments, "idx_org_assignments_source_execom_unique")) {
    assignments.addIndex(
      "idx_org_assignments_source_execom_unique",
      true,
      "sourceExecom",
      "source = 'execom' AND sourceExecom <> '' AND active = true"
    )
  }
  app.save(assignments)

  execom = app.findCollectionByNameOrId("execom")
  if (!hasIndex(execom, "idx_execom_assignment_unique")) {
    execom.addIndex("idx_execom_assignment_unique", true, "assignment", "assignment <> ''")
  }
  app.save(execom)
}, (app) => {
  var execom = app.findCollectionByNameOrId("execom")
  var assignments = app.findCollectionByNameOrId("organization_assignments")

  try { execom.removeIndex("idx_execom_assignment_unique") } catch (_) {}
  app.save(execom)

  try { assignments.removeIndex("idx_org_assignments_source_execom_unique") } catch (_) {}
  var field = assignments.fields.getByName("sourceExecom")
  if (field) assignments.fields.removeById(field.id)
  app.save(assignments)
})
