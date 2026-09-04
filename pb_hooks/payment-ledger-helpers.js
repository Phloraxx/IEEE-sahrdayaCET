/// <reference path="../pb_data/types.d.ts" />

function findLatestForRegistration(app, registrationId) {
  try {
    var rows = app.findRecordsByFilter(
      "payments",
      "registration = {:registration}",
      "-created",
      1,
      0,
      { registration: String(registrationId || "") }
    )
    return rows.length ? rows[0] : null
  } catch (_) {
    return null
  }
}

module.exports = { findLatestForRegistration: findLatestForRegistration }
