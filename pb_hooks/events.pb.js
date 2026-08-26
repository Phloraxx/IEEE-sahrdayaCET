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

    var createAuth = null
    try { createAuth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (_) { createAuth = null }
    var createAuthz = require(__hooks + "/workspace-authorization.js")
    var createRole = createAuthz.authRole(createAuth)
    // Only platform admins may bypass the proposal workflow on initial create.
    if (createRole !== "admin") {
        e.record.set("status", "draft")
        require(__hooks + "/event-workflow-helpers.js").resetApprovals(e.record)
    } else {
        if (!e.record.getString("approvalStatus")) e.record.set("approvalStatus", e.record.getString("status") === "published" ? "approved" : "draft")
        if (!e.record.getString("financeApprovalStatus")) e.record.set("financeApprovalStatus", (e.record.getFloat("price") || 0) > 0 ? (e.record.getString("status") === "published" ? "approved" : "pending") : "not_required")
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

    var authz = require(__hooks + "/workspace-authorization.js")
    var role = authz.authRole(auth)

    // Platform admins remain the emergency override path.
    if (role === "admin") {
        e.next()
        return
    }

    var newRecord = e.record
    var oldRecord
    try {
        oldRecord = $app.findRecordById("events", newRecord.id)
    } catch (err) {
        throw e.notFoundError("Event not found", err)
    }

    if (!authz.hasEventCapability($app, auth, "events.edit", oldRecord)) {
        throw e.forbiddenError("You do not have permission to edit this event")
    }

    if (newRecord.getInt("registeredCount") !== oldRecord.getInt("registeredCount")) {
        throw e.forbiddenError("Only the server may change event counters")
    }
    if (newRecord.getInt("checkedInCount") !== oldRecord.getInt("checkedInCount")) {
        throw e.forbiddenError("Only the server may change event counters")
    }
    if (newRecord.getString("society") !== oldRecord.getString("society")) {
        throw e.forbiddenError("Only platform administrators may transfer an event to another society")
    }

    var wasDeleted = oldRecord.getBool("isDeleted")
    var isNowDeleted = newRecord.getBool("isDeleted")
    if (wasDeleted && !isNowDeleted) throw e.forbiddenError("Only platform administrators may restore deleted events")
    if (!wasDeleted && isNowDeleted && !authz.hasEventCapability($app, auth, "events.cancel", oldRecord)) {
        throw e.forbiddenError("Event cancellation permission is required to archive an event")
    }

    // Workflow state is mutated only by /api/workspace/events/:id/workflow.
    var workflowHelpers = require(__hooks + "/event-workflow-helpers.js")
    var workflowFields = workflowHelpers.workflowFields()
    for (var wf = 0; wf < workflowFields.length; wf++) {
        var field = workflowFields[wf]
        if (field === "approvalRevision") newRecord.set(field, oldRecord.getInt(field) || 0)
        else newRecord.set(field, oldRecord.getString(field) || "")
    }

    var sensitiveChanged = workflowHelpers.anyChanged(newRecord, oldRecord, workflowHelpers.sensitiveFields())
    if (oldRecord.getString("status") === "published" && sensitiveChanged) {
        throw e.forbiddenError("Sensitive changes to a published event require review. Unpublish it through an approver workflow first.")
    }

    var oldStatus = oldRecord.getString("status") || "draft"
    var newStatus = newRecord.getString("status") || "draft"
    var legacyChair = role === "chair" && authz.legacyChairOwnsSociety($app, auth, oldRecord.getString("society") || "")

    if (oldStatus === "published" && newStatus !== "published" && newStatus !== "cancelled" && newStatus !== "completed") {
        if (!authz.hasEventCapability($app, auth, "events.publish", oldRecord)) {
            throw e.forbiddenError("Publishing permission is required to unpublish an event")
        }
    }

    if (newStatus === "published" && oldStatus !== "published" && !legacyChair) {
        if (!authz.hasEventCapability($app, auth, "events.publish", oldRecord)) {
            throw e.forbiddenError("Publishing permission is required")
        }
        if (oldRecord.getString("approvalStatus") !== "approved") {
            throw e.forbiddenError("Event approval is required before publishing")
        }
        if ((oldRecord.getFloat("price") || 0) > 0 && oldRecord.getString("financeApprovalStatus") !== "approved") {
            throw e.forbiddenError("Finance approval is required before publishing a paid event")
        }
    }

    if (sensitiveChanged && oldStatus !== "published") {
        workflowHelpers.resetApprovals(newRecord)
    }

    e.next()
}, "events")
