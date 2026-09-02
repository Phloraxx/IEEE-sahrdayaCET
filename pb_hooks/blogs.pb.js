
onRecordCreateRequest((e) => {
    var record = e.record;
    var slug = record.getString("slug");
    
    if (!slug) {
        var title = record.getString("title") || "";
        var generated = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
        record.set("slug", generated);
    }
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (_) { auth = null }
    if (auth && auth.id && auth.getString("role") !== "admin" && auth.getString("role") !== "content") {
        var authz = require(__hooks + "/workspace-authorization.js")
        if (!authz.hasCapability($app, auth, "content.manage", { societyId: record.getString("society") || "", eventId: record.getString("event") || "" })) {
            throw e.forbiddenError("You cannot create content in this scope")
        }
        record.set("relation", auth.id)
    }
    e.next()
}, "blogs");

onRecordUpdateRequest((e) => {
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (_) { auth = null }
    if (!auth || !auth.id) throw e.forbiddenError("Authentication required")
    var role = auth.getString("role") || ""
    if (role === "admin") { e.next(); return }
    if (role === "content") {
        var old = $app.findRecordById("blogs", e.record.id)
        if (old.getString("relation") !== auth.id || e.record.getString("relation") !== old.getString("relation")) {
            throw e.forbiddenError("Content editors may only edit their own posts")
        }
        e.next(); return
    }
    var authz = require(__hooks + "/workspace-authorization.js")
    if (!authz.hasCapability($app, auth, "content.manage", {
        societyId: e.record.getString("society") || "",
        eventId: e.record.getString("event") || ""
    })) throw e.forbiddenError("You cannot move or edit content outside your scope")
    e.record.set("relation", auth.id)
    e.next()
}, "blogs")

onRecordDeleteRequest((e) => {
    var auth = null
    try { auth = e.auth || (e.requestInfo && e.requestInfo.auth) || null } catch (err) { auth = null }

    var role = ""
    if (auth) {
        try {
            if (auth.isSuperuser && auth.isSuperuser()) {
                role = "admin"
            } else {
                role = auth.getString("role") || ""
            }
        } catch (err) { role = "" }
    }

    if (role === "admin") { e.next(); return }
    if (role === "content") {
        var current = $app.findRecordById("blogs", e.record.id)
        if (current.getString("relation") !== auth.id) throw e.forbiddenError("Content editors may only delete their own posts")
        e.next(); return
    }
    var authz = require(__hooks + "/workspace-authorization.js")
    if (!authz.hasCapability($app, auth, "content.manage", {
        societyId: e.record.getString("society") || "", eventId: e.record.getString("event") || ""
    })) throw e.forbiddenError("You cannot delete content outside your scope")

    e.next()
}, "blogs");