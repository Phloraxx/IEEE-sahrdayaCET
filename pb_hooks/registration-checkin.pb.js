/// <reference path="../pb_data/types.d.ts" />

// ─── Registration Check-in Invariants ───────────────────────────────
// Check-in validity is a database-layer invariant, not just a TanStack route
// concern. This lower-level model hook runs for REST updates and internal
// $app.save()/saveNoValidate() updates, so no caller can persist an invalid
// check-in state by bypassing the application routes.

onRecordUpdate(function (e) {
    var reg = e.record
    var oldReg = reg.original()

    var wasCheckedIn = oldReg.getBool("checkedIn")
    var isCheckedIn = reg.getBool("checkedIn")
    var oldCheckedInAt = oldReg.getString("checkedInAt") || ""
    var newCheckedInAt = reg.getString("checkedInAt") || ""

    // checkedInAt is server-authoritative. Callers cannot rewrite the timestamp
    // independently of a check-in state transition.
    if (wasCheckedIn === isCheckedIn && oldCheckedInAt !== newCheckedInAt) {
        throw new BadRequestError("Check-in timestamp is managed by the server")
    }

    // false -> true: only confirmed registrations for check-in-enabled events
    // may be checked in. Stamp the time here so callers cannot forge it.
    if (!wasCheckedIn && isCheckedIn) {
        if (reg.getString("registrationStatus") !== "confirmed") {
            throw new BadRequestError("Only confirmed registrations can be checked in")
        }

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

        reg.set("checkedInAt", new Date().toISOString())
    }

    // true -> false: keep the two fields consistent if an authorized workflow
    // ever supports undoing a check-in.
    if (wasCheckedIn && !isCheckedIn) {
        reg.set("checkedInAt", "")
    }

    e.next()
}, "registrations")
