/// <reference path="../pb_data/types.d.ts" />

// Temporary staging-only acceptance helper. It is inert in every non-staging
// environment and requires a one-time code file in pb_data. Remove before main.
routerAdd("POST", "/api/staging/test-login", function (e) {
  if (String($os.getenv("SITE_URL") || "") !== "https://staging.ieeesahrdaya.com") {
    return e.json(404, { error: "Not found" })
  }

  var body = {}
  try { body = e.requestInfo().body || {} } catch (_) { body = {} }
  var supplied = String(body.code || "").trim()
  if (!supplied) return e.json(403, { error: "Invalid or expired staging login" })

  var tokenPath = $app.dataDir() + "/staging-admin-login.json"
  var claimPath = tokenPath + ".used"
  var raw = null
  try { raw = $os.readFile(tokenPath) } catch (_) {
    return e.json(403, { error: "Invalid or expired staging login" })
  }

  var text = ""
  if (typeof raw === "string") text = raw
  else if (raw && typeof raw.string === "function") text = String(raw.string())
  else if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) text += String.fromCharCode(Number(raw[i]) || 0)
  } else text = String(raw || "")

  var payload = {}
  try { payload = JSON.parse(text) } catch (_) {
    return e.json(403, { error: "Invalid or expired staging login" })
  }
  if (String(payload.code || "") !== supplied || Number(payload.expiresAt || 0) <= Date.now()) {
    return e.json(403, { error: "Invalid or expired staging login" })
  }

  try { $os.rename(tokenPath, claimPath) } catch (_) {
    return e.json(403, { error: "Invalid or expired staging login" })
  }

  try {
    var email = String(payload.email || "").trim().toLowerCase()
    var user = $app.findFirstRecordByFilter("users", "email = {:email}", { email: email })
    if (!user || user.getString("role") !== "admin") {
      return e.json(403, { error: "Staging administrator is not configured" })
    }
    // 1 hour non-refreshable token; the frontend explicitly skips authRefresh for this marker.
    var token = user.newStaticAuthToken(60 * 60 * 1000000000)
    return e.json(200, {
      token: token,
      record: {
        id: user.id,
        email: user.getString("email") || "",
        name: user.getString("name") || user.getString("display_name") || "",
        role: user.getString("role") || "user",
        verified: user.getBool("verified"),
        collectionName: "users"
      }
    })
  } finally {
    try { $os.remove(claimPath) } catch (_) {}
  }
})
