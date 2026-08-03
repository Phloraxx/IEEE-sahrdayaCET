/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const execom = app.findCollectionByNameOrId("execom")
  if (execom.fields.getByName("portfolio")) return

  execom.fields.add(new URLField({ name: "portfolio" }))
  app.save(execom)
}, () => {
  // Intentionally retained on rollback: the baseline also defines this additive
  // field, and dropping it could discard portfolio data from existing records.
})
