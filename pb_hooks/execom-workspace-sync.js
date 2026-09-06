/// <reference path="../pb_data/types.d.ts" />

function clean(value) {
  return String(value == null ? "" : value).trim()
}

function roleScopeType(roleCode, scopeType) {
  return require(__hooks + "/workspace-authorization.js").roleScopeType(clean(roleCode), scopeType || "")
}

function execomResolveSocietyId(app, record) {
  var raw = clean(record.getString("society"))
  if (!raw) return ""
  try { return app.findRecordById("societies", raw).id } catch (_) {}
  try { return app.findFirstRecordByFilter("societies", "slug = {:slug}", { slug: raw }).id } catch (_) {}
  return ""
}

function desiredAssignment(app, record) {
  var authz = require(__hooks + "/workspace-authorization.js")
  var userId = clean(record.getString("user"))
  var requestedRoleCode = clean(record.getString("roleCode"))
  var scopeType = clean(record.getString("society")) ? "society" : "branch"
  var roleCode = authz.storageRoleCode(requestedRoleCode, scopeType)
  if (!userId || !roleCode || !authz.validRoleCode(requestedRoleCode, scopeType)) return null
  if (scopeType !== "branch" && scopeType !== "society") return null
  var societyId = scopeType === "society" ? execomResolveSocietyId(app, record) : ""
  if (scopeType === "society" && !societyId) return null

  return {
    sourceExecom: record.id,
    user: userId,
    roleCode: roleCode,
    scopeType: scopeType,
    society: societyId,
    event: "",
    title: clean(record.getString("position")).slice(0, 180),
    term: clean(record.getString("term")).slice(0, 80),
    startsAt: record.getString("activeFrom") || "",
    endsAt: record.getString("activeUntil") || "",
  }
}

function assignmentSecurityMatches(assignment, desired) {
  return !!assignment && !!desired &&
    assignment.getString("source") === "execom" &&
    assignment.getString("sourceExecom") === desired.sourceExecom &&
    assignment.getString("user") === desired.user &&
    assignment.getString("roleCode") === desired.roleCode &&
    assignment.getString("scopeType") === desired.scopeType &&
    assignment.getString("society") === desired.society &&
    assignment.getString("event") === desired.event
}

function assignmentSourceCurrent(app, assignment) {
  if (!assignment || assignment.getString("source") !== "execom") return true
  var sourceId = clean(assignment.getString("sourceExecom"))
  if (!sourceId) return false

  var member = null
  try { member = app.findRecordById("execom", sourceId) } catch (_) { return false }
  if (clean(member.getString("assignment")) !== assignment.id) return false
  if (clean(member.getString("user")) !== clean(assignment.getString("user"))) return false

  var memberScopeType = clean(member.getString("society")) ? "society" : "branch"
  var normalizedRoleCode = require(__hooks + "/workspace-authorization.js").storageRoleCode(member.getString("roleCode"), memberScopeType)
  if (!normalizedRoleCode) return false
  var scopeType = roleScopeType(member.getString("roleCode"), memberScopeType)
  if (scopeType !== "branch" && scopeType !== "society") return false
  if (scopeType !== clean(assignment.getString("scopeType"))) return false
  if (normalizedRoleCode !== clean(assignment.getString("roleCode"))) return false
  if (clean(assignment.getString("event"))) return false
  if (scopeType === "society") {
    var societyId = execomResolveSocietyId(app, member)
    if (!societyId || societyId !== clean(assignment.getString("society"))) return false
  } else if (clean(assignment.getString("society"))) {
    return false
  }

  if ((member.getString("activeFrom") || "") !== (assignment.getString("startsAt") || "")) return false
  if ((member.getString("activeUntil") || "") !== (assignment.getString("endsAt") || "")) return false
  return true
}

function setIfChanged(record, name, value) {
  var current = record.get(name)
  if (String(current == null ? "" : current) === String(value == null ? "" : value)) return false
  record.set(name, value)
  return true
}

function deactivateAssignment(app, assignment) {
  if (!assignment || assignment.getString("source") !== "execom" || !assignment.getBool("active")) return false
  assignment.set("active", false)
  app.saveNoValidate(assignment)
  return true
}

function ownedActiveAssignments(app, sourceId) {
  try {
    return app.findRecordsByFilter(
      "organization_assignments",
      "source = 'execom' && sourceExecom = {:source} && active = true",
      "created,id",
      0,
      0,
      { source: sourceId }
    )
  } catch (_) {
    return []
  }
}

function backlinkAssignment(app, record) {
  var id = clean(record.getString("assignment"))
  if (!id) return null
  try { return app.findRecordById("organization_assignments", id) } catch (_) { return null }
}

function saveAssignmentMetadata(app, assignment, desired) {
  var changed = false
  changed = setIfChanged(assignment, "title", desired.title) || changed
  changed = setIfChanged(assignment, "term", desired.term) || changed
  changed = setIfChanged(assignment, "startsAt", desired.startsAt) || changed
  changed = setIfChanged(assignment, "endsAt", desired.endsAt) || changed
  changed = setIfChanged(assignment, "active", true) || changed
  changed = setIfChanged(assignment, "notes", "Synced from Execom record " + desired.sourceExecom) || changed
  if (changed) app.saveNoValidate(assignment)
  return changed
}

