/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const deleteCollectionIfPresent = (name) => {
    let collection = null
    try { collection = app.findCollectionByNameOrId(name) } catch (_) { return }
    app.delete(collection)
  }

  // Delete children before parents so relation constraints never need to carry
  // tournament state past the decommission boundary.
  [
    "fifa_transactions",
    "fifa_bets",
    "fifa_bet_markets",
    "fifa_feed_events",
    "fifa_settings",
    "fifa_matches",
  ].forEach(deleteCollectionIfPresent)

  const users = app.findCollectionByNameOrId("users")
  users.updateRule = '(id = @request.auth.id && @request.body.role:changed = false && @request.body.display_name:changed = false && @request.body.name:changed = false) || (@request.auth.role = "admin" && @request.body.role:changed = false)'
  const balance = users.fields.getByName("balance")
  if (balance) users.fields.removeById(balance.id)
  app.save(users)
}, () => {
  throw new Error("WC Predict decommission is intentionally irreversible; restore the pre-decommission PocketBase/files backup to recover tournament data")
})
