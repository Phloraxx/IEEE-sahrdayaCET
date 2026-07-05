
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
}, "blogs");

onRecordDeleteRequest((e) => {
    var role = "";
    try {
        // e.requestInfo.auth is the authRecord associated with this request
        if (e.requestInfo && e.requestInfo.auth) {
            role = e.requestInfo.auth.getString("role");
        }
    } catch (err) {}

    // Enforce admin-only deletions based on the role check you requested
    if (role !== "admin") {
        throw new BadRequestError("Only admins can delete blogs.");
    }
}, "blogs");
