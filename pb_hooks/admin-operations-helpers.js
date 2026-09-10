/// <reference path="../pb_data/types.d.ts" />

function jsonObject(value) {
  return require(__hooks + "/registration-helpers.js").registrationJsonObject(value)
}

function role(auth) {
  return require(__hooks + "/workspace-authorization.js").authRole(auth)
}

function mayManageEvent(app, auth, event) {
  var authz = require(__hooks + "/workspace-authorization.js")
  return authz.hasEventCapability(app, auth, "events.edit", event) ||
    authz.hasEventCapability(app, auth, "registrations.manage", event)
}
function mayViewEventOperations(app, auth, event) {
  var authz = require(__hooks + "/workspace-authorization.js")
  return authz.hasEventCapability(app, auth, "registrations.view", event) ||
    authz.hasEventCapability(app, auth, "events.edit", event) ||
    authz.hasEventCapability(app, auth, "finance.view", event)
}
function requireManageEvent(app, auth, event) {
  if (!mayManageEvent(app, auth, event)) throw new Error("FORBIDDEN_EVENT")
}
function eventPermissions(app, auth, event) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var capabilities = [
    "events.view", "events.edit", "events.publish", "events.cancel", "events.archive", "events.complete",
    "registrations.view", "registrations.manage", "registrations.manual", "checkin.manage",
    "finance.view", "finance.manage", "assignments.manage", "content.manage", "reports.view",
    "certificates.view", "certificates.manage_templates", "certificates.issue", "certificates.send", "certificates.revoke"
  ]
  var result = {}
  for (var i = 0; i < capabilities.length; i++) {
    result[capabilities[i]] = authz.hasEventCapability(app, auth, capabilities[i], event)
  }
  return result
}

function providerKind(registration) {
  var data = jsonObject(registration.get("paymentData"))
  if (data.manualConfirmation || data.provider === "manual") return "manual"
  if (data.provider === "razorpay" || data.provider === "razorpay_live") return "razorpay"
  if (data.provider === "paygate") return "paygate"
  if (data.provider === "legacy_paygate") return "legacy_paygate"
  if (registration.getString("paymentStatus") === "not_required") return "not_required"
  return "unknown"
}

function collectedAmount(registration) {
  var data = jsonObject(registration.get("paymentData"))
  var paise = Number(data.payableAmountPaise)
  if (isFinite(paise) && paise >= 0 && Math.floor(paise) === paise) return paise / 100
  var exact = Number(data.payableAmount)
  if (isFinite(exact) && exact >= 0) return exact
  return require(__hooks + "/registration-helpers.js").registrationAmount(registration)
}

function refundedAmount(registration) {
  var data = jsonObject(registration.get("paymentData"))
  var paise = Number(data.amountRefundedPaise)
  if (isFinite(paise) && paise >= 0 && Math.floor(paise) === paise) return paise / 100
  if (registration.getString("paymentStatus") === "refunded") return collectedAmount(registration)
  return 0
}

function registrationSnapshot(registration) {
  if (!registration) return null
  var data = jsonObject(registration.get("paymentData"))
  return {
    id: registration.id,
    event: registration.getString("event") || "",
    user: registration.getString("user") || "",
    userName: registration.getString("userName") || "",
    userEmail: registration.getString("userEmail") || "",
    userPhone: registration.getString("userPhone") || "",
    registrationStatus: registration.getString("registrationStatus") || "",
    paymentStatus: registration.getString("paymentStatus") || "",
    amount: require(__hooks + "/registration-helpers.js").registrationAmount(registration),
    collectedAmount: collectedAmount(registration),
    refundedAmount: refundedAmount(registration),
    paymentMethod: String(data.paymentMethod || ""),
    couponCode: registration.getString("couponCode") || "",
    discountAmount: require(__hooks + "/registration-helpers.js").registrationDiscountAmount(registration),
    ticketId: registration.getString("ticketId") || "",
    checkedIn: registration.getBool("checkedIn"),
    checkedInAt: registration.getString("checkedInAt") || "",
    registrationDate: registration.getString("registrationDate") || "",
    registrationSource: registration.getString("registrationSource") || "self_service",
    internalNotes: registration.getString("internalNotes") || "",
    provider: providerKind(registration),
    providerStatus: String(data.providerStatus || ""),
    manualReview: data.manualReview === true,
    reviewReason: String(data.reviewReason || ""),
    manualConfirmation: data.manualConfirmation || null,
  }
}
function copySnapshotFields(snapshot, fields) {
  var projected = {}
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i]
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) projected[field] = snapshot[field]
  }
  return projected
}

