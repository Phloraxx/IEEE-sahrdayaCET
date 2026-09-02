/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  function active(prefix) {
    return prefix + ".user ?= @request.auth.id && " + prefix + ".active ?= true && " +
      "(" + prefix + ".startsAt ?= '' || " + prefix + ".startsAt ?<= @now) && " +
      "(" + prefix + ".endsAt ?= '' || " + prefix + ".endsAt ?>= @now)"
  }
  function roles(prefix, values) {
    return "(" + values.map(function (value) { return prefix + '.roleCode ?= "' + value + '"' }).join(" || ") + ")"
  }
  var branchRoles = ["branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary", "branch_content", "branch_webmaster"]
  var societyRoles = ["society_chair", "society_vice_chair", "society_secretary", "society_content"]
  var eventRoles = ["event_lead", "event_content"]

  function branch(alias) {
    var p = "@collection.organization_assignments:" + alias
    return "(" + active(p) + " && " + p + '.scopeType ?= "branch" && ' + roles(p, branchRoles) + ")"
  }
  function society(alias, field) {
    var p = "@collection.organization_assignments:" + alias
    return "(" + active(p) + " && " + p + '.scopeType ?= "society" && ' + p + ".society ?= " + field + " && " + roles(p, societyRoles) + ")"
  }
  function event(alias, field) {
    var p = "@collection.organization_assignments:" + alias
    return "(" + active(p) + " && " + p + '.scopeType ?= "event" && ' + p + ".event ?= " + field + " && " + roles(p, eventRoles) + ")"
  }

  var blogs = app.findCollectionByNameOrId("blogs")
  var scopedRead = branch("blog_read_branch") + " || " + society("blog_read_society", "society") + " || " + event("blog_read_event", "event")
  blogs.listRule = '(published = true || @request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id) || ' + scopedRead + ')'
  blogs.viewRule = blogs.listRule
  var scopedCreate = branch("blog_create_branch") + " || " + society("blog_create_society", "@request.body.society") + " || " + event("blog_create_event", "@request.body.event")
  blogs.createRule = '(@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation = @request.auth.id) || ((' + scopedCreate + ') && @request.body.relation = @request.auth.id))'
  var scopedUpdate = branch("blog_update_branch") + " || " + society("blog_update_society", "society") + " || " + event("blog_update_event", "event")
  blogs.updateRule = '(@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id && @request.body.relation:changed = false) || (' + scopedUpdate + '))'
  var scopedDelete = branch("blog_delete_branch") + " || " + society("blog_delete_society", "society") + " || " + event("blog_delete_event", "event")
  blogs.deleteRule = '(@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id) || (' + scopedDelete + '))'
  app.save(blogs)
}, (app) => {
  var blogs = app.findCollectionByNameOrId("blogs")
  blogs.listRule = 'published = true || @request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id)'
  blogs.viewRule = blogs.listRule
  blogs.createRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && @request.body.relation = @request.auth.id)'
  blogs.updateRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id && @request.body.relation:changed = false)'
  blogs.deleteRule = '@request.auth.role = "admin" || (@request.auth.role = "content" && relation = @request.auth.id)'
  app.save(blogs)
})