function syncExecomWorkspaceInTransaction(app, record) {
  var desired = desiredAssignment(app, record)
  var backlink = backlinkAssignment(app, record)
  var owned = ownedActiveAssignments(app, record.id)
  var changed = false

  // A legacy/corrupt backlink must never let this source mutate another
  // Execom record's or a manual assignment row.
  var backlinkAlreadyOwned = false
  if (backlink) {
    for (var ownedIndex = 0; ownedIndex < owned.length; ownedIndex++) {
      if (owned[ownedIndex].id === backlink.id) { backlinkAlreadyOwned = true; break }
    }
  }
  if (backlink && backlink.getString("source") === "execom" &&
      backlink.getString("sourceExecom") === record.id && !backlinkAlreadyOwned) {
    owned.push(backlink)
  }

  if (!desired) {
    for (var i = 0; i < owned.length; i++) changed = deactivateAssignment(app, owned[i]) || changed
    if (clean(record.getString("assignment"))) {
      record.set("assignment", "")
      app.saveNoValidate(record)
      changed = true
    }
    return changed
  }

  var current = null
  for (var j = 0; j < owned.length; j++) {
    if (assignmentSecurityMatches(owned[j], desired)) {
      if (!current) current = owned[j]
      else changed = deactivateAssignment(app, owned[j]) || changed
    } else {
      changed = deactivateAssignment(app, owned[j]) || changed
    }
  }

  if (!current && backlink && backlink.getString("source") === "execom" &&
      !clean(backlink.getString("sourceExecom")) &&
      backlink.getString("notes") === "Synced from Execom record " + record.id) {
    backlink.set("sourceExecom", record.id)
    app.saveNoValidate(backlink)
    current = assignmentSecurityMatches(backlink, desired) ? backlink : null
    changed = true
    if (!current) changed = deactivateAssignment(app, backlink) || changed
  }

  if (!current) {
    current = new Record(app.findCollectionByNameOrId("organization_assignments"), {
      user: desired.user,
      roleCode: desired.roleCode,
      scopeType: desired.scopeType,
      society: desired.society,
      event: desired.event,
      active: true,
      source: "execom",
      sourceExecom: desired.sourceExecom,
      title: desired.title,
      term: desired.term,
      startsAt: desired.startsAt,
      endsAt: desired.endsAt,
      notes: "Synced from Execom record " + desired.sourceExecom,
    })
    app.saveNoValidate(current)
    changed = true
  } else {
    changed = saveAssignmentMetadata(app, current, desired) || changed
  }

  if (clean(record.getString("assignment")) !== current.id) {
    record.set("assignment", current.id)
    app.saveNoValidate(record)
    changed = true
  }
  return changed
}

function syncExecomWorkspace(record) {
  if (!record || !record.id) return true
  var ok = true
  try {
    $app.runInTransaction(function (txApp) {
      var current = txApp.findRecordById("execom", record.id)
      syncExecomWorkspaceInTransaction(txApp, current)
    })
  } catch (err) {
    ok = false
    console.log("[workspace] transactional Execom sync failed for " + record.id + ":", err)
  }
  return ok
}

function deactivateExecomSource(record) {
  if (!record || !record.id) return true
  var ok = true
  try {
    $app.runInTransaction(function (txApp) {
      var rows = ownedActiveAssignments(txApp, record.id)
      var backlink = backlinkAssignment(txApp, record)
      var backlinkAlreadyOwned = false
      if (backlink) {
        for (var ownedIndex = 0; ownedIndex < rows.length; ownedIndex++) {
          if (rows[ownedIndex].id === backlink.id) { backlinkAlreadyOwned = true; break }
        }
      }
      var backlinkSource = backlink ? clean(backlink.getString("sourceExecom")) : ""
      var backlinkNote = backlink ? clean(backlink.getString("notes")) : ""
      var backlinkOwnedByDeletedSource = backlink && backlink.getString("source") === "execom" &&
        (backlinkSource === record.id ||
          (!backlinkSource && backlinkNote === "Synced from Execom record " + record.id))
      if (backlinkOwnedByDeletedSource && !backlinkAlreadyOwned) rows.push(backlink)
      for (var i = 0; i < rows.length; i++) deactivateAssignment(txApp, rows[i])
    })
  } catch (err) {
    ok = false
    console.log("[workspace] transactional Execom revoke failed for " + record.id + ":", err)
  }
  return ok
}

function reconcileExecomWorkspace() {
  var stats = { sources: 0, syncFailures: 0, revokedOrphans: 0 }
  var members = []
  try { members = $app.findRecordsByFilter("execom", "1 = 1", "id", 0, 0) } catch (err) {
    console.log("[workspace] Execom reconciliation could not list sources:", err)
    return stats
  }

  stats.sources = members.length
  for (var i = 0; i < members.length; i++) {
    if (!syncExecomWorkspace(members[i])) stats.syncFailures++
  }

  var assignments = []
  try {
    assignments = $app.findRecordsByFilter(
      "organization_assignments",
      "source = 'execom' && active = true",
      "id",
      0,
      0
    )
  } catch (err) {
    console.log("[workspace] Execom reconciliation could not list assignments:", err)
    stats.syncFailures++
    return stats
  }

  for (var j = 0; j < assignments.length; j++) {
    var assignment = assignments[j]
    if (assignmentSourceCurrent($app, assignment)) continue
    try {
      $app.runInTransaction(function (txApp) {
        var current = txApp.findRecordById("organization_assignments", assignment.id)
        if (current.getString("source") === "execom" && current.getBool("active")) {
          deactivateAssignment(txApp, current)
        }
      })
      stats.revokedOrphans++
    } catch (err) {
      stats.syncFailures++
      console.log("[workspace] failed to revoke stale Execom assignment " + assignment.id + ":", err)
    }
  }

  if (stats.syncFailures || stats.revokedOrphans) {
    console.log("[workspace] Execom reconciliation:", JSON.stringify(stats))
  }
  return stats
}

module.exports = {
  assignmentSourceCurrent: assignmentSourceCurrent,
  deactivateExecomSource: deactivateExecomSource,
  reconcileExecomWorkspace: reconcileExecomWorkspace,
  syncExecomWorkspace: syncExecomWorkspace,
}