function projectRegistrationSnapshot(snapshot, flags) {
  if (!snapshot) return null
  flags = flags || {}
  if (flags.finance) return snapshot
  return copySnapshotFields(snapshot, [
    "id", "event", "user", "userName", "userEmail", "userPhone",
    "registrationStatus", "ticketId", "checkedIn", "checkedInAt",
    "registrationDate", "registrationSource",
  ])
}
function registrationAdminProjection(registration, event, finance) {
  if (!registration || !event) return null
  var snapshot = registrationSnapshot(registration)
  var responses = jsonObject(registration.get("formResponses"))
  var academic = require(__hooks + "/academic-options.js")
  var programmeCode = academic.normalizeProgramme(registration.getString("programmeCode") || "") ||
    academic.normalizeProgramme(responses.programmeCode || responses.branch || responses.department || "")
  var programme = ""
  if (programmeCode && programmeCode !== "OTHER") {
    programme = academic.programmeLabel(programmeCode)
  } else {
    programme = String(responses.branch || responses.department || responses.programme ||
      (programmeCode === "OTHER" ? "Other / external programme" : ""))
  }
  var canonicalSemester = registration.getString("semester") || ""
  var normalizedSemester = academic.normalizeSemester(canonicalSemester) ||
    academic.normalizeSemester(responses.semester || "")
  var semester = normalizedSemester || canonicalSemester || String(responses.semester || "")
  var registrationDate = registration.getString("registrationDate") || ""
  var createdAt = registrationDate
  var row = {
    id: registration.id,
    event: event.id || "",
    eventTitle: event.getString("title") || "",
    eventId: event.id || "",
    eventSocietyId: event.getString("society") || "",
    user: registration.getString("user") || "",
    userName: registration.getString("userName") || "",
    userEmail: registration.getString("userEmail") || "",
    userPhone: registration.getString("userPhone") || "",
    registrationStatus: snapshot.registrationStatus,
    checkedIn: snapshot.checkedIn,
    checkedInAt: snapshot.checkedInAt,
    ticketId: snapshot.ticketId,
    registrationDate: registrationDate || createdAt,
    createdAt: createdAt,
    registrationSource: snapshot.registrationSource,
    programmeCode: programmeCode,
    programme: programme,
    semester: semester,
    studyYear: academic.yearForSemester(normalizedSemester),
    ieeeMember: registration.getBool("ieeeMember") || responses.isIeeeMember === true,
    ieeeMemberId: registration.getString("ieeeMemberId") || String(responses.ieeeMembershipId || ""),
    formResponses: responses,
  }
  if (!finance) return row
  var discountSource = registration.getString("discountSource") || ""
  if (discountSource !== "ieee_member" && discountSource !== "coupon") {
    discountSource = snapshot.couponCode && snapshot.discountAmount > 0 ? "coupon" : "none"
  }
  row.paymentStatus = snapshot.paymentStatus
  row.amount = snapshot.amount
  row.collectedAmount = snapshot.collectedAmount
  row.refundedAmount = snapshot.refundedAmount
  row.paymentMethod = snapshot.paymentMethod
  row.couponCode = snapshot.couponCode
  row.discountSource = discountSource
  row.discountAmount = snapshot.discountAmount
  row.paymentData = jsonObject(registration.get("paymentData"))
  row.paymentTicketId = registration.getString("paymentTicketId") || ""
  row.provider = snapshot.provider
  row.providerStatus = snapshot.providerStatus
  row.manualReview = snapshot.manualReview ||
    (snapshot.registrationStatus === "cancelled" && snapshot.paymentStatus === "paid")
  row.reviewReason = snapshot.reviewReason
  row.manualConfirmation = snapshot.manualConfirmation
  row.internalNotes = snapshot.internalNotes
  row.createdBy = registration.getString("createdBy") || ""
  return row
}

