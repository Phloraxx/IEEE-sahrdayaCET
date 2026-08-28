// Explicit date-only/time-TBC state for public events. Do not infer this at render time.
// Known schedule placeholders are migrated once so midnight is no longer presented as 12:00 am.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  if (!events.fields.getByName("timeTbc")) {
    events.fields.add(new BoolField({ name: "timeTbc" }))
    app.save(events)
  }

  const slugs = [
    "biofusion-overnight-hackathon-2026",
    "intro-to-pcb-designing-workshop-2026",
    "signals-unplugged-theory-to-real-world-2026",
    "robo-morph-2026",
    "fire-and-safety-awareness-program-2026",
    "hardware-hackathon-2026",
    "cuda-programming-tutorial-workshop-2026",
    "art-of-hardware-hacking-workshop-2026",
  ]

  for (const slug of slugs) {
    let event = null
    try { event = app.findFirstRecordByFilter("events", `slug = '${slug}'`) } catch (_) {}
    if (!event) continue
    event.set("timeTbc", true)
    app.saveNoValidate(event)
  }
}, (_app) => {
  // Forward-only data correction. Do not silently restore placeholder midnight times.
})
