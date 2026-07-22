/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Coupon mutations are a multi-record command. Direct collection writes
  // would let callers desynchronize the denormalized society from the event.
  const coupons = app.findCollectionByNameOrId("coupons")
  coupons.createRule = null
  coupons.updateRule = null
  coupons.deleteRule = null
  app.save(coupons)

  // Registrations are audit/history records. Cancellation is a state change;
  // ordinary API deletion is not part of the application workflow.
  const registrations = app.findCollectionByNameOrId("registrations")
  registrations.deleteRule = null
  app.save(registrations)

  // The social feed was retired. Preserve legacy rows, but expose no CRUD or
  // realtime surface for a feature the product no longer serves.
  const feed = app.findCollectionByNameOrId("fifa_feed_events")
  feed.listRule = null
  feed.viewRule = null
  feed.createRule = null
  feed.updateRule = null
  feed.deleteRule = null
  app.save(feed)
}, (app) => {
  const coupons = app.findCollectionByNameOrId("coupons")
  coupons.createRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
  coupons.updateRule = coupons.createRule
  coupons.deleteRule = coupons.createRule
  app.save(coupons)

  const registrations = app.findCollectionByNameOrId("registrations")
  registrations.deleteRule = '@request.auth.role = "admin"'
  app.save(registrations)


  const feed = app.findCollectionByNameOrId("fifa_feed_events")
  feed.listRule = ""
  feed.viewRule = ""
  feed.createRule = null
  feed.updateRule = null
  feed.deleteRule = '@request.auth.role = "admin"'
  app.save(feed)
})