function operationProjection(permissions) {
  permissions = permissions || {}
  return {
    finance: permissions["finance.view"] === true || permissions["finance.manage"] === true,
    reports: permissions["reports.view"] === true,
    edit: permissions["events.edit"] === true,
    registrations: permissions["registrations.view"] === true ||
      permissions["registrations.manage"] === true ||
      permissions["registrations.manual"] === true,
    attendance: permissions["events.edit"] === true || permissions["checkin.manage"] === true,
    audience: permissions["events.edit"] === true || permissions["registrations.manual"] === true,
    workflow: permissions["events.edit"] === true ||
      permissions["events.publish"] === true || permissions["events.cancel"] === true ||
      permissions["events.archive"] === true || permissions["events.complete"] === true,
  }
}

function projectEventPayload(payload, flags) {
  flags = flags || {}
  if (flags.finance && flags.edit) return payload
  var projected = copySnapshotFields(payload, [
    "id", "title", "slug", "date", "endDate", "venue", "status", "price",
    "registrationOpen", "registrationMode", "checkInEnabled", "isArchived", "maxCapacity",
    "registeredCount", "checkedInCount", "society",
  ])
  if (flags.audience) {
    projected.collectIeeeMember = payload.collectIeeeMember
    projected.eligibleSemesters = payload.eligibleSemesters
    projected.eligibleProgrammes = payload.eligibleProgrammes
  }
  if (flags.edit) projected.formTemplate = payload.formTemplate
  return projected
}

function audit(app, input) {
  var collection
  try { collection = app.findCollectionByNameOrId("admin_audit_log") } catch (_) { return }
  var entityType = String(input.entityType || (input.registrationId ? "registration" : (input.eventId ? "event" : ""))).slice(0, 80)
  var entityId = String(input.entityId || input.registrationId || input.eventId || "").slice(0, 80)
  var payload = {
    event: input.eventId || "",
    registration: input.registrationId || "",
    actor: input.actorId || "",
    action: String(input.action || "admin_action").slice(0, 160),
    note: String(input.note || "").slice(0, 4000),
    before: input.before || null,
    after: input.after || null,
  }
  if (collection.fields.getByName("entityType")) payload.entityType = entityType
  if (collection.fields.getByName("entityId")) payload.entityId = entityId
  if (collection.fields.getByName("outcome")) payload.outcome = input.outcome === "failure" ? "failure" : "success"
  if (collection.fields.getByName("requestId")) payload.requestId = String(input.requestId || "").slice(0, 120)
  var record = new Record(collection, payload)
  app.saveNoValidate(record)
}

function eventPayload(event) {
  var audience = require(__hooks + "/event-audience-helpers.js").eventAudience(event)
  var formTemplate = event.get("formTemplate")
  if (typeof formTemplate === "string") {
    try { formTemplate = JSON.parse(formTemplate) } catch (_) { formTemplate = [] }
  }
  if (!Array.isArray(formTemplate)) formTemplate = []
  return {
    id: event.id,
    title: event.getString("title") || "",
    slug: event.getString("slug") || "",
    date: event.getString("date") || "",
    endDate: event.getString("endDate") || "",
    venue: event.getString("venue") || "",
    status: event.getString("status") || "",
    price: require(__hooks + "/registration-helpers.js").eventPrice(event),
    registrationOpen: event.getBool("registrationOpen"),
    registrationMode: event.getString("registrationMode") || "",
    collectIeeeMember: event.getBool("collectIeeeMember"),
    eligibleSemesters: audience.semesters,
    eligibleProgrammes: audience.programmes,
    formTemplate: formTemplate,
    checkInEnabled: event.getBool("checkInEnabled"),
    isArchived: event.getBool("isDeleted"),
    maxCapacity: event.getInt("maxCapacity") || 0,
    registeredCount: event.getInt("registeredCount") || 0,
    checkedInCount: event.getInt("checkedInCount") || 0,
    society: event.getString("society") || "",
  }
}

