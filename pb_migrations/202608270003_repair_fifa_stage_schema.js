/// <reference path="../pb_data/types.d.ts" />

// Some long-lived FIFA deployments predate group-stage support. Expand the
// existing enum without removing historical values or staging-only fields.
migrate((app) => {
  const matches = app.findCollectionByNameOrId("fifa_matches")
  const stage = matches.fields.getByName("stage")
  if (!stage) throw new Error("fifa_matches.stage is missing")

  const values = Array.isArray(stage.values) ? stage.values.slice() : []
  if (!values.includes("group")) values.unshift("group")
  stage.values = values
  stage.required = true
  stage.maxSelect = 1
  app.save(matches)
}, (_app) => {
  // Forward-only enum expansion. Existing records remain valid.
})
