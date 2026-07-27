/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(function (e) {
    var urlFields = ["externalLink", "externalFormUrl", "whatsappLink"]
    for (var ui = 0; ui < urlFields.length; ui++) {
        var urlValue = e.record.getString(urlFields[ui]) || ""
        if (urlValue && !/^https?:\/\//i.test(urlValue)) {
            throw e.badRequestError(urlFields[ui] + " must start with http:// or https://")
        }
    }

    if (!e.record.getString("slug")) {
        var base = String(e.record.getString("title") || "")
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 180) || "event"
        var candidate = base
        var attempt = 0
        while (attempt < 20) {
            try {
                $app.findFirstRecordByFilter("events", "slug = {:slug}", { slug: candidate })
                attempt++
                candidate = base + "-" + $security.randomString(6).toLowerCase()
            } catch (_) {
                break
            }
        }
        e.record.set("slug", candidate)
    }
    e.next()
}, "events")

// ─── Events Update Hook ────────────────────────────────────────────
// Defense-in-depth: rejects non-admin writes to server-authoritative
// fields (registeredCount, checkedInCount). Counters are maintained by
// the registration hooks; chairs must never write them directly.
//
// isDeleted: chairs MAY soft-delete (false→true) their own events —
// the PocketBase collection rule verifies society ownership before this
// request hook runs. What chairs may NOT do is un-delete
// (true→false) — that remains admin-only.

onRecordUpdateRequest(function (e) {
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (err) { auth = null }

    var urlFields = ["externalLink", "externalFormUrl", "whatsappLink"]
    for (var ui = 0; ui < urlFields.length; ui++) {
        var urlValue = e.record.getString(urlFields[ui]) || ""
        if (urlValue && !/^https?:\/\//i.test(urlValue)) {
            throw e.badRequestError(urlFields[ui] + " must start with http:// or https://")
        }
    }

    var oldForSlug
    try { oldForSlug = $app.findRecordById("events", e.record.id) } catch (_) { oldForSlug = null }
    if (oldForSlug && e.record.getString("slug") !== oldForSlug.getString("slug")) {
        throw e.forbiddenError("Event URLs are immutable")
    }

    var role = ""
    if (auth) {
        try {
            if (auth.isSuperuser && auth.isSuperuser()) {
                role = "admin"
            } else {
                role = auth.getString("role") || ""
            }
        } catch (err) { role = "" }
    }

    // Admins pass unconditionally
    if (role === "admin") {
        e.next()
        return
    }

    // For chairs: reject writes to server-authoritative counter fields
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

    // Allow chairs to soft-delete (false→true) but not un-delete (true→false).
    var wasDeleted = oldRecord.getBool("isDeleted")
    var isNowDeleted = newRecord.getBool("isDeleted")
    if (wasDeleted && !isNowDeleted) {
        throw e.forbiddenError("Only admins may restore deleted events")
    }
    // false→true (soft-delete) is allowed for chairs — falls through.
    e.next()
}, "events")
