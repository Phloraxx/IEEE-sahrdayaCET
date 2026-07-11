/// <reference path="../pb_data/types.d.ts" />

// ─── Events Update Hook ────────────────────────────────────────────
// Defense-in-depth: rejects non-admin writes to server-authoritative
// fields (registeredCount, checkedInCount). Counters are maintained by
// the registration hooks; chairs must never write them directly.
//
// isDeleted: chairs MAY soft-delete (false→true) their own events —
// the app-layer (requireEventScope) has already verified ownership before
// the request reaches PocketBase. What chairs may NOT do is un-delete
// (true→false) — that remains admin-only.

onRecordUpdateRequest(function (e) {
    var role = ""
    try {
        role = e.requestInfo.auth.getString("role")
    } catch (err) {}

    // Admins pass unconditionally
    if (role === "admin") {
        return
    }

    // For chairs: reject writes to server-authoritative counter fields
    var newRecord = e.record
    var oldRecord
    try {
        oldRecord = $app.findRecordById("events", newRecord.id)
    } catch (err) {
        return
    }

    if (newRecord.getInt("registeredCount") !== oldRecord.getInt("registeredCount")) {
        throw e.forbiddenError("Only admins may change event counters")
    }
    if (newRecord.getInt("checkedInCount") !== oldRecord.getInt("checkedInCount")) {
        throw e.forbiddenError("Only admins may change event counters")
    }

    // Allow chairs to soft-delete (false→true) but not un-delete (true→false).
    var wasDeleted = oldRecord.getBool("isDeleted")
    var isNowDeleted = newRecord.getBool("isDeleted")
    if (wasDeleted && !isNowDeleted) {
        throw e.forbiddenError("Only admins may restore deleted events")
    }
    // false→true (soft-delete) is allowed for chairs — falls through.
}, "events")
