/// <reference path="../pb_data/types.d.ts" />

// Repair legacy coupon collections that predate the additive baseline.
// Some long-lived databases still mark zero-valued counters/limits as required,
// which makes a valid new coupon fail validation (for example usedCount = 0).
migrate((app) => {
  const coupons = app.findCollectionByNameOrId("coupons")
  const events = app.findCollectionByNameOrId("events")
  const societies = app.findCollectionByNameOrId("societies")

  function requireField(name) {
    const field = coupons.fields.getByName(name)
    if (!field) throw new Error(`coupons.${name} is missing`)
    return field
  }

  const event = requireField("event")
  event.collectionId = events.id
  event.maxSelect = 1
  event.required = true
  event.cascadeDelete = true

  const code = requireField("code")
  code.required = true
  code.max = 100
  if (!coupons.fields.getByName("description")) {
    coupons.fields.add(new TextField({ name: "description", max: 300 }))
  } else {
    const description = requireField("description")
    description.max = 300
    description.required = false
  }

  const discount = requireField("discountPercent")
  discount.required = false
  discount.min = 0
  discount.max = 100

  const maxUses = requireField("maxUses")
  maxUses.required = false
  maxUses.min = 0

  const usedCount = requireField("usedCount")
  usedCount.required = false
  usedCount.min = 0

  const expiresAt = requireField("expiresAt")
  expiresAt.required = false

  const isActive = requireField("isActive")
  isActive.required = false

  let society = coupons.fields.getByName("society")
  if (!society) {
    society = new RelationField({
      name: "society",
      collectionId: societies.id,
      maxSelect: 1,
      required: true,
      cascadeDelete: false,
    })
    coupons.fields.add(society)
  } else {
    society.collectionId = societies.id
    society.maxSelect = 1
    society.required = true
    society.cascadeDelete = false
  }

  // Coupon writes are command-route only. Keep direct CRUD closed while
  // preserving the scoped list/view rules installed by Community Roles V2.
  coupons.createRule = null
  coupons.updateRule = null
  coupons.deleteRule = null

  try { coupons.removeIndex("idx_coupons_code") } catch (_) {}
  try { coupons.removeIndex("idx_coupons_event_code") } catch (_) {}
  coupons.addIndex("idx_coupons_event_code", true, "event, code", "")

  app.save(coupons)
}, (_app) => {
  // Intentionally no destructive rollback. This migration only normalizes a
  // legacy schema to the additive baseline contract used by current code.
})
