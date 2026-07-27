/// <reference path="../pb_data/types.d.ts" />

/**
 * Pure registration check-in transition rules.
 *
 * Kept free of PocketBase globals so the exact decision logic can be exercised
 * by Vitest while remaining reusable from the PocketBase Goja hook runtime.
 */
function resolveCheckInTransition(input) {
    var oldCheckedIn = !!input.oldCheckedIn
    var newCheckedIn = !!input.newCheckedIn
    var newStatus = input.newStatus || ""
    var oldCheckedInAt = input.oldCheckedInAt || ""
    var newCheckedInAt = input.newCheckedInAt || ""

    // A registration that is no longer confirmed cannot remain checked in.
    // This handles confirmed -> cancelled after an attendee already checked in.
    if (oldCheckedIn && newCheckedIn && newStatus !== "confirmed") {
        return { action: "clear" }
    }

    // checkedInAt is server-authoritative. Callers may not rewrite it without
    // an actual check-in state transition.
    if (oldCheckedIn === newCheckedIn && oldCheckedInAt !== newCheckedInAt) {
        return {
            action: "error",
            message: "Check-in timestamp is managed by the server",
        }
    }

    if (!oldCheckedIn && newCheckedIn) {
        if (newStatus !== "confirmed") {
            return {
                action: "error",
                message: "Only confirmed registrations can be checked in",
            }
        }
        return { action: "check_in" }
    }

    if (oldCheckedIn && !newCheckedIn) {
        return { action: "clear" }
    }

    return { action: "none" }
}

module.exports = {
    resolveCheckInTransition: resolveCheckInTransition,
}
