/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/app/events/{id}/my-registration",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })
    var eventId = e.request.pathValue("id") || ""
    var payment = require(__hooks + "/razorpay-direct-helpers.js")
    var rh = require(__hooks + "/registration-helpers.js")

    var event
    try { event = $app.findRecordById("events", eventId) }
    catch (_) { return e.json(404, { error: "Event not found" }) }

    var records = []
    try {
      records = $app.findRecordsByFilter(
        "registrations",
        "user = {:user} && event = {:event}",
        "",
        100,
        0,
        { user: auth.id, event: eventId }
      )
    } catch (_) { records = [] }

    records.sort(function (a, b) {
      var av = Date.parse(a.getString("registrationDate") || a.getString("created") || "") || 0
      var bv = Date.parse(b.getString("registrationDate") || b.getString("created") || "") || 0
      return bv - av
    })

    var selected = null
    var manualReview = false
    for (var i = 0; i < records.length; i++) {
      var row = records[i]
      if (row.getString("registrationStatus") !== "cancelled") {
        selected = row
        break
      }
      var data = payment.asObject(row.get("paymentData"))
      if (data && data.manualReview === true) {
        selected = row
        manualReview = true
        break
      }
    }

    var endValue = event.getString("endDate") || event.getString("date")
    var endMs = Date.parse(endValue || "")
    var eventEnded = isFinite(endMs) && endMs <= Date.now()

    if (!selected) {
      return e.json(200, { found: false, eventEnded: eventEnded })
    }

    var paymentData = payment.asObject(selected.get("paymentData"))
    manualReview = manualReview || paymentData.manualReview === true
    var amount = rh.registrationAmount(selected)
    var status = selected.getString("registrationStatus") || ""
    var paymentStatus = selected.getString("paymentStatus") || ""
    var notifications = { ticket: null, receipt: null }
    try { notifications = require(__hooks + "/notification-helpers.js").snapshot(selected.id) } catch (_) {}

    return e.json(200, {
      found: true,
      registrationId: selected.id,
      registrationStatus: status,
      paymentStatus: paymentStatus,
      amount: amount,
      paymentRequired: status === "pending" && paymentStatus === "pending" && amount > 0,
      ticketId: selected.getString("ticketId") || "",
      manualReview: manualReview,
      reviewReason: String(paymentData.reviewReason || ""),
      receiptAvailable: (paymentStatus === "paid" || paymentStatus === "refunded") && amount > 0 && !!selected.getString("ticketId"),
      eventEnded: eventEnded,
      ticketEmailStatus: notifications.ticket ? notifications.ticket.status : "",
      receiptEmailStatus: notifications.receipt ? notifications.receipt.status : "",
    })
  },
  $apis.requireAuth("users")
)

// Reuse the attendee details from the user's most recent registration.
// Event-specific custom answers are intentionally not returned.
routerAdd(
  "GET",
  "/api/app/registration-memory",
  function (e) {
    var auth = e.auth
    if (!auth || !auth.id) return e.json(401, { error: "Authentication required" })

    var records = []
    try {
      records = $app.findRecordsByFilter(
        "registrations",
        "user = {:user}",
        "",
        100,
        0,
        { user: auth.id }
      )
    } catch (_) { records = [] }

    records.sort(function (a, b) {
      var av = Date.parse(a.getString("registrationDate") || a.getString("created") || "") || 0
      var bv = Date.parse(b.getString("registrationDate") || b.getString("created") || "") || 0
      return bv - av
    })

    if (!records.length) {
      return e.json(200, {
        found: false,
        profile: { name: "", phone: "", college: "", branch: "", semester: "", isIeeeMember: false, ieeeMembershipId: "" }
      })
    }

    var latest = records[0]
    var rh = require(__hooks + "/registration-helpers.js")
    var responses = rh.registrationJsonObject(latest.get("formResponses"))

    return e.json(200, {
      found: true,
      profile: {
        name: String(responses.name || latest.getString("userName") || auth.getString("name") || ""),
        phone: String(responses.phone || latest.getString("userPhone") || ""),
        college: String(responses.college || ""),
        branch: String(responses.branch || ""),
        semester: String(responses.semester || ""),
        isIeeeMember: responses.isIeeeMember === true,
        ieeeMembershipId: String(responses.ieeeMembershipId || "")
      }
    })
  },
  $apis.requireAuth("users")
)
