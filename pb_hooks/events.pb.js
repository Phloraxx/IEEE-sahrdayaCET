/// <reference path="../pb_data/types.d.ts" />

// ─── Events Update Hook ────────────────────────────────────────────
// Defense-in-depth: rejects non-admin writes to server-authoritative
// fields (registeredCount, checkedInCount, isDeleted). These counters
// are maintained by the registration hooks; chairs must never write
// them directly. Backstop for the events updateRule in migrate-pb-rules.ts.

onRecordUpdateRequest(function (e) {
    var role = ""
    try {
        role = e.requestInfo.auth.getString("role")
    } catch (err) {}

    // Admins pass unconditionally
    if (role === "admin") {
        e.next()
        return
    }

    // For chairs: reject writes to server-authoritative fields
    var newRecord = e.record
    var oldRecord
    try {
        oldRecord = $app.findRecordById("events", newRecord.id)
    } catch (err) {
        throw e.notFoundError("Event not found", err)
    }

    if (newRecord.getInt("registeredCount") !== oldRecord.getInt("registeredCount")) {
        throw e.forbiddenError("Only admins may change event counters")
    }
    if (newRecord.getInt("checkedInCount") !== oldRecord.getInt("checkedInCount")) {
        throw e.forbiddenError("Only admins may change event counters")
    }
    if (newRecord.getBool("isDeleted") !== oldRecord.getBool("isDeleted")) {
        throw e.forbiddenError("Only admins may change event deletion state")
    }
    e.next()
}, "events")
