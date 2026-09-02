/// <reference path="../pb_data/types.d.ts" />

// Scope-aware API rules for Community Roles V2. Server routes still perform
// capability checks; these rules are the data-layer backstop for direct SDK reads.
migrate((app) => {
  function roleExpr(prefix, roles) {
    return "(" + roles.map(function (role) { return prefix + '.roleCode ?= "' + role + '"' }).join(" || ") + ")"
  }
  function activeExpr(prefix) {
    return prefix + ".user ?= @request.auth.id && " +
      prefix + ".active ?= true && " +
      "(" + prefix + ".startsAt ?= '' || " + prefix + ".startsAt ?<= @now) && " +
      "(" + prefix + ".endsAt ?= '' || " + prefix + ".endsAt ?>= @now)"
  }
  function branchAssignment(alias, roles) {
    var prefix = "@collection.organization_assignments:" + alias
    return "(" + activeExpr(prefix) + " && " + prefix + '.scopeType ?= "branch" && ' + roleExpr(prefix, roles) + ")"
  }
  function societyAssignment(alias, roles, currentSocietyExpr) {
    var prefix = "@collection.organization_assignments:" + alias
    return "(" + activeExpr(prefix) + " && " + prefix + '.scopeType ?= "society" && ' +
      prefix + ".society ?= " + currentSocietyExpr + " && " + roleExpr(prefix, roles) + ")"
  }
  function eventAssignment(alias, roles, currentEventExpr) {
    var prefix = "@collection.organization_assignments:" + alias
    return "(" + activeExpr(prefix) + " && " + prefix + '.scopeType ?= "event" && ' +
      prefix + ".event ?= " + currentEventExpr + " && " + roleExpr(prefix, roles) + ")"
  }

  var branchEventView = [
    "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
    "branch_treasurer", "branch_counselor", "branch_faculty_coordinator", "branch_content", "branch_webmaster"
  ]
  var societyEventView = [
    "society_faculty", "society_chair", "society_vice_chair", "society_secretary",
    "society_treasurer", "society_content", "society_team"
  ]
  var eventView = ["event_lead", "event_registration", "event_checkin", "event_content", "event_finance"]
  var branchEventEdit = ["branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary"]
  var societyEventEdit = ["society_faculty", "society_chair", "society_vice_chair", "society_secretary"]
  var eventEdit = ["event_lead"]
  var branchRegistrationView = [
    "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
    "branch_treasurer", "branch_counselor", "branch_faculty_coordinator"
  ]
  var societyRegistrationView = [
    "society_faculty", "society_chair", "society_vice_chair", "society_secretary", "society_treasurer"
  ]
  var eventRegistrationView = ["event_lead", "event_registration", "event_finance"]
  var branchFinanceView = [
    "branch_chair", "branch_vice_chair", "branch_secretary", "branch_treasurer",
    "branch_counselor", "branch_faculty_coordinator"
  ]
  var societyFinanceView = ["society_faculty", "society_chair", "society_vice_chair", "society_treasurer"]
  var eventFinanceView = ["event_lead", "event_finance"]
  var branchReportView = [
    "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
    "branch_treasurer", "branch_counselor", "branch_faculty_coordinator", "branch_webmaster"
  ]
  var societyReportView = ["society_faculty", "society_chair", "society_vice_chair", "society_secretary", "society_treasurer"]
  var eventReportView = ["event_lead"]

  var societies = app.findCollectionByNameOrId("societies")
  societies.listRule = '(isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id || ' +
    branchAssignment("soc_view_branch", branchEventView) + " || " +
    societyAssignment("soc_view_society", societyEventView, "id") + ")"
  societies.viewRule = societies.listRule
  societies.updateRule = '(@request.auth.role = "admin" || (chairs.id ?= @request.auth.id && @request.body.chairs:changed = false) || ' +
    branchAssignment("soc_edit_branch", ["branch_chair", "branch_vice_chair"]) + " || " +
    societyAssignment("soc_edit_society", ["society_faculty", "society_chair"], "id") + ")"
  app.save(societies)

  var events = app.findCollectionByNameOrId("events")
  var eventScopedView = branchAssignment("event_view_branch", branchEventView) + " || " +
    societyAssignment("event_view_society", societyEventView, "society") + " || " +
    eventAssignment("event_view_event", eventView, "id")
  events.listRule = '((isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || ' +
    '(@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id) || ' + eventScopedView + ")"
  events.viewRule = events.listRule
  var createScoped = branchAssignment("event_create_branch", branchEventEdit) + " || " +
    societyAssignment("event_create_society", societyEventEdit, "@request.body.society")
  events.createRule = '(@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id) || ' + createScoped + ")"
  var updateScoped = branchAssignment("event_edit_branch", branchEventEdit) + " || " +
    societyAssignment("event_edit_society", societyEventEdit, "society") + " || " +
    eventAssignment("event_edit_event", eventEdit, "id")
  events.updateRule = '(@request.auth.role = "admin" || ' +
    '(@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && (@request.body.isDeleted:changed = false || @request.body.isDeleted = true)) || ' +
    '((' + updateScoped + ') && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && @request.body.society:changed = false))'
  app.save(events)

  var registrations = app.findCollectionByNameOrId("registrations")
  var registrationScopedView = branchAssignment("reg_view_branch", branchRegistrationView) + " || " +
    societyAssignment("reg_view_society", societyRegistrationView, "event.society") + " || " +
    eventAssignment("reg_view_event", eventRegistrationView, "event")
  registrations.listRule = '(user = @request.auth.id || @request.auth.role = "admin" || ' +
    '(@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id) || ' + registrationScopedView + ")"
  registrations.viewRule = registrations.listRule
  // Writes remain command-route based for new assignments. Preserve legacy chair/admin behavior only.
  app.save(registrations)

  var payments = app.findCollectionByNameOrId("payments")
  var paymentScopedView = branchAssignment("pay_view_branch", branchFinanceView) + " || " +
    societyAssignment("pay_view_society", societyFinanceView, "event.society") + " || " +
    eventAssignment("pay_view_event", eventFinanceView, "event")
  payments.listRule = '(@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id) || ' + paymentScopedView + ")"
  payments.viewRule = payments.listRule
  app.save(payments)

  var coupons = app.findCollectionByNameOrId("coupons")
  var couponScopedView = branchAssignment("coupon_view_branch", branchEventEdit) + " || " +
    societyAssignment("coupon_view_society", societyEventEdit, "event.society") + " || " +
    eventAssignment("coupon_view_event", ["event_lead"], "event")
  coupons.listRule = '(@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id) || ' + couponScopedView + ")"
  coupons.viewRule = coupons.listRule
  app.save(coupons)

  var audit = app.findCollectionByNameOrId("admin_audit_log")
  var auditScopedView = branchAssignment("audit_view_branch", branchReportView) + " || " +
    societyAssignment("audit_view_society", societyReportView, "event.society") + " || " +
    eventAssignment("audit_view_event", eventReportView, "event")
  audit.listRule = '(@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id) || ' + auditScopedView + ")"
  audit.viewRule = audit.listRule
  app.save(audit)

  var notifications = app.findCollectionByNameOrId("notification_outbox")
  var notifyScopedView = branchAssignment("notify_view_branch", branchRegistrationView) + " || " +
    societyAssignment("notify_view_society", societyRegistrationView, "registration.event.society") + " || " +
    eventAssignment("notify_view_event", ["event_lead", "event_registration"], "registration.event")
  notifications.listRule = '(@request.auth.role = "admin" || (@request.auth.role = "chair" && registration.event.society.chairs.id ?= @request.auth.id) || ' + notifyScopedView + ")"
  notifications.viewRule = notifications.listRule
  app.save(notifications)

  // Execom role linkage can mint scoped assignments, so direct writes remain
  // platform-admin only. Branch officers manage access through the explicit
  // assignment command routes instead of indirectly escalating via directory edits.
  var execom = app.findCollectionByNameOrId("execom")
  execom.createRule = '@request.auth.role = "admin"'
  execom.updateRule = '@request.auth.role = "admin"'
  execom.deleteRule = '@request.auth.role = "admin"'
  app.save(execom)
}, (app) => {
  // Restore the pre-V2 rules. New collections/fields remain additive.
  var societies = app.findCollectionByNameOrId("societies")
  societies.listRule = 'isHidden = false || @request.auth.role = "admin" || chairs.id ?= @request.auth.id'
  societies.viewRule = societies.listRule
  societies.updateRule = '@request.auth.role = "admin" || (chairs.id ?= @request.auth.id && @request.body.chairs:changed = false)'
  app.save(societies)

  var events = app.findCollectionByNameOrId("events")
  events.listRule = '(isDeleted != true && (status = "published" || status = "completed")) || @request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
  events.viewRule = events.listRule
  events.createRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
  events.updateRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id && @request.body.registeredCount:changed = false && @request.body.checkedInCount:changed = false && (@request.body.isDeleted:changed = false || @request.body.isDeleted = true))'
  app.save(events)

  var registrations = app.findCollectionByNameOrId("registrations")
  registrations.listRule = 'user = @request.auth.id || @request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)'
  registrations.viewRule = registrations.listRule
  app.save(registrations)

  var payments = app.findCollectionByNameOrId("payments")
  payments.listRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)'
  payments.viewRule = payments.listRule
  app.save(payments)

  var coupons = app.findCollectionByNameOrId("coupons")
  coupons.listRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && society.chairs.id ?= @request.auth.id)'
  coupons.viewRule = coupons.listRule
  app.save(coupons)

  var audit = app.findCollectionByNameOrId("admin_audit_log")
  audit.listRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id)'
  audit.viewRule = audit.listRule
  app.save(audit)

  var notifications = app.findCollectionByNameOrId("notification_outbox")
  notifications.listRule = '@request.auth.role = "admin" || (@request.auth.role = "chair" && registration.event.society.chairs.id ?= @request.auth.id)'
  notifications.viewRule = notifications.listRule
  app.save(notifications)

  var execom = app.findCollectionByNameOrId("execom")
  execom.createRule = '@request.auth.role = "admin"'
  execom.updateRule = '@request.auth.role = "admin"'
  execom.deleteRule = '@request.auth.role = "admin"'
  app.save(execom)
})
