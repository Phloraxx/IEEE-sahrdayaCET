/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  let slugField = events.fields.getByName("slug")
  if (!slugField) {
    slugField = new TextField({ name: "slug", max: 220 })
    events.fields.add(slugField)
    app.save(events)
  }

  const rows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  const used = {}
  for (const row of rows) {
    const current = row.getString("slug")
    if (current) used[current] = true
  }

  const slugify = (value) => String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)

  for (const row of rows) {
    if (row.getString("slug")) continue
    const base = slugify(row.getString("title")) || "event"
    let slug = base
    if (used[slug]) slug = `${base}-${row.id.slice(0, 6)}`
    while (used[slug]) slug = `${base}-${row.id}`
    row.set("slug", slug)
    app.save(row)
    used[slug] = true
  }

  slugField = events.fields.getByName("slug")
  slugField.required = true
  events.addIndex("idx_events_slug", true, "slug", "")
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  try { events.removeIndex("idx_events_slug") } catch (_) {}
  app.save(events)
})
