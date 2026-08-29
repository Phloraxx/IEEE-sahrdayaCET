/// <reference path="../pb_data/types.d.ts" />

onRecordCreate(function (e) {
  var record = e.record
  var status = record.getString("status") || "draft"
  if (status !== "draft") {
    if (!record.getString("idempotencyKey")) throw new BadRequestError("Issued certificate batches require an idempotency key")
    if (!record.getString("audienceFingerprint")) throw new BadRequestError("Issued certificate batches require an audience fingerprint")
    if ((record.getFloat("recipientCount") || 0) <= 0) throw new BadRequestError("Issued certificate batches require recipients")
  }
  e.next()
}, "certificate_batches")

onRecordUpdate(function (e) {
  var record = e.record
  var old = record.original()
  if ((old.getString("status") || "draft") !== "draft") {
    var rules = require(__hooks + "/certificate-template-rules.js")
    var frozen = ["event", "template", "audienceType", "audienceConfig", "audienceFingerprint", "audienceSnapshot", "idempotencyKey", "recipientCount", "issuedCount", "createdBy", "issuedBy", "issuedAt"]
    for (var i = 0; i < frozen.length; i++) {
      var field = frozen[i]
      if (rules.stableStringify(old.get(field)) !== rules.stableStringify(record.get(field))) {
        throw new BadRequestError("Issued certificate batch audience is immutable")
      }
    }
  }
  e.next()
}, "certificate_batches")

onRecordCreate(function (e) {
  var record = e.record
  if ((record.getString("status") || "") !== "active") throw new BadRequestError("New certificates must start active")
  if (record.getString("revokedAt") || record.getString("revokedBy") || record.getString("revocationReason") || record.getString("supersededBy")) throw new BadRequestError("New certificates cannot start with lifecycle termination metadata")
  if (!record.getString("credentialId")) throw new BadRequestError("Certificate credential ID is required")
  if (!record.getString("verificationToken")) throw new BadRequestError("Certificate verification token is required")
  if (!record.getString("recipientNameSnapshot")) throw new BadRequestError("Certificate recipient snapshot is required")
  if ((record.getFloat("metadataVersion") || 0) < 1) throw new BadRequestError("Certificate metadata version is invalid")
  e.next()
}, "certificates")

onRecordUpdate(function (e) {
  var record = e.record
  var old = record.original()
  var rules = require(__hooks + "/certificate-template-rules.js")
  var frozen = [
    "event", "registration", "batch", "template", "certificateType",
    "credentialId", "verificationToken", "recipientNameSnapshot",
    "recipientEmailSnapshot", "eventTitleSnapshot", "issuerNameSnapshot",
    "issuedAt", "metadataVersion"
  ]
  for (var i = 0; i < frozen.length; i++) {
    var field = frozen[i]
    if (rules.stableStringify(old.get(field)) !== rules.stableStringify(record.get(field))) {
      throw new BadRequestError("Issued certificate identity is immutable")
    }
  }
  var oldStatus = old.getString("status") || "active"
  var nextStatus = record.getString("status") || "active"
  if (oldStatus !== nextStatus && oldStatus !== "active") throw new BadRequestError("Revoked or superseded certificates cannot be reactivated")
  if (["active", "revoked", "superseded"].indexOf(nextStatus) === -1) throw new BadRequestError("Certificate status is invalid")
  if (nextStatus === "active" && record.getString("supersededBy")) throw new BadRequestError("Active certificates cannot point to a replacement")
  if (oldStatus === "active" && nextStatus !== "active") {
    if (!record.getString("revokedAt") || !record.getString("revokedBy") || !record.getString("revocationReason")) {
      throw new BadRequestError("Certificate termination requires time, actor, and reason")
    }
  }
  if (oldStatus !== "active") {
    var lifecycleFrozen = ["revokedAt", "revokedBy", "revocationReason", "supersedes"]
    for (var j = 0; j < lifecycleFrozen.length; j++) {
      var lifecycleField = lifecycleFrozen[j]
      if (rules.stableStringify(old.get(lifecycleField)) !== rules.stableStringify(record.get(lifecycleField))) {
        throw new BadRequestError("Certificate lifecycle history is immutable")
      }
    }
    var oldReplacement = old.getString("supersededBy") || ""
    var nextReplacement = record.getString("supersededBy") || ""
    if (oldReplacement !== nextReplacement && !(oldStatus === "superseded" && !oldReplacement && !!nextReplacement)) {
      throw new BadRequestError("Certificate replacement link is immutable")
    }
  }
  e.next()
}, "certificates")

onRecordDelete(function (_e) {
  throw new BadRequestError("Issued certificate records cannot be deleted")
}, "certificates")
