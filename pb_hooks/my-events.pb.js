/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/app/my-events",
  function (e) {
    if (!e.auth || !e.auth.id) return e.json(401, { error: "Authentication required" })
    e.response.header().set("Cache-Control", "no-store")
    e.response.header().set("X-Content-Type-Options", "nosniff")

    var items = require(__hooks + "/my-events-helpers.js").listForUser($app, e.auth.id)
    var actionNeeded = 0
    var upcoming = 0
    var past = 0
    for (var i = 0; i < items.length; i++) {
      var row = items[i]
      var financialException = row.registration.status === "cancelled" && row.registration.paymentStatus === "paid"
      var needsAction = row.registration.paymentRequired || row.registration.manualReview || financialException
      if (needsAction) actionNeeded += 1
      else if (row.ended || row.event.isArchived || row.event.status === "completed" || row.event.status === "cancelled" || row.registration.status === "cancelled") past += 1
      else upcoming += 1
    }
    return e.json(200, {
      items: items,
      summary: { total: items.length, actionNeeded: actionNeeded, upcoming: upcoming, past: past },
    })
  },
  $apis.requireAuth("users")
)
