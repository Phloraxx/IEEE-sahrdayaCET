/// <reference path="../pb_data/types.d.ts" />

const TEST_BLOG_ID = "qq8mrrnc6uphmw8"

function findLegacyTestBlog(app) {
  try {
    const record = app.findRecordById("blogs", TEST_BLOG_ID)
    const isExpectedRecord =
      record.getString("slug") === "test-123" &&
      record.getString("title").trim().toUpperCase() === "TEST"
    return isExpectedRecord ? record : null
  } catch (_) {
    return null
  }
}

migrate(
  (app) => {
    const record = findLegacyTestBlog(app)
    if (!record) return

    record.set("published", false)
    app.save(record)
  },
  (app) => {
    const record = findLegacyTestBlog(app)
    if (!record) return

    record.set("published", true)
    app.save(record)
  }
)
