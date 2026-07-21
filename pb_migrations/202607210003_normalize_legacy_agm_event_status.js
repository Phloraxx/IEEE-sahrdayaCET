/// <reference path="../pb_data/types.d.ts" />

const LEGACY_AGM_EVENT_ID = "6nf000tgyzcpq49"
const LEGACY_AGM_TITLE = "IEEE AGM '26"
const LEGACY_AGM_DATE = "2026-03-30 00:00:00.000Z"

function findLegacyAgmEvent(app) {
  try {
    const record = app.findRecordById("events", LEGACY_AGM_EVENT_ID)
    const isExpectedRecord =
      record.getString("title") === LEGACY_AGM_TITLE &&
      record.getString("date") === LEGACY_AGM_DATE &&
      record.getBool("isDeleted") === false
    return isExpectedRecord ? record : null
  } catch (_) {
    return null
  }
}

migrate(
  (app) => {
    const record = findLegacyAgmEvent(app)
    if (!record || record.getString("status") !== "") return
    record.set("status", "completed")
    app.save(record)
  },
  (app) => {
    const record = findLegacyAgmEvent(app)
    if (!record || record.getString("status") !== "completed") return
    record.set("status", "")
    app.save(record)
  }
)
