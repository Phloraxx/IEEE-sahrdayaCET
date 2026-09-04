/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var privateDetails = app.findCollectionByNameOrId("event_private_details")

  while (true) {
    var events = app.findRecordsByFilter("events", "whatsappLink != ''", "id", 200, 0)
    if (!events.length) break

    for (var i = 0; i < events.length; i++) {
      var event = events[i]
      var legacyWhatsapp = String(event.getString("whatsappLink") || "").trim()
      var details = null
      try {
        details = app.findFirstRecordByFilter(
          "event_private_details",
          "event = {:eventId}",
          { eventId: event.id }
        )
      } catch (_) {}

      if (/^https?:\/\//i.test(legacyWhatsapp)) {
        if (!details) details = new Record(privateDetails, { event: event.id })
        if (!String(details.getString("whatsappGroupUrl") || "").trim()) {
          details.set("whatsappGroupUrl", legacyWhatsapp)
          app.save(details)
        }
      }

      event.set("whatsappLink", "")
      app.saveNoValidate(event)
    }
  }
}, (app) => {
  var offset = 0
  var batchSize = 200
  while (true) {
    var rows = app.findRecordsByFilter(
      "event_private_details",
      "whatsappGroupUrl != ''",
      "id",
      batchSize,
      offset
    )
    if (!rows.length) break

    for (var i = 0; i < rows.length; i++) {
      var details = rows[i]
      var eventId = details.getString("event") || ""
      if (!eventId) continue
      var event = null
      try { event = app.findRecordById("events", eventId) } catch (_) { event = null }
      if (!event || String(event.getString("whatsappLink") || "").trim()) continue
      event.set("whatsappLink", details.getString("whatsappGroupUrl") || "")
      app.saveNoValidate(event)
    }

    offset += rows.length
    if (rows.length < batchSize) break
  }
})
