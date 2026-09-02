/// <reference path="../pb_data/types.d.ts" />

// The long-lived CSS society record drifted between environments: staging used
// a Communications Society name/bio while the slug and logo belong to IEEE CSS.
// Normalize the identity without changing the record id, logo or relations.
migrate((app) => {
  let society = null
  try { society = app.findFirstRecordByFilter("societies", "slug = 'css'") } catch (_) {}
  if (!society) return

  society.set("name", "Control Systems Society")
  society.set(
    "bio",
    "Advancing research, development, and practice in automation, dynamic systems, and control engineering."
  )
  app.saveNoValidate(society)
}, (_app) => {
  // Forward-only content correction.
})
