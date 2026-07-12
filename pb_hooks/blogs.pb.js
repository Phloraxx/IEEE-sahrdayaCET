
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
    e.next()
}, "blogs");

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

    if (role !== "admin" && role !== "content") {
        throw new BadRequestError("Only admins and content editors can delete blogs.");
    }

    e.next()
}, "blogs");