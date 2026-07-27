/// <reference path="../pb_data/types.d.ts" />

// Role changes deliberately bypass the users collection updateRule only through
// this admin-only command. Normal record updates can never change `role`.
routerAdd(
  "POST",
  "/api/app/admin/users/{id}/role",
  function (e) {
    var auth = e.auth
    if (!auth || auth.getString("role") !== "admin") {
      return e.json(403, { error: "Admin only" })
    }

    var body = {}
    try { body = e.requestInfo().body || {} } catch (_) {
      try { body = JSON.parse(toString(e.request.body) || "{}") } catch (__) { body = {} }
    }

    var nextRole = String(body.role || "")
    var allowed = ["user", "chair", "admin", "content"]
    if (allowed.indexOf(nextRole) === -1) {
      return e.json(400, { error: "Invalid role" })
    }

    var id = e.request.pathValue("id")
    if (id === auth.id && nextRole !== "admin") {
      return e.json(400, { error: "You cannot demote your own admin account" })
    }

    var target
    try { target = $app.findRecordById("users", id) }
    catch (_) { return e.json(404, { error: "User not found" }) }

    target.set("role", nextRole)
    $app.save(target)
    return e.json(200, {
      success: true,
      user: { id: target.id, role: target.getString("role") },
    })
  },
  $apis.requireAuth("users")
)
