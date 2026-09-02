/// <reference path="../pb_data/types.d.ts" />

onRecordCreate(function (e) {
  var record = e.record
  if ((record.getString("status") || "draft") !== "draft") {
    throw new BadRequestError("New certificate templates must start as drafts")
  }
  if ((record.getFloat("version") || 0) < 1) throw new BadRequestError("Certificate template version is invalid")
  e.next()
}, "certificate_templates")

onRecordUpdate(function (e) {
  var rules = require(__hooks + "/certificate-template-rules.js")
  var record = e.record
  var old = record.original()
  var oldStatus = old.getString("status") || "draft"
  var nextStatus = record.getString("status") || "draft"

  if ((old.getFloat("version") || 0) !== (record.getFloat("version") || 0)) {
    throw new BadRequestError("Certificate template versions are immutable")
  }

  if (oldStatus === "draft" && nextStatus === "published") {
    var errors = rules.publicationErrors(rules.recordSnapshot(record))
    if (errors.length) throw new BadRequestError(errors.join(". "))
  } else if (oldStatus === "draft" && nextStatus !== "draft") {
    throw new BadRequestError("Draft templates can only be published")
  }
  if (oldStatus === "published") {
    if (nextStatus !== "published" && nextStatus !== "archived") {
      throw new BadRequestError("Published templates can only be archived")
    }
    var oldPublished = rules.recordSnapshot(old)
    var nextPublished = rules.recordSnapshot(record)
    oldPublished.contentHash = ""
    nextPublished.contentHash = ""
    if (rules.stableStringify(oldPublished) !== rules.stableStringify(nextPublished)) {
      throw new BadRequestError("Published certificate template content is immutable")
    }
  }

  if (oldStatus === "archived") {
    if (nextStatus !== "archived") throw new BadRequestError("Archived certificate templates cannot be reactivated")
    var oldArchived = rules.recordSnapshot(old)
    var nextArchived = rules.recordSnapshot(record)
    if (rules.stableStringify(oldArchived) !== rules.stableStringify(nextArchived)) {
      throw new BadRequestError("Archived certificate template content is immutable")
    }
  }
  e.next()
}, "certificate_templates")

onRecordDelete(function (e) {
  if ((e.record.getString("status") || "draft") !== "draft") {
    throw new BadRequestError("Published or archived certificate templates cannot be deleted")
  }
  e.next()
}, "certificate_templates")
