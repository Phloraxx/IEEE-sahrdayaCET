/// <reference path="../pb_data/types.d.ts" />

// Community Roles V2 foundation. This migration is intentionally additive:
// legacy user.role and societies.chairs remain valid during the transition.
migrate((app) => {
  var users = app.findCollectionByNameOrId("users")
  var societies = app.findCollectionByNameOrId("societies")
  var events = app.findCollectionByNameOrId("events")
  var execom = app.findCollectionByNameOrId("execom")

  var assignments = null
  try { assignments = app.findCollectionByNameOrId("organization_assignments") } catch (_) {}
  if (!assignments) {
    assignments = new Collection({
      type: "base",
      name: "organization_assignments",
      listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { type: "select", name: "roleCode", values: [
          "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
          "branch_treasurer", "branch_counselor", "branch_faculty_coordinator", "branch_content",
          "branch_webmaster", "society_faculty", "society_chair", "society_vice_chair",
          "society_secretary", "society_treasurer", "society_content", "society_team",
          "event_lead", "event_registration", "event_checkin", "event_content", "event_finance"
        ], maxSelect: 1, required: true },
        { type: "text", name: "title", max: 180 },
        { type: "select", name: "scopeType", values: ["branch", "society", "event"], maxSelect: 1, required: true },
        { type: "relation", name: "society", collectionId: societies.id, maxSelect: 1, cascadeDelete: true },
        { type: "relation", name: "event", collectionId: events.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "term", max: 80 },
        { type: "date", name: "startsAt" },
        { type: "date", name: "endsAt" },
        { type: "bool", name: "active" },
        { type: "select", name: "source", values: ["manual", "execom", "legacy"], maxSelect: 1 },
        { type: "relation", name: "createdBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "text", name: "notes", max: 2000 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_org_assignments_user_active ON organization_assignments (user, active)',
        'CREATE INDEX idx_org_assignments_society_active ON organization_assignments (society, active)',
        'CREATE INDEX idx_org_assignments_event_active ON organization_assignments (event, active)',
        'CREATE INDEX idx_org_assignments_role_scope ON organization_assignments (roleCode, scopeType)'
      ],
    })
    app.save(assignments)
  }

  var profiles = null
  try { profiles = app.findCollectionByNameOrId("community_profiles") } catch (_) {}
  if (!profiles) {
    profiles = new Collection({
      type: "base",
      name: "community_profiles",
      listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
        { type: "select", name: "accountType", values: ["student", "faculty", "alumni", "external"], maxSelect: 1 },
        { type: "text", name: "srNumber", max: 80 },
        { type: "text", name: "department", max: 120 },
        { type: "text", name: "semester", max: 40 },
        { type: "text", name: "graduationYear", max: 20 },
        { type: "text", name: "ieeeMemberId", max: 80 },
        { type: "bool", name: "ieeeMember" },
        { type: "bool", name: "institutionalVerified" },
        { type: "date", name: "verifiedAt" },
        { type: "relation", name: "verifiedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_community_profiles_user ON community_profiles (user)',
        'CREATE INDEX idx_community_profiles_sr ON community_profiles (srNumber)'
      ],
    })
    app.save(profiles)
  }

  if (!execom.fields.getByName("user")) {
    execom.fields.add(new RelationField({ name: "user", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  }
  if (!execom.fields.getByName("term")) execom.fields.add(new TextField({ name: "term", max: 80 }))
  if (!execom.fields.getByName("roleCode")) {
    execom.fields.add(new SelectField({
      name: "roleCode",
      values: [
        "branch_chair", "branch_vice_chair", "branch_secretary", "branch_joint_secretary",
        "branch_treasurer", "branch_counselor", "branch_faculty_coordinator", "branch_content",
        "branch_webmaster", "society_faculty", "society_chair", "society_vice_chair",
        "society_secretary", "society_treasurer", "society_content", "society_team"
      ],
      maxSelect: 1,
    }))
  }
  if (!execom.fields.getByName("activeFrom")) execom.fields.add(new DateField({ name: "activeFrom" }))
  if (!execom.fields.getByName("activeUntil")) execom.fields.add(new DateField({ name: "activeUntil" }))
  if (!execom.fields.getByName("assignment")) {
    execom.fields.add(new RelationField({ name: "assignment", collectionId: assignments.id, maxSelect: 1, cascadeDelete: false }))
  }
  app.save(execom)

  function addEventField(name, field) {
    if (!events.fields.getByName(name)) events.fields.add(field)
  }
  addEventField("approvalStatus", new SelectField({ name: "approvalStatus", values: ["draft", "submitted", "changes_requested", "approved"], maxSelect: 1 }))
  addEventField("approvalNote", new TextField({ name: "approvalNote", max: 4000 }))
  addEventField("submittedBy", new RelationField({ name: "submittedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  addEventField("submittedAt", new DateField({ name: "submittedAt" }))
  addEventField("approvedBy", new RelationField({ name: "approvedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  addEventField("approvedAt", new DateField({ name: "approvedAt" }))
  addEventField("approvalRevision", new NumberField({ name: "approvalRevision", min: 0 }))
  addEventField("financeApprovalStatus", new SelectField({ name: "financeApprovalStatus", values: ["not_required", "pending", "changes_requested", "approved"], maxSelect: 1 }))
  addEventField("financeApprovalNote", new TextField({ name: "financeApprovalNote", max: 4000 }))
  addEventField("financeApprovedBy", new RelationField({ name: "financeApprovedBy", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  addEventField("financeApprovedAt", new DateField({ name: "financeApprovedAt" }))
  app.save(events)

  // Preserve all existing published/completed events as already approved.
  var eventRows = app.findRecordsByFilter("events", "1 = 1", "", 0, 0)
  for (var ei = 0; ei < eventRows.length; ei++) {
    var event = eventRows[ei]
    var status = event.getString("status") || "draft"
    var price = event.getFloat("price") || 0
    if (!event.getString("approvalStatus")) {
      event.set("approvalStatus", status === "published" || status === "completed" ? "approved" : "draft")
    }
    if (!event.getString("financeApprovalStatus")) {
      event.set("financeApprovalStatus", price > 0
        ? (status === "published" || status === "completed" ? "approved" : "pending")
        : "not_required")
    }
    app.saveNoValidate(event)
  }

  // Existing societies.chairs is already an authorization source. Mirror it
  // into assignments so the new model starts with equivalent access.
  var societyRows = app.findRecordsByFilter("societies", "1 = 1", "", 0, 0)
  for (var si = 0; si < societyRows.length; si++) {
    var society = societyRows[si]
    var chairs = society.getStringSlice("chairs") || []
    for (var ci = 0; ci < chairs.length; ci++) {
      var existing = null
      try {
        existing = app.findFirstRecordByFilter(
          "organization_assignments",
          "user = {:user} && roleCode = 'society_chair' && scopeType = 'society' && society = {:society} && active = true",
          { user: chairs[ci], society: society.id }
        )
      } catch (_) {}
      if (existing) continue
      var assignment = new Record(assignments, {
        user: chairs[ci], roleCode: "society_chair", title: "Society Chair",
        scopeType: "society", society: society.id, event: "", term: "legacy",
        active: true, source: "legacy", notes: "Backfilled from societies.chairs during Community Roles V2 migration"
      })
      app.saveNoValidate(assignment)
    }
  }

  // Link Execom directory records to an existing account only when the email
  // matches exactly. This never grants permissions by itself.
  var execomRows = app.findRecordsByFilter("execom", "1 = 1", "", 0, 0)
  for (var xi = 0; xi < execomRows.length; xi++) {
    var member = execomRows[xi]
    if (member.getString("user")) continue
    var email = String(member.getString("email") || "").trim().toLowerCase()
    if (!email) continue
    var matched = null
    try { matched = app.findFirstRecordByFilter("users", "email = {:email}", { email: email }) } catch (_) {}
    if (!matched) continue
    member.set("user", matched.id)
    app.saveNoValidate(member)
  }
}, (app) => {
  // Rollback is conservative: do not remove the additive collections because
  // they may contain assignments created after deployment. Only remove fields
  // when there are no assignment records.
  var assignmentRows = []
  try { assignmentRows = app.findRecordsByFilter("organization_assignments", "1 = 1", "", 1, 0) } catch (_) {}
  if (assignmentRows.length) return

  var events = app.findCollectionByNameOrId("events")
  var eventFields = [
    "financeApprovedAt", "financeApprovedBy", "financeApprovalNote", "financeApprovalStatus",
    "approvalRevision", "approvedAt", "approvedBy", "submittedAt", "submittedBy",
    "approvalNote", "approvalStatus"
  ]
  for (var i = 0; i < eventFields.length; i++) {
    var ef = events.fields.getByName(eventFields[i])
    if (ef) events.fields.removeById(ef.id)
  }
  app.save(events)

  var execom = app.findCollectionByNameOrId("execom")
  var execomFields = ["assignment", "activeUntil", "activeFrom", "roleCode", "term", "user"]
  for (var j = 0; j < execomFields.length; j++) {
    var xf = execom.fields.getByName(execomFields[j])
    if (xf) execom.fields.removeById(xf.id)
  }
  app.save(execom)

  try { app.delete(app.findCollectionByNameOrId("community_profiles")) } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("organization_assignments")) } catch (_) {}
})
