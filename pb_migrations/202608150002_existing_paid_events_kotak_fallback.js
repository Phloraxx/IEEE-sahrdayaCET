/// <reference path="../pb_data/types.d.ts" />

// Razorpay is still in activation/test mode on the production account. Protect
// paid events that are already published and accepting registrations at deploy
// time by routing them to the temporary Kotak fallback. New events keep the
// explicit admin-selected/default provider and can move to Razorpay once live.
migrate((app) => {
  const siteUrl = String($os.getenv("SITE_URL") || "").trim().toLowerCase()
  if (siteUrl !== "https://ieeesahrdaya.com" && siteUrl !== "http://ieeesahrdaya.com") return

  const events = app.findCollectionByNameOrId("events")
  if (!events.fields.getByName("paymentProvider")) return
  const rows = app.findRecordsByFilter(
    "events",
    "price > 0 && registrationOpen = true && status = {:published}",
    "", 0, 0, { published: "published" },
  )
  for (const row of rows) {
    const mode = row.getString("registrationMode") || "internal"
    if (mode === "external" || mode === "closed") continue
    row.set("paymentProvider", "kotak")
    app.saveNoValidate(row)
  }
}, (app) => {
  // Deliberately non-destructive. Provider changes may already have active
  // registrations by the time a rollback is considered.
})
