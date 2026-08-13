/// <reference path="../pb_data/types.d.ts" />

/**
 * Decide whether an otherwise valid PayGate payment.paid transition is allowed
 * to mint/confirm an IEEE event ticket.
 *
 * A payment can arrive after an organizer has already cancelled a registration,
 * cancelled the event, or soft-deleted it. In those cases the money is real,
 * but issuing a ticket would resurrect released capacity or a cancelled event.
 */
function paymentConfirmationDisposition(registration, app) {
    var store = app || $app
    if (!registration) {
        return { blocked: true, reason: "PayGate payment arrived for an unavailable registration" }
    }

    if (registration.getString("registrationStatus") === "cancelled") {
        return {
            blocked: true,
            reason: "PayGate reported a successful payment after the registration seat was released",
        }
    }

    var eventId = registration.getString("event") || ""
    if (!eventId) {
        return { blocked: true, reason: "PayGate payment arrived for a registration with no event" }
    }

    var event
    try {
        event = store.findRecordById("events", eventId)
    } catch (_) {
        return { blocked: true, reason: "PayGate payment arrived after the event became unavailable" }
    }

    if (event.getBool("isDeleted")) {
        return { blocked: true, reason: "PayGate payment arrived after the event was deleted" }
    }
    if (event.getString("status") === "cancelled") {
        return { blocked: true, reason: "PayGate payment arrived after the event was cancelled" }
    }

    return { blocked: false, reason: "" }
}

/**
 * Preserve the financial truth (money received) without restoring event access.
 * No ticket is minted. Existing cancelled tickets, if any, remain invalid via
 * registrationStatus and the database-layer check-in invariant.
 */
function recordPaidManualReview(registration, payment, payGateEventId, reason, app) {
    var store = app || $app
    var pg = require(__hooks + "/paygate-helpers.js")
    var data = pg.updateProviderData(registration, payment, {
        providerStatus: "paid",
        manualReview: true,
        reviewReason: reason || "PayGate payment requires organizer review",
    })
    if (payGateEventId) data = pg.appendEventId(data, payGateEventId)

    registration.set("registrationStatus", "cancelled")
    registration.set("paymentStatus", "paid")
    registration.set("paymentData", data)
    store.save(registration)
    return data
}

module.exports = {
    paymentConfirmationDisposition: paymentConfirmationDisposition,
    recordPaidManualReview: recordPaidManualReview,
}
