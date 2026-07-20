/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("blogs")

    collection.listRule = 'published = true || @request.auth.role = "admin" || @request.auth.role = "content"'
    collection.viewRule = 'published = true || @request.auth.role = "admin" || @request.auth.role = "content"'
    collection.createRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation = @request.auth.id)'
    collection.updateRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation:changed = false)'
    collection.deleteRule = '@request.auth.role = "admin" || @request.auth.role = "content"'

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("blogs")

    collection.listRule = '@request.auth.role = "content" || published = true'
    collection.viewRule = '@request.auth.role = "content" || published = true'
    collection.createRule = '@request.auth.role = "content"'
    collection.updateRule = '@request.auth.role = "content"'
    collection.deleteRule = '@request.auth.role = "admin" || @request.auth.role = "content"'

    app.save(collection)
  },
)
