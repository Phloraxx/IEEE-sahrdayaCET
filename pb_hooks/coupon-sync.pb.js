/// <reference path="../pb_data/types.d.ts" />

// Atomically reconcile an event's coupon set. The event itself remains normal
// PocketBase CRUD; only the genuinely multi-record operation gets a command.
routerAdd("PUT", "/api/app/events/{id}/coupons", function (e) {
  var auth = e.auth
  if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })
  var authz = require(__hooks + "/workspace-authorization.js")

  var eventId = e.request.pathValue("id")
  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var incoming = Array.isArray(body.coupons) ? body.coupons : []

  var result = null
  try {
    $app.runInTransaction(function (txApp) {
      var event
      try { event = txApp.findRecordById("events", eventId) }
      catch (_) { throw new Error("Event not found") }
      var societyId = event.getString("society")
      if (!societyId) throw new Error("Event has no society")
      if (!authz.hasEventCapability(txApp, auth, "events.edit", event)) {
        throw new Error("You cannot manage coupons for this event")
      }

      var normalized = []
      var seenCodes = {}
      for (var i = 0; i < incoming.length; i++) {
        var raw = incoming[i] || {}
        var code = String(raw.code || "").trim().toUpperCase()
        if (!code) throw new Error("Coupon code is required")
        if (seenCodes[code]) throw new Error("Duplicate coupon code: " + code)
        seenCodes[code] = true
        var discountPercent = Math.floor(Number(raw.discountPercent) || 0)
        var maxUses = Math.floor(Number(raw.maxUses) || 0)
        if (discountPercent < 0 || discountPercent > 100) throw new Error("Coupon discount must be between 0 and 100")
        if (maxUses < 0) throw new Error("Coupon max uses cannot be negative")
        normalized.push({
          id: String(raw.id || ""),
          code: code,
          discountPercent: discountPercent,
          maxUses: maxUses,
          expiresAt: String(raw.expiresAt || ""),
          isActive: raw.isActive !== false,
        })
      }

      var existing = txApp.findRecordsByFilter(
        "coupons", "event = {:eventId}", "", 0, 0, { eventId: eventId }
      )
      var byId = {}
      for (var ei = 0; ei < existing.length; ei++) byId[existing[ei].id] = existing[ei]
      var retained = {}
      var created = 0, updated = 0, deleted = 0

      for (var ni = 0; ni < normalized.length; ni++) {
        var item = normalized[ni]
        var record = item.id && byId[item.id] ? byId[item.id] : null
        if (record) {
          retained[record.id] = true
          record.set("code", item.code)
          record.set("discountPercent", item.discountPercent)
          record.set("maxUses", item.maxUses)
          record.set("expiresAt", item.expiresAt)
          record.set("isActive", item.isActive)
          record.set("society", societyId)
          txApp.save(record)
          updated++
        } else {
          record = new Record(txApp.findCollectionByNameOrId("coupons"), {
            event: eventId,
            society: societyId,
            code: item.code,
            discountPercent: item.discountPercent,
            maxUses: item.maxUses,
            usedCount: 0,
            expiresAt: item.expiresAt,
            isActive: item.isActive,
          })
          txApp.save(record)
          created++
        }
      }

      for (var di = 0; di < existing.length; di++) {
        var old = existing[di]
        if (retained[old.id]) continue
        if ((old.getInt("usedCount") || 0) > 0) {
          throw new Error("Used coupon '" + old.getString("code") + "' cannot be deleted; deactivate it instead")
        }
        txApp.delete(old)
        deleted++
      }

      result = { success: true, created: created, updated: updated, deleted: deleted }
    })
  } catch (err) {
    var message = err && err.message ? String(err.message) : String(err)
    return e.json(message === "Event not found" ? 404 : 400, { error: message })
  }
  return e.json(200, result)
}, $apis.requireAuth("users"))
