/// <reference path="../pb_data/types.d.ts" />

function hasIndex(collection, name) {
  var indexes = collection.indexes || []
  for (var i = 0; i < indexes.length; i++) {
    if (String(indexes[i]).indexOf(name) !== -1) return true
  }
  return false
}

function ensureIndex(collection, name, unique, fields, where) {
  if (!hasIndex(collection, name)) collection.addIndex(name, unique, fields, where || "")
}

function assertUniqueSocietySlugs(app) {
  var rows = app.findRecordsByFilter("societies", "slug != ''", "slug", 0, 0)
  var seen = {}
  for (var i = 0; i < rows.length; i++) {
    var slug = rows[i].getString("slug") || ""
    if (seen[slug]) throw new Error("Cannot restore unique society slug index: duplicate slug " + slug)
    seen[slug] = true
  }
}

migrate((app) => {
  var societies = app.findCollectionByNameOrId("societies")
  assertUniqueSocietySlugs(app)
  ensureIndex(societies, "idx_societies_slug", true, "slug", "")
  ensureIndex(societies, "idx_societies_hidden", false, "isHidden", "")
  app.save(societies)

  var blogs = app.findCollectionByNameOrId("blogs")
  ensureIndex(blogs, "idx_blogs_published_at", false, "published, published_at", "")
  app.save(blogs)

  var execom = app.findCollectionByNameOrId("execom")
  ensureIndex(execom, "idx_execom_order", false, '"order"', "")
  ensureIndex(execom, "idx_execom_society", false, "society", "")
  app.save(execom)

  var registrations = app.findCollectionByNameOrId("registrations")
  ensureIndex(registrations, "idx_registrations_event_payment", false, "event, paymentTicketId", "")
  ensureIndex(registrations, "idx_registrations_event_ticket", false, "event, ticketId", "")
  app.save(registrations)
}, (_app) => {
  // Index normalization is intentionally non-destructive on rollback because
  // some deployments already had these indexes before this migration.
})
