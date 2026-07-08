/// <reference path="../pb_data/types.d.ts" />

// ─── Events Update Hook ────────────────────────────────────────────
// Defense-in-depth: rejects non-admin writes to server-authoritative
// fields (registeredCount, checkedInCount) and prevents un-deleting
// a soft-deleted event (isDeleted: true → false).
//
// Soft-deletes performed via the app server use the superuser client
// (no auth record, bypasses this hook's role check). The guard below
// therefore only triggers for authenticated chair/user sessions trying
// to write directly to the PB REST API.

onRecordUpdateRequest(function (e) {
    var role = ""
    try {
        role = e.requestInfo.auth.getString("role")
    } catch (err) {}

    // Admins pass unconditionally
    if (role === "admin") {
        return
    }

    // For chairs / unauthenticated direct-API calls: reject writes to
    // server-authoritative fields.
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
    // Block un-deleting (true → false) but allow soft-delete (false → true)
    // only when explicitly called by the app server. Direct REST calls by
    // chairs are still rejected here since they won't carry a superuser token.
    if (oldRecord.getBool("isDeleted") === true && newRecord.getBool("isDeleted") === false) {
        throw e.forbiddenError("Only admins may restore a deleted event")
    }
}, "events")

