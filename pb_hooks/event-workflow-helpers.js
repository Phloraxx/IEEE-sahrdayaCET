function workflowFields() {
  return [
    "approvalStatus", "approvalNote", "submittedBy", "submittedAt", "approvedBy", "approvedAt",
    "approvalRevision", "financeApprovalStatus", "financeApprovalNote", "financeApprovedBy", "financeApprovedAt"
  ]
}

function sensitiveFields() {
  return [
    "date", "endDate", "venue", "price", "paymentProvider", "maxCapacity",
    "registrationMode", "registrationStart", "registrationDeadline"
  ]
}

function fieldChanged(next, previous, name) {
  if (!next || !previous) return false
  if (name === "price") return Number(next.getFloat(name) || 0) !== Number(previous.getFloat(name) || 0)
  if (name === "maxCapacity") return Number(next.getInt(name) || 0) !== Number(previous.getInt(name) || 0)
  return String(next.getString(name) || "") !== String(previous.getString(name) || "")
}

function anyChanged(next, previous, names) {
  for (var i = 0; i < names.length; i++) if (fieldChanged(next, previous, names[i])) return true
  return false
}
function resetApprovals(record) {
  record.set("approvalStatus", "draft")
  record.set("approvalNote", "")
  record.set("submittedBy", "")
  record.set("submittedAt", "")
  record.set("approvedBy", "")
  record.set("approvedAt", "")
  record.set("approvalRevision", (record.getInt("approvalRevision") || 0) + 1)
  if ((record.getFloat("price") || 0) > 0) record.set("financeApprovalStatus", "pending")
  else record.set("financeApprovalStatus", "not_required")
  record.set("financeApprovalNote", "")
  record.set("financeApprovedBy", "")
  record.set("financeApprovedAt", "")
}

module.exports = {
  workflowFields: workflowFields,
  sensitiveFields: sensitiveFields,
  fieldChanged: fieldChanged,
  anyChanged: anyChanged,
  resetApprovals: resetApprovals
}
