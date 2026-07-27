/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Chairs may see public events plus only private/draft events owned by a
    // society they chair. Previously every chair could enumerate every draft.
    const events = app.findCollectionByNameOrId("events")
    events.listRule = '(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
    events.viewRule = events.listRule
    app.save(events)

    // Content editors own their posts. Admins retain global editorial access.
    const blogs = app.findCollectionByNameOrId("blogs")
    blogs.listRule = 'published = true || @request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id)'
    blogs.viewRule = blogs.listRule
    blogs.createRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation = @request.auth.id)'
    blogs.updateRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id && @request.body.relation:changed = false)'
    blogs.deleteRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id)'
    app.save(blogs)

    // Bets are commands, not CRUD: direct creates are disabled.
    const fifaBets = app.findCollectionByNameOrId("fifa_bets")
    fifaBets.createRule = null
    app.save(fifaBets)

    const registrations = app.findCollectionByNameOrId("registrations")
    registrations.createRule = null
    registrations.addIndex("idx_registrations_ticketId", true, "ticketId", "ticketId != ''")
    registrations.addIndex("idx_registrations_user_event", true, "user, event", "registrationStatus != 'cancelled'")
    registrations.addIndex("idx_registrations_payment_ticket", true, "paymentTicketId", "paymentTicketId != ''")
    registrations.addIndex("idx_registrations_event", false, "event", "")
    registrations.addIndex("idx_registrations_status", false, "registrationStatus", "")
    registrations.addIndex("idx_registrations_regdate", false, "registrationDate", "")
    app.save(registrations)

    // Make coupon authorization local and cheap by denormalizing the event's
    // society onto each coupon. This avoids the fragile deep relation rule.
    const societies = app.findCollectionByNameOrId("societies")
    const coupons = app.findCollectionByNameOrId("coupons")
    if (!coupons.fields.getByName("society")) {
      coupons.fields.add(new RelationField({
        name: "society",
        collectionId: societies.id,
        maxSelect: 1,
        required: false,
        cascadeDelete: false,
      }))
      app.save(coupons)
    }

    const couponRecords = app.findRecordsByFilter("coupons", "1 = 1", "", 0, 0)
    for (const coupon of couponRecords) {
      const eventId = coupon.getString("event")
      if (!eventId) continue
      try {
        const event = app.findRecordById("events", eventId)
        coupon.set("society", event.getString("society"))
        app.save(coupon)
      } catch (_) {}
    }

    const societyField = coupons.fields.getByName("society")
    societyField.required = true
    coupons.listRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
    coupons.viewRule = coupons.listRule
    coupons.createRule = coupons.listRule
    coupons.updateRule = coupons.listRule
    coupons.deleteRule = coupons.listRule
    try { coupons.removeIndex("idx_coupons_code") } catch (_) {}
    coupons.addIndex("idx_coupons_event_code", true, "event, code", "")
    app.save(coupons)
  },
  (app) => {
    const events = app.findCollectionByNameOrId("events")
    events.listRule = '(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || @request.auth.role = "chair"'
    events.viewRule = events.listRule
    app.save(events)

    const blogs = app.findCollectionByNameOrId("blogs")
    blogs.listRule = 'published = true || @request.auth.role = "admin" || @request.auth.role = "content"'
    blogs.viewRule = blogs.listRule
    blogs.updateRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation:changed = false)'
    blogs.deleteRule = '@request.auth.role = "admin" || @request.auth.role = "content"'
    app.save(blogs)

    const fifaBets = app.findCollectionByNameOrId("fifa_bets")
    fifaBets.createRule = 'user = @request.auth.id && @request.body.status:changed = false && @request.body.payout:changed = false && @request.body.odds_locked:changed = false'
    app.save(fifaBets)

    const registrations = app.findCollectionByNameOrId("registrations")
    registrations.createRule = 'user = @request.auth.id'
    app.save(registrations)

    const coupons = app.findCollectionByNameOrId("coupons")
    coupons.listRule = '@request.auth.role = "admin" || @request.auth.role = "chair"'
    coupons.viewRule = coupons.listRule
    coupons.createRule = coupons.listRule
    coupons.updateRule = coupons.listRule
    coupons.deleteRule = coupons.listRule
    try { coupons.removeIndex("idx_coupons_event_code") } catch (_) {}
    coupons.addIndex("idx_coupons_code", true, "code", "")
    const societyField = coupons.fields.getByName("society")
    if (societyField) coupons.fields.removeById(societyField.id)
    app.save(coupons)
  }
)
