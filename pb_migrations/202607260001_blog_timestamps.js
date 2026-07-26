/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const blogs = app.findCollectionByNameOrId("blogs")
  let changed = false

  if (!blogs.fields.getByName("created")) {
    blogs.fields.add(new AutodateField({ name: "created", onCreate: true }))
    changed = true
  }
  if (!blogs.fields.getByName("updated")) {
    blogs.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }))
    changed = true
  }

  if (changed) app.save(blogs)
}, (app) => {
  const blogs = app.findCollectionByNameOrId("blogs")
  const created = blogs.fields.getByName("created")
  const updated = blogs.fields.getByName("updated")
  if (created) blogs.fields.removeById(created.id)
  if (updated) blogs.fields.removeById(updated.id)
  app.save(blogs)
})
