/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  var academic = require(__hooks + "/academic-options.js")
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")
  var privateDetails = app.findCollectionByNameOrId("event_private_details")

  function addField(collection, name, field) {
    if (!collection.fields.getByName(name)) collection.fields.add(field)
  }

  addField(events, "eligibleSemesters", new JSONField({ name: "eligibleSemesters" }))
  addField(events, "eligibleProgrammes", new JSONField({ name: "eligibleProgrammes" }))
  addField(events, "ieeeMemberDiscountPercent", new NumberField({
    name: "ieeeMemberDiscountPercent",
    min: 0,
    max: 100,
  }))
  addField(events, "requirements", new JSONField({ name: "requirements" }))
  addField(events, "attendeeNote", new TextField({ name: "attendeeNote", max: 4000 }))
  app.save(events)

  addField(privateDetails, "whatsappGroupUrl", new TextField({
    name: "whatsappGroupUrl",
    max: 2000,
  }))
  app.save(privateDetails)

  addField(registrations, "programmeCode", new TextField({ name: "programmeCode", max: 80 }))
  addField(registrations, "semester", new SelectField({
    name: "semester",
    values: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    maxSelect: 1,
  }))
  addField(registrations, "ieeeMember", new BoolField({ name: "ieeeMember" }))
  addField(registrations, "ieeeMemberId", new TextField({ name: "ieeeMemberId", max: 80 }))
  addField(registrations, "discountSource", new SelectField({
    name: "discountSource",
    values: ["none", "ieee_member", "coupon"],
    maxSelect: 1,
  }))
  app.save(registrations)

  function jsonValue(value) {
    if (!value) return null
    if (typeof value === "object" && typeof value.string === "function") {
      try { return JSON.parse(String(value.string() || "null")) } catch (_) { return null }
    }
    if (Array.isArray(value)) {
      if (!value.length || typeof value[0] !== "number") return value
      try {
        var bytes = ""
        for (var j = 0; j < value.length; j++) bytes += String.fromCharCode(Number(value[j]) || 0)
        return JSON.parse(bytes)
      } catch (_) { return null }
    }
    if (typeof value === "string") {
      try { return JSON.parse(value) } catch (_) { return null }
    }
    return typeof value === "object" ? value : null
  }

  function forEachRecord(collectionName, callback) {
    var offset = 0
    var batchSize = 200
    while (true) {
      var rows = app.findRecordsByFilter(collectionName, "1 = 1", "id", batchSize, offset)
      if (!rows.length) break
      for (var index = 0; index < rows.length; index++) callback(rows[index])
      offset += rows.length
      if (rows.length < batchSize) break
    }
  }

  forEachRecord("events", function (event) {
    if (!Array.isArray(jsonValue(event.get("eligibleSemesters")))) event.set("eligibleSemesters", "[]")
    if (!Array.isArray(jsonValue(event.get("eligibleProgrammes")))) event.set("eligibleProgrammes", "[]")
    if (!Array.isArray(jsonValue(event.get("requirements")))) event.set("requirements", "[]")
    app.saveNoValidate(event)

    var legacyWhatsapp = String(event.getString("whatsappLink") || "").trim()
    if (!legacyWhatsapp) return
    var details = null
    try {
      details = app.findFirstRecordByFilter(
        "event_private_details",
        "event = {:eventId}",
        { eventId: event.id }
      )
    } catch (_) {}
    if (!details) details = new Record(privateDetails, { event: event.id })
    if (!String(details.getString("whatsappGroupUrl") || "").trim()) {
      details.set("whatsappGroupUrl", legacyWhatsapp)
      app.save(details)
    }
  })

  function asObject(value) {
    value = jsonValue(value)
    return value && typeof value === "object" && !Array.isArray(value) ? value : {}
  }

  forEachRecord("registrations", function (registration) {
    var responses = asObject(registration.get("formResponses"))
    var programmeCode = academic.normalizeProgramme(responses.branch)
    var semester = academic.normalizeSemester(responses.semester)
    var member = responses.isIeeeMember === true
    var membershipId = String(responses.ieeeMembershipId || "").trim().slice(0, 80)
    var discountPaise = Number(registration.get("discountPaise") || 0)
    var legacyDiscount = Number(registration.get("discountAmount") || 0)
    var couponCode = String(registration.getString("couponCode") || "").trim()

    if (programmeCode) registration.set("programmeCode", programmeCode)
    if (semester) registration.set("semester", semester)
    registration.set("ieeeMember", member)
    if (membershipId) registration.set("ieeeMemberId", membershipId)
    registration.set("discountSource", couponCode && (discountPaise > 0 || legacyDiscount > 0) ? "coupon" : "none")
    app.saveNoValidate(registration)
  })
}, (app) => {
  var events = app.findCollectionByNameOrId("events")
  var registrations = app.findCollectionByNameOrId("registrations")
  var privateDetails = app.findCollectionByNameOrId("event_private_details")

  function removeFields(collection, names) {
    for (var i = 0; i < names.length; i++) {
      var field = collection.fields.getByName(names[i])
      if (field) collection.fields.removeById(field.id)
    }
    app.save(collection)
  }

  removeFields(privateDetails, ["whatsappGroupUrl"])
  removeFields(registrations, [
    "programmeCode",
    "semester",
    "ieeeMember",
    "ieeeMemberId",
    "discountSource",
  ])

  removeFields(events, [
    "eligibleSemesters",
    "eligibleProgrammes",
    "ieeeMemberDiscountPercent",
    "requirements",
    "attendeeNote",
  ])
})
