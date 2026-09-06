/// <reference path="../pb_data/types.d.ts" />

// Raw registration records mix attendee identity, event answers and financial state.
// All browser/workspace reads must use the capability-projected application routes.
migrate((app) => {
  var registrations = app.findCollectionByNameOrId("registrations")
  // Browser/workspace reads must go through projected routes. The raw record
  // contains payment provider metadata, internal notes and audit-sensitive data.
  registrations.listRule = null
  registrations.viewRule = null
  app.save(registrations)
}, (app) => {
  function roleExpr(prefix, roles) {
    return "(" + roles.map(function (role) {
      return prefix + '.roleCode ?= "' + role + '"'
    }).join(" || ") + ")"
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
  function societyAssignment(alias, roles) {
    var prefix = "@collection.organization_assignments:" + alias
    return "(" + activeExpr(prefix) + " && " + prefix + '.scopeType ?= "society" && ' +
      prefix + ".society ?= event.society && " + roleExpr(prefix, roles) + ")"
  }
  function eventAssignment(alias, roles) {
    var prefix = "@collection.organization_assignments:" + alias
    return "(" + activeExpr(prefix) + " && " + prefix + '.scopeType ?= "event" && ' +
      prefix + ".event ?= event && " + roleExpr(prefix, roles) + ")"
  }

  var branchRegistration = [
    "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
    "branch_treasurer", "branch_counselor", "branch_faculty_coordinator"
  ]
  var societyRegistration = [
    "society_faculty", "society_chair", "society_vice_chair", "society_secretary", "society_treasurer"
  ]
  var eventRegistration = ["event_lead", "event_registration", "event_finance"]
  var registrationScoped = branchAssignment("reg_view_branch", branchRegistration) + " || " +
    societyAssignment("reg_view_society", societyRegistration) + " || " +
    eventAssignment("reg_view_event", eventRegistration)

  var registrations = app.findCollectionByNameOrId("registrations")
  registrations.listRule = '(user = @request.auth.id || @request.auth.role = "admin" || ' +
    '(@request.auth.role = "chair" && event.society.chairs.id ?= @request.auth.id) || ' + registrationScoped + ")"
  registrations.viewRule = registrations.listRule
  app.save(registrations)
})
