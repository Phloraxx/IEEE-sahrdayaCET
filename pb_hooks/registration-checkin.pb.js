/// <reference path="../pb_data/types.d.ts" />

// ─── Registration Check-in Invariants ───────────────────────────────
// Check-in validity is a database-layer invariant, not just a TanStack route
// concern. This lower-level model hook runs for REST updates and internal
// $app.save()/saveNoValidate() updates, so no caller can persist an invalid
// check-in state by bypassing the application routes.

onRecordUpdate(function (e) {
    var invariants = require(__hooks + "/registration-checkin-invariants.js")
    var reg = e.record
    var oldReg = reg.original()

    var decision = invariants.resolveCheckInTransition({
        oldCheckedIn: oldReg.getBool("checkedIn"),
        newCheckedIn: reg.getBool("checkedIn"),
        newStatus: reg.getString("registrationStatus"),
        oldCheckedInAt: oldReg.getString("checkedInAt") || "",
        newCheckedInAt: reg.getString("checkedInAt") || "",
    })

    if (decision.action === "error") {
        throw new BadRequestError(decision.message)
    }

    // false -> true: the pure transition rule has already verified that the
    // registration is confirmed. Validate the event-level gate here.
    if (decision.action === "check_in") {
        var eventId = reg.getString("event") || ""
        if (!eventId) {
            throw new BadRequestError("Registration has no event")
        }

        var event
        try {
            event = $app.findRecordById("events", eventId)
        } catch (err) {
            throw new BadRequestError("Event not found")
        }

        if (!event.getBool("checkInEnabled")) {
            throw new BadRequestError("Check-in is not enabled for this event")
        }

        // PocketBase owns the timestamp; callers cannot forge it.
        reg.set("checkedInAt", new Date().toISOString())
    }

    // Explicit uncheck, or a status transition (for example confirmed ->
    // cancelled) that makes an existing check-in invalid.
    if (decision.action === "clear") {
        reg.set("checkedIn", false)
        reg.set("checkedInAt", "")
    }

    e.next()
}, "registrations")