function emptyRegistrationSummary() {
  return {
    totalRecords: 0,
    active: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    checkedIn: 0,
    paidCount: 0,
    paidAmount: 0,
    confirmedPaidAmount: 0,
    pendingPaymentCount: 0,
    pendingPaymentAmount: 0,
    failedCount: 0,
    notRequiredCount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    manualPaidCount: 0,
    manualPaidAmount: 0,
    providerPaidCount: 0,
    providerPaidAmount: 0,
    cancelledPaidCount: 0,
    cancelledPaidAmount: 0,
    reviewCount: 0,
    discountAmount: 0,
    adminCreatedCount: 0,
    selfServiceCount: 0,
    providers: {},
  }
}

function addRegistrationsToSummary(summary, records) {
  summary.totalRecords += records.length
  for (var i = 0; i < records.length; i++) {
    var reg = records[i]
    var registrationStatus = reg.getString("registrationStatus") || ""
    var paymentStatus = reg.getString("paymentStatus") || ""
    var amount = require(__hooks + "/registration-helpers.js").registrationAmount(reg)
    var collected = collectedAmount(reg)
    var refunded = refundedAmount(reg)
    var source = reg.getString("registrationSource") || "self_service"
    var data = jsonObject(reg.get("paymentData"))
    var kind = providerKind(reg)

    if (registrationStatus !== "cancelled") summary.active++
    if (registrationStatus === "confirmed") summary.confirmed++
    if (registrationStatus === "pending") summary.pending++
    if (registrationStatus === "cancelled") summary.cancelled++
    if (reg.getBool("checkedIn")) summary.checkedIn++
    if (source === "admin") summary.adminCreatedCount++
    else summary.selfServiceCount++

    summary.discountAmount += require(__hooks + "/registration-helpers.js").registrationDiscountAmount(reg)
    if (paymentStatus === "paid") {
      summary.paidCount++
      summary.paidAmount += collected
      if (registrationStatus === "confirmed") summary.confirmedPaidAmount += collected
      if (registrationStatus === "cancelled") {
        summary.cancelledPaidCount++
        summary.cancelledPaidAmount += collected
      }
      if (kind === "manual") {
        summary.manualPaidCount++
        summary.manualPaidAmount += collected
      } else {
        summary.providerPaidCount++
        summary.providerPaidAmount += collected
      }
    } else if (paymentStatus === "pending") {
      summary.pendingPaymentCount++
      summary.pendingPaymentAmount += amount
    } else if (paymentStatus === "failed") {
      summary.failedCount++
    } else if (paymentStatus === "not_required") {
      summary.notRequiredCount++
    } else if (paymentStatus === "refunded") {
      summary.refundedCount++
      summary.refundedAmount += refunded
    }

    if (data.manualReview === true ||
        (registrationStatus === "cancelled" && paymentStatus === "paid")) {
      summary.reviewCount++
    }

    if (!summary.providers[kind]) {
      summary.providers[kind] = { count: 0, paidCount: 0, amount: 0 }
    }
    summary.providers[kind].count++
    if (paymentStatus === "paid") {
      summary.providers[kind].paidCount++
      summary.providers[kind].amount += collected
    }
  }
  return summary
}

function summarizeRegistrations(records) {
  return addRegistrationsToSummary(emptyRegistrationSummary(), records)
}

function projectRegistrationSummary(summary, flags) {
  flags = flags || {}
  if (flags.finance) return summary
  return copySnapshotFields(summary, [
    "totalRecords", "active", "confirmed", "pending", "cancelled",
    "checkedIn", "adminCreatedCount", "selfServiceCount",
  ])
}

module.exports = {
  jsonObject: jsonObject,
  role: role,
  mayManageEvent: mayManageEvent,
  mayViewEventOperations: mayViewEventOperations,
  eventPermissions: eventPermissions,
  operationProjection: operationProjection,
  requireManageEvent: requireManageEvent,
  providerKind: providerKind,
  collectedAmount: collectedAmount,
  refundedAmount: refundedAmount,
  registrationSnapshot: registrationSnapshot,
  projectRegistrationSnapshot: projectRegistrationSnapshot,
  audit: audit,
  eventPayload: eventPayload,
  projectEventPayload: projectEventPayload,
  emptyRegistrationSummary: emptyRegistrationSummary,
  projectRegistrationSummary: projectRegistrationSummary,
  addRegistrationsToSummary: addRegistrationsToSummary,
  summarizeRegistrations: summarizeRegistrations,
  registrationAdminProjection: registrationAdminProjection,
}
