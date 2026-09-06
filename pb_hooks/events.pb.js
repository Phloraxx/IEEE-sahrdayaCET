/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(function (e) {
    var urlFields = ["externalLink", "externalFormUrl"]
    for (var ui = 0; ui < urlFields.length; ui++) {
        var urlValue = e.record.getString(urlFields[ui]) || ""
        if (urlValue && !/^https?:\/\//i.test(urlValue)) {
            throw e.badRequestError(urlFields[ui] + " must start with http:// or https://")
        }
    }
    if (String(e.record.getString("whatsappLink") || "").trim()) {
        throw e.badRequestError("Use private attendee access for WhatsApp group links")
    }

    var createPricing = require(__hooks + "/event-pricing-helpers.js")
    var createPricingValidation = createPricing.validateEventConfiguration(e.record)
    if (!createPricingValidation.ok) throw e.badRequestError(createPricingValidation.error)
    var createRequirements = require(__hooks + "/event-requirements-helpers.js").normalizeRecord(e.record)
    if (!createRequirements.ok) throw e.badRequestError(createRequirements.error)

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
    // Every ordinary event starts as a draft. Platform-admin imports may still
    // provide a published fixture or historical record explicitly.
    if (createRole !== "admin") {
        e.record.set("status", "draft")
    }
    e.next()
}, "events")

// ─── Events Update Hook ────────────────────────────────────────────
// Defense-in-depth: rejects non-admin writes to server-authoritative
// fields (registeredCount, checkedInCount). Counters are maintained by
// the registration hooks; chairs must never write them directly.
//
// isDeleted is command-owned. Ordinary record updates cannot archive an
// event; the Archive command enforces safe status/registration preconditions.
// Restoring an archived event remains platform-admin only.

onRecordUpdateRequest(function (e) {
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (err) { auth = null }

    var urlFields = ["externalLink", "externalFormUrl"]
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

    // Platform administrators have broad scope. Lifecycle transitions still
    // belong to their explicit command routes so every transition is audited.
    var isPlatformAdmin = role === "admin"

    var newRecord = e.record
    var oldRecord
    try {
        oldRecord = $app.findRecordById("events", newRecord.id)
    } catch (err) {
        throw e.notFoundError("Event not found", err)
    }

    // These columns predate the simplified lifecycle. Preserve historical
    // values for audit compatibility, but never let ordinary CRUD create a new
    // approval state or mutate an old one.
    var legacyWorkflowFields = [
        "approvalStatus", "approvalNote", "submittedBy", "submittedAt", "approvedBy", "approvedAt",
        "approvalRevision", "financeApprovalStatus", "financeApprovalNote", "financeApprovedBy", "financeApprovedAt"
    ]
    for (var legacyFieldIndex = 0; legacyFieldIndex < legacyWorkflowFields.length; legacyFieldIndex++) {
        var legacyField = legacyWorkflowFields[legacyFieldIndex]
        if (legacyField === "approvalRevision") newRecord.set(legacyField, oldRecord.getInt(legacyField) || 0)
        else newRecord.set(legacyField, oldRecord.getString(legacyField) || "")
    }

    if (!isPlatformAdmin && !authz.hasEventCapability($app, auth, "events.edit", oldRecord)) {
        throw e.forbiddenError("You do not have permission to edit this event")
    }

    if (newRecord.getInt("registeredCount") !== oldRecord.getInt("registeredCount")) {
        throw e.forbiddenError("Only the server may change event counters")
    }
    if (newRecord.getInt("checkedInCount") !== oldRecord.getInt("checkedInCount")) {
        throw e.forbiddenError("Only the server may change event counters")
    }
    if (newRecord.getString("status") !== oldRecord.getString("status")) {
        throw e.badRequestError("Use the event lifecycle command to change event status")
    }
    if (!isPlatformAdmin && newRecord.getString("society") !== oldRecord.getString("society")) {
        throw e.forbiddenError("Only platform administrators may transfer an event to another society")
    }
    if (newRecord.getString("whatsappLink") !== oldRecord.getString("whatsappLink")) {
        throw e.badRequestError("Use private attendee access for WhatsApp group links")
    }

    var updatePricing = require(__hooks + "/event-pricing-helpers.js")
    var updatePricingValidation = updatePricing.validateEventConfiguration(newRecord)
    if (!updatePricingValidation.ok) throw e.badRequestError(updatePricingValidation.error)
    var updateRequirements = require(__hooks + "/event-requirements-helpers.js").normalizeRecord(newRecord)
    if (!updateRequirements.ok) throw e.badRequestError(updateRequirements.error)
    var updateCouponPricingValidation = updatePricing.validateExistingCoupons($app, newRecord)
    if (!updateCouponPricingValidation.ok) throw e.badRequestError(updateCouponPricingValidation.error)

    var wasDeleted = oldRecord.getBool("isDeleted")
    var isNowDeleted = newRecord.getBool("isDeleted")
    if (!isPlatformAdmin && wasDeleted && !isNowDeleted) throw e.forbiddenError("Only platform administrators may restore deleted events")
    if (!wasDeleted && isNowDeleted) {
        throw e.badRequestError("Use the Archive event command so historical state is preserved safely")
    }

    e.next()
}, "events")
